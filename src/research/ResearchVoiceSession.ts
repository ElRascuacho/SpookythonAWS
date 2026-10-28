import { z } from "zod";
import { isReportOffer, reportConsent } from "./reportConsent";
export type VoiceState =
  "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
export type VoiceTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
};
export interface VoiceCallbacks {
  status: (state: VoiceState, message?: string) => void;
  propose: (text: string, signal: AbortSignal) => Promise<string>;
  context: () => unknown;
  report?: () => unknown;
  transcript: (turn: VoiceTurn) => void;
  partial: (text: string) => void;
  level: (value: number) => void;
}
const Session = z.object({
  client_secret: z.string().min(1),
  model: z.string().min(1),
  expires_at: z.number(),
  max_seconds: z.number().positive().max(180),
});
const ProposalArgs = z
  .object({ message: z.string().trim().min(1).max(2000) })
  .strict();
const EmptyArgs = z.object({}).strict();
/** Native conversational Realtime transport. Terra is a bounded proposal tool, not a turn relay. */
export class ResearchVoiceSession {
  private generation = 0;
  private stream: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private audio: HTMLAudioElement | null = null;
  private controller: AbortController | null = null;
  private turnController = new AbortController();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private seen = new Set<string>();
  private pending = new Set<string>();
  private turn = 0;
  private reportOffer: { turn: number; at: number } | null = null;
  private userTranscript: { turn: number; text: string } | null = null;
  private inputTurns = new Map<string, number>();
  private reportedTurn = -1;
  private toolCount = 0;
  private proposed = false;
  private responseActive = false;
  private responseId = "";
  private cancelledResponses = new Set<string>();
  private continuation = false;
  private speaking = false;
  private sessionId = "";
  private audioContext: AudioContext | null = null;
  private analysers: AnalyserNode[] = [];
  private meterFrame = 0;
  constructor(private cb: VoiceCallbacks) {}
  static supported() {
    return Boolean(
      window.isSecureContext &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof window.RTCPeerConnection === "function",
    );
  }
  private send(value: unknown) {
    if (this.channel?.readyState === "open")
      this.channel.send(JSON.stringify(value));
  }
  stop() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.turnController.abort();
    this.timers.forEach(clearTimeout);
    this.timers = [];
    cancelAnimationFrame(this.meterFrame);
    this.meterFrame = 0;
    this.analysers = [];
    if (this.audioContext) void this.audioContext.close().catch(() => {});
    this.audioContext = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.channel) {
      this.channel.onopen = null;
      this.channel.onmessage = null;
      this.channel.close();
      this.channel = null;
    }
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
      this.audio.remove();
      this.audio = null;
    }
    this.pending.clear();
    this.reportOffer = null;
    this.userTranscript = null;
    this.inputTurns.clear();
    this.reportedTurn = -1;
    this.seen.clear();
    this.responseActive = false;
    this.responseId = "";
    this.cancelledResponses.clear();
    this.continuation = false;
    this.speaking = false;
    this.cb.level(0);
    this.cb.partial("");
    this.cb.status("idle");
  }
  private fail(message: string) {
    this.stop();
    this.cb.status("error", message);
  }
  private attachMeter(stream: MediaStream) {
    if (!this.audioContext) return;
    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.analysers.push(analyser);
    } catch {
      /* Meter is optional; voice must keep working. */
    }
  }
  private startMeter() {
    let previous = 0;
    const data = new Float32Array(256);
    const tick = (now: number) => {
      if (now - previous > 40) {
        let peak = 0;
        for (const analyser of this.analysers) {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (const n of data) sum += n * n;
          peak = Math.max(peak, Math.sqrt(sum / data.length));
        }
        this.cb.level(Math.min(1, peak * 6));
        previous = now;
      }
      this.meterFrame = requestAnimationFrame(tick);
    };
    this.meterFrame = requestAnimationFrame(tick);
  }
  interrupt(automatic = false) {
    this.turn++;
    this.turnController.abort();
    this.turnController = new AbortController();
    for (const id of this.pending)
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: id,
          output: JSON.stringify({
            error:
              "Consulta interrumpida por el usuario. No se confirmó ni aplicó ninguna medida.",
          }),
        },
      });
    this.pending.clear();
    this.continuation = false;
    if (this.responseId) this.cancelledResponses.add(this.responseId);
    // With WebRTC the server cancels/truncates unplayed audio on VAD interruption.
    // Never estimate audio_end_ms from wall time: generation and playout are different clocks.
    if (!automatic) {
      if (this.responseActive) this.send({ type: "response.cancel" });
      if (this.speaking) this.send({ type: "output_audio_buffer.clear" });
    }
    this.responseActive = false;
    this.speaking = false;
    this.cb.partial("");
    this.cb.status("listening");
  }
  private continueResponse() {
    if (this.continuation && !this.responseActive && this.pending.size === 0) {
      this.continuation = false;
      this.send({ type: "response.create" });
    }
  }
  async start() {
    this.stop();
    const generation = this.generation;
    this.sessionId = crypto.randomUUID();
    this.turn = 0;
    this.toolCount = 0;
    this.proposed = false;
    this.turnController = new AbortController();
    if (!ResearchVoiceSession.supported()) {
      this.cb.status(
        "error",
        "La voz requiere HTTPS o localhost y un navegador con WebRTC.",
      );
      return;
    }
    this.cb.status("connecting");
    const controller = new AbortController();
    this.controller = controller;
    if (typeof window.AudioContext === "function") {
      try {
        this.audioContext = new AudioContext();
        void this.audioContext.resume().catch(() => {});
      } catch {
        /* Optional visualization. */
      }
    }
    const startup = setTimeout(() => {
      if (this.generation === generation)
        this.fail("No se pudo conectar la voz a tiempo.");
    }, 15000);
    this.timers.push(startup);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (this.generation !== generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.attachMeter(stream);
      this.startMeter();
      const response = await fetch("/api/research/voice/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.message || "No se pudo habilitar la voz.");
      const session = Session.parse(body);
      if (this.generation !== generation) return;
      if (session.expires_at <= Date.now() / 1000)
        throw Error("La credencial temporal de voz caducó.");
      const pc = new RTCPeerConnection();
      this.pc = pc;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.hidden = true;
      document.body.append(audio);
      this.audio = audio;
      pc.ontrack = (e) => {
        const remote = e.streams[0] ?? new MediaStream([e.track]);
        audio.srcObject = remote;
        this.attachMeter(remote);
        void audio.play().catch(() => {
          if (this.generation === generation)
            this.fail(
              "El navegador bloqueó el audio. Vuelve a iniciar con un clic.",
            );
        });
      };
      pc.onconnectionstatechange = () => {
        if (
          this.generation === generation &&
          ["failed", "disconnected"].includes(pc.connectionState)
        )
          this.fail(
            "La conexión de voz se interrumpió. El micrófono se cerró.",
          );
      };
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const channel = pc.createDataChannel("oai-events");
      this.channel = channel;
      channel.onopen = () => {
        clearTimeout(startup);
        this.cb.status("listening");
        this.timers.push(
          setTimeout(() => {
            if (this.generation === generation) {
              this.stop();
              this.cb.status(
                "idle",
                "Sesión finalizada al alcanzar tres minutos.",
              );
            }
          }, session.max_seconds * 1000),
        );
      };
      channel.onmessage = (e) => {
        if (this.generation === generation)
          void this.event(e.data, generation, controller.signal);
      };
      const offer = await pc.createOffer();
      if (this.generation !== generation) return;
      await pc.setLocalDescription(offer);
      if (this.generation !== generation) return;
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.client_secret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
        signal: controller.signal,
      });
      if (!answer.ok)
        throw Error(
          "OpenAI no pudo conectar el canal de voz. Comprueba acceso al modelo.",
        );
      const sdp = await answer.text();
      if (this.generation !== generation) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
    } catch (e) {
      if (this.generation !== generation) return;
      this.fail(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permite el micrófono para hablar con el agente."
          : e instanceof Error
            ? e.message
            : "No se pudo conectar la voz.",
      );
    }
  }
  private async tool(
    e: Record<string, any>,
    generation: number,
    signal: AbortSignal,
  ) {
    const id = typeof e.call_id === "string" ? e.call_id : "";
    if (!id || this.seen.has(`tool:${id}`)) return;
    this.seen.add(`tool:${id}`);
    if (++this.toolCount > 3) {
      this.fail(
        "Se cerró la voz porque el agente encadenó demasiadas consultas. No se confirmó ni aplicó ninguna medida.",
      );
      return;
    }
    const turn = this.turn;
    this.pending.add(id);
    this.cb.status("thinking");
    let output: unknown;
    try {
      if (typeof e.arguments !== "string" || e.arguments.length > 6000)
        throw Error("Argumentos de herramienta inválidos.");
      const args = JSON.parse(e.arguments);
      if (e.name === "get_research_context") {
        EmptyArgs.parse(args);
        output = { context: this.cb.context(), read_only: true };
      } else if (e.name === "generate_research_report") {
        EmptyArgs.parse(args);
        if (!this.cb.report)
          throw Error("El reporte no está disponible en esta vista.");
        if (this.reportedTurn === turn)
          throw Error("Ya se generó un reporte para esta petición.");
        // Audio transcription can arrive after the native model has chosen a tool.
        for (
          let attempt = 0;
          attempt < 30 && this.userTranscript?.turn !== turn;
          attempt++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (
            signal.aborted ||
            generation !== this.generation ||
            turn !== this.turn
          )
            return;
        }
        const offered =
          this.reportOffer?.turn === turn - 1 &&
          Date.now() - this.reportOffer.at < 90000;
        if (
          this.userTranscript?.turn !== turn ||
          !reportConsent(this.userTranscript.text, offered)
        )
          throw Error(
            "Falta aceptación explícita del usuario. Pregunta si quiere generar el reporte; no lo generes todavía.",
          );
        output = this.cb.report();
        this.reportedTurn = turn;
        this.reportOffer = null;
      } else if (e.name === "propose_measure") {
        if (this.proposed)
          throw Error(
            "Ya se solicitó una propuesta en esta intervención. No repetir automáticamente.",
          );
        const parsed = ProposalArgs.parse(args);
        this.proposed = true;
        const reply = await this.cb.propose(
          parsed.message,
          AbortSignal.any([signal, this.turnController.signal]),
        );
        output = { reply };
      } else
        throw Error(
          "Herramienta no permitida. No existen herramientas para confirmar, aplicar o avanzar días.",
        );
    } catch (err) {
      output = {
        error:
          err instanceof Error
            ? err.message
            : "No se pudo preparar la propuesta.",
        applied: false,
      };
    }
    if (generation !== this.generation || turn !== this.turn || signal.aborted)
      return;
    this.pending.delete(id);
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: id,
        output: JSON.stringify(output),
      },
    });
    this.continuation = true;
    this.continueResponse();
  }
  private async event(raw: unknown, generation: number, signal: AbortSignal) {
    let e: Record<string, any>;
    try {
      if (typeof raw !== "string" || raw.length > 100000) return;
      e = JSON.parse(raw);
      if (!e || typeof e !== "object") return;
    } catch {
      return;
    }
    if (e.response_id && this.cancelledResponses.has(e.response_id)) return;
    switch (e.type) {
      case "error":
        if (
          [
            "response_cancel_not_active",
            "output_audio_buffer_empty",
            "conversation_already_has_active_response",
          ].includes(e.error?.code)
        )
          return;
        this.fail("El servicio de voz devolvió un error. Vuelve a conectar.");
        return;
      case "input_audio_buffer.speech_started":
        this.interrupt(true);
        if (typeof e.item_id === "string")
          this.inputTurns.set(e.item_id, this.turn);
        this.toolCount = 0;
        this.proposed = false;
        return;
      case "input_audio_buffer.speech_stopped":
        this.cb.status("thinking");
        return;
      case "response.created":
        this.responseId = e.response?.id ?? "";
        this.responseActive = true;
        return;
      case "response.done":
        if (this.cancelledResponses.has(e.response?.id)) return;
        this.responseActive = false;
        if (e.response?.status === "failed") {
          this.fail("No se pudo generar la respuesta hablada.");
          return;
        }
        this.continueResponse();
        if (!this.speaking && !this.pending.size && !this.continuation)
          this.cb.status("listening");
        return;
      case "output_audio_buffer.started":
        this.speaking = true;
        this.cb.status("speaking");
        return;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.speaking = false;
        if (!this.pending.size) this.cb.status("listening");
        return;
      case "conversation.item.input_audio_transcription.failed":
        this.cb.status("listening", "No entendí esa frase. Puedes repetirla.");
        return;
      case "conversation.item.input_audio_transcription.completed": {
        if (typeof e.transcript !== "string" || !e.transcript.trim()) return;
        const id = `${this.sessionId}:user:${e.item_id}`;
        if (this.seen.has(id)) return;
        this.seen.add(id);
        this.userTranscript = {
          turn: this.inputTurns.get(e.item_id) ?? this.turn,
          text: e.transcript.trim().slice(0, 2000),
        };
        this.cb.transcript({
          id,
          role: "user",
          text: e.transcript.trim().slice(0, 2000),
        });
        return;
      }
      case "response.output_audio_transcript.delta":
        if (typeof e.delta === "string") this.cb.partial(e.delta);
        return;
      case "response.output_audio_transcript.done": {
        if (typeof e.transcript !== "string") return;
        const id = `${this.sessionId}:assistant:${e.item_id ?? e.response_id}`;
        if (this.seen.has(id)) return;
        this.seen.add(id);
        if (isReportOffer(e.transcript))
          this.reportOffer = { turn: this.turn, at: Date.now() };
        this.cb.transcript({
          id,
          role: "assistant",
          text: e.transcript.slice(0, 6000),
        });
        this.cb.partial("");
        return;
      }
      case "response.function_call_arguments.done":
        await this.tool(e, generation, signal);
        return;
    }
  }
}
