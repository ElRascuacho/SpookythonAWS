import { describe, test, expect, mock } from "bun:test";
import { ResearchVoiceSession } from "../ResearchVoiceSession";
function setup(
  propose = mock(
    async (_text: string, _signal: AbortSignal) =>
      "Propuesta pendiente de revisión",
  ),
) {
  const sent: Record<string, any>[] = [];
  const cb = {
    status: mock(() => {}),
    propose,
    report: mock(() => ({ generated: true })),
    context: mock(() => ({ day: 2, totalI: 17 })),
    transcript: mock(() => {}),
    partial: mock(() => {}),
    level: mock(() => {}),
  };
  const session = new ResearchVoiceSession(cb);
  const internals = session as unknown as {
    channel: unknown;
    event: (
      raw: string,
      generation: number,
      signal: AbortSignal,
    ) => Promise<void>;
  };
  internals.channel = {
    readyState: "open",
    send: (raw: string) => sent.push(JSON.parse(raw)),
  };
  return {
    session,
    cb,
    sent,
    event: (e: Record<string, unknown>) =>
      internals.event(JSON.stringify(e), 0, new AbortController().signal),
  };
}
describe("native research voice", () => {
  test("transcription and direct assistant speech never query Terra; duplicate transcripts are suppressed", async () => {
    const { cb, event, sent } = setup();
    await event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "u1",
      transcript: "¿Qué significa movilidad?",
    });
    await event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "u1",
      transcript: "¿Qué significa movilidad?",
    });
    await event({
      type: "response.output_audio_transcript.delta",
      delta: "Es el desplazamiento",
    });
    await event({
      type: "response.output_audio_transcript.done",
      item_id: "a1",
      transcript: "Es el desplazamiento entre zonas.",
    });
    expect(cb.propose).not.toHaveBeenCalled();
    expect(cb.transcript).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(0);
  });
  test("context is read-only, and tool continuation waits for response.done", async () => {
    const { cb, event, sent } = setup();
    await event({ type: "response.created", response: { id: "r1" } });
    await event({
      type: "response.function_call_arguments.done",
      call_id: "c1",
      name: "get_research_context",
      arguments: "{}",
    });
    expect(cb.context).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sent[0].item.output)).toEqual({
      context: { day: 2, totalI: 17 },
      read_only: true,
    });
    expect(sent.filter((e) => e.type === "response.create")).toHaveLength(0);
    await event({
      type: "response.done",
      response: { id: "r1", status: "completed" },
    });
    expect(sent.filter((e) => e.type === "response.create")).toHaveLength(1);
  });
  test("only explicit proposal tool delegates to Terra once per user intervention", async () => {
    const { event, cb, sent } = setup();
    const call = {
      type: "response.function_call_arguments.done",
      call_id: "c1",
      name: "propose_measure",
      arguments: JSON.stringify({ message: "Reducir contactos en Tarqui" }),
    };
    await event(call);
    await event(call);
    await event({ ...call, call_id: "c2" });
    expect(cb.propose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sent[0].item.output).applied).toBe(false);
    expect(
      JSON.parse(sent.find((e) => e.item?.call_id === "c2")!.item.output).error,
    ).toContain("Ya se solicitó");
  });
  test("unknown tools and injected arguments never reach proposal handler", async () => {
    const { event, cb, sent } = setup();
    await event({
      type: "response.function_call_arguments.done",
      call_id: "apply",
      name: "apply_measure",
      arguments: "{}",
    });
    await event({
      type: "response.function_call_arguments.done",
      call_id: "extra",
      name: "propose_measure",
      arguments: '{"message":"hola","code":"run()"}',
    });
    expect(cb.propose).not.toHaveBeenCalled();
    expect(
      sent
        .filter((e) => e.item?.type === "function_call_output")
        .every((e) => JSON.parse(e.item.output).applied === false),
    ).toBe(true);
  });
  test("barge-in aborts a pending proposal and ignores late results and cancelled speech", async () => {
    let resolve!: (text: string) => void;
    let signal: AbortSignal | undefined;
    const { session, event, sent, cb } = setup(
      mock(async (_text: string, s: AbortSignal) => {
        signal = s;
        return new Promise<string>((r) => (resolve = r));
      }),
    );
    await event({ type: "response.created", response: { id: "old" } });
    const pending = event({
      type: "response.function_call_arguments.done",
      call_id: "c1",
      name: "propose_measure",
      arguments: '{"message":"Crear una medida"}',
    });
    session.interrupt();
    expect(signal?.aborted).toBe(true);
    resolve("LATE SUCCESS");
    await pending;
    await event({
      type: "response.output_audio_transcript.done",
      response_id: "old",
      item_id: "old-item",
      transcript: "Aplicado incorrectamente",
    });
    expect(cb.transcript).not.toHaveBeenCalled();
    expect(JSON.stringify(sent)).not.toContain("LATE SUCCESS");
    expect(sent.filter((e) => e.item?.call_id === "c1")).toHaveLength(1);
  });
  test("voice report offer waits for explicit acceptance in the next user turn", async () => {
    const { event, cb } = setup();
    await event({
      type: "response.output_audio_transcript.done",
      item_id: "offer",
      transcript: "¿Quieres que genere un reporte en vivo de este experimento?",
    });
    expect(cb.report).not.toHaveBeenCalled();
    await event({ type: "input_audio_buffer.speech_started", item_id: "yes" });
    await event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "yes",
      transcript: "Sí, por favor.",
    });
    await event({
      type: "response.function_call_arguments.done",
      call_id: "report1",
      name: "generate_research_report",
      arguments: "{}",
    });
    await event({
      type: "response.function_call_arguments.done",
      call_id: "report2",
      name: "generate_research_report",
      arguments: "{}",
    });
    expect(cb.report).toHaveBeenCalledTimes(1);
    expect(cb.propose).not.toHaveBeenCalled();
  });
  test("no, ambiguous consent, stale offers and model-injected confirmation never generate a report", async () => {
    for (const text of [
      "No, gracias",
      "¿Qué incluiría?",
      "Sí, pero no lo generes",
    ]) {
      const { event, cb } = setup();
      await event({
        type: "response.output_audio_transcript.done",
        item_id: "offer",
        transcript:
          "¿Quieres que genere un reporte en vivo de este experimento?",
      });
      await event({ type: "input_audio_buffer.speech_started", item_id: "u" });
      await event({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "u",
        transcript: text,
      });
      await event({
        type: "response.function_call_arguments.done",
        call_id: "r",
        name: "generate_research_report",
        arguments: "{}",
      });
      expect(cb.report).not.toHaveBeenCalled();
    }
    const { event, cb } = setup();
    await event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "u",
      transcript: "Sí",
    });
    await event({
      type: "response.function_call_arguments.done",
      call_id: "r",
      name: "generate_research_report",
      arguments: "{}",
    });
    await event({
      type: "response.function_call_arguments.done",
      call_id: "bad",
      name: "generate_research_report",
      arguments: '{"confirmed":true}',
    });
    expect(cb.report).not.toHaveBeenCalled();
  });
  test("direct report request works without an offer and waits for delayed transcription", async () => {
    const { event, cb } = setup();
    await event({ type: "input_audio_buffer.speech_started", item_id: "u" });
    const pending = event({
      type: "response.function_call_arguments.done",
      call_id: "r",
      name: "generate_research_report",
      arguments: "{}",
    });
    expect(cb.report).not.toHaveBeenCalled();
    await event({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "u",
      transcript: "Genera un reporte en vivo",
    });
    await pending;
    expect(cb.report).toHaveBeenCalledTimes(1);
  });
});
