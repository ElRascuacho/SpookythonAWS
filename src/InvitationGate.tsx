import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Dna,
  Eye,
  EyeOff,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  Radio,
  ShieldCheck,
} from "lucide-react";

const Workspace = lazy(() => import("./WorkspaceShell"));
const ModeShell = lazy(() => import("./ModeShell"));

async function access(path: string, credentials?: { email: string; password: string }) {
  const response = await fetch(`/api/auth/${path}`, {
    method: path === "session" ? "GET" : "POST",
    credentials: "same-origin",
    headers:
      path === "session" ? undefined : { "Content-Type": "application/json" },
    body:
      path === "session"
        ? undefined
        : JSON.stringify(credentials ?? {}),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const data = await response.json();
  return { response, data };
}

export default function InvitationGate() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [checkFailed, setCheckFailed] = useState(false);
  const requestId = useRef(0);
  const mutating = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error && !busy && !checkFailed && !expiresAt) input.current?.focus();
  }, [error, busy, checkFailed, expiresAt]);

  const checkSession = useCallback(async () => {
    if (mutating.current) return;
    const id = ++requestId.current;
    try {
      const { response, data } = await access("session");
      if (id !== requestId.current) return;
      if (response.ok) {
        setExpiresAt(data.expiresAt);
        setError("");
      } else if (response.status === 401) {
        setExpiresAt(null);
      } else {
        throw new Error(data.error || "No pudimos verificar el acceso.");
      }
      setCheckFailed(false);
    } catch (cause) {
      if (id !== requestId.current) return;
      setCheckFailed(true);
      setError(
        cause instanceof Error && cause.name === "Error"
          ? cause.message
          : "No hay conexión con el servidor. Revisa tu conexión y vuelve a intentar.",
      );
    } finally {
      if (id === requestId.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
    const onFocus = () => {
      if (!document.hidden) void checkSession();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      requestId.current++;
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [checkSession]);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(
      () => {
        requestId.current++;
        setExpiresAt(null);
        setError(
          "Tu sesión terminó. Inicia sesión para comenzar una nueva misión.",
        );
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    mutating.current = true;
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const { response, data } = await access("login", { email, password });
      if (id !== requestId.current) return;
      if (!response.ok) {
        setError(data.error || "No pudimos verificar tus credenciales.");
        return;
      }
      setPassword("");
      setVisible(false);
      setExpiresAt(data.expiresAt);
      setCheckFailed(false);
    } catch {
      if (id === requestId.current)
        setError(
          "No pudimos conectar. Vuelve a intentarlo.",
        );
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    mutating.current = true;
    const id = ++requestId.current;
    setBusy(true);
    try {
      const { response, data } = await access("logout");
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(data.error);
      setExpiresAt(null);
      setError("");
    } catch {
      setError(
        "No pudimos cerrar la sesión. Revisa tu conexión e inténtalo otra vez.",
      );
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  if (expiresAt)
    return (
      <>
        {error && (
          <div className="access-banner" role="alert">
            {error}{" "}
            <button onClick={() => void checkSession()}>Reintentar</button>
          </div>
        )}
        <Suspense
          fallback={
            <div className="access-loading" role="status">
              <LoaderCircle className="access-spinner" /> Preparando el centro
              de respuesta…
            </div>
          }
        >
          <ModeShell
            onLogout={logout}
            loggingOut={busy}
            renderApp={(props) => (
              <Workspace {...props} />
            )}
          />
        </Suspense>
      </>
    );

  return (
    <main className="access-page">
      <div className="access-cinematic" aria-hidden="true">
        <div className="access-cinematic-image" />
        <div className="access-cinematic-shade" />
      </div>
      <header className="access-header">
        <a className="access-brand" href="/" aria-label="Manta Cero, inicio">
          <span className="access-brand-icon">
            <Dna size={26} />
          </span>
          <span>
            MANTA CERO<small>OPERACIÓN DE RESPUESTA</small>
          </span>
        </a>
        <span className="access-private">
          <span /> ACCESO A LA OPERACIÓN
        </span>
      </header>
      <div className="access-layout">
        <section className="access-story" aria-labelledby="mission-title">
          <p className="access-eyebrow">
            <Radio size={14} /> TRANSMISIÓN DE EMERGENCIA <span>/</span> MANTA, ECUADOR
          </p>
          <h1 id="mission-title">
            La ciudad
            <br />
            aún respira.
            <br />
            <em>Encuentra la cura.</em>
          </h1>
          <p className="access-lead">
            El brote llegó a Manta. El tiempo se agota.
            <br />
            Cada decisión puede cambiar lo que viene.
          </p>
          <div className="access-radar" aria-hidden="true">
            <svg viewBox="0 0 600 230" fill="none">
              <defs>
                <radialGradient id="radar-glow">
                  <stop stopColor="#b1dfc8" stopOpacity=".12" />
                  <stop offset="1" stopColor="#b1dfc8" stopOpacity="0" />
                </radialGradient>
              </defs>
              <ellipse
                cx="300"
                cy="132"
                rx="235"
                ry="91"
                fill="url(#radar-glow)"
              />
              <g stroke="#b1dfc8" strokeOpacity=".12">
                <ellipse cx="300" cy="132" rx="235" ry="91" />
                <ellipse cx="300" cy="132" rx="168" ry="65" />
                <ellipse cx="300" cy="132" rx="95" ry="37" />
                <path d="M20 132H580M300 18V230M110 58L490 206M110 206L490 58" />
              </g>
              <path
                d="M96 152L166 100L246 128L314 65L391 114L495 90M166 100L210 191L246 128L358 182L391 114L488 175M96 152L210 191L358 182L488 175"
                stroke="#b1dfc8"
                strokeOpacity=".4"
                strokeDasharray="3 5"
              />
              <g fill="#b1dfc8">
                {[
                  [96, 152],
                  [166, 100],
                  [246, 128],
                  [314, 65],
                  [391, 114],
                  [495, 90],
                  [210, 191],
                  [358, 182],
                  [488, 175],
                ].map(([cx, cy]) => (
                  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" />
                ))}
              </g>
              <circle
                className="access-pulse"
                cx="314"
                cy="65"
                r="16"
                stroke="#f58a72"
                strokeOpacity=".5"
              />
              <circle cx="314" cy="65" r="5" fill="#f58a72" />
              <path d="M314 44V25H370" stroke="#f58a72" strokeOpacity=".5" />
              <text
                x="377"
                y="29"
                fill="#f58a72"
                fontSize="9"
                fontFamily="monospace"
                letterSpacing="1.5"
              >
                ORIGEN DEL BROTE
              </text>
              <text
                x="26"
                y="221"
                fill="#92a4aa"
                fontSize="9"
                fontFamily="monospace"
                letterSpacing="1.5"
              >
                RED URBANA · 16 ZONAS
              </text>
              <text
                x="443"
                y="221"
                fill="#92a4aa"
                fontSize="9"
                fontFamily="monospace"
                letterSpacing="1.5"
              >
                VISTA ESQUEMÁTICA
              </text>
            </svg>
          </div>
          <div className="access-mission">
            <span>01 / TU MISIÓN</span>
            <p>
              Contén el brote. Protege la ciudad.
              <br />
              <strong>Investiga hasta encontrar la cura.</strong>
            </p>
          </div>
        </section>
        <section className="access-card" aria-labelledby="access-title">
          <div className="access-card-top">
            <span>CONTROL DE ACCESO</span>
            <LockKeyhole size={16} />
          </div>
          <div className="access-card-body">
            <div className="access-fingerprint">
              <Fingerprint size={33} strokeWidth={1.3} />
            </div>
            <p className="access-eyebrow">INICIA SESIÓN</p>
            <h2 id="access-title">
              Tu lugar está en
              <br />
              el centro de respuesta.
            </h2>
            <p className="access-description">
              Ingresa tus credenciales para tomar el mando de la operación.
            </p>
            {checking ? (
              <div className="access-check" role="status">
                <LoaderCircle className="access-spinner" size={20} />{" "}
                Verificando tu acceso…
              </div>
            ) : (
              <form onSubmit={login}>
                <label htmlFor="login-email">Correo electrónico</label>
                <div className={`access-input${error && !checkFailed ? " has-error" : ""}`}>
                  <input ref={input} id="login-email" name="email" type="email"
                    value={email} onChange={(event) => { setEmail(event.target.value); if (!checkFailed) setError(""); }}
                    placeholder="tu@correo.com" autoComplete="username" maxLength={254}
                    required disabled={busy || checkFailed} aria-invalid={!!error && !checkFailed}
                    aria-describedby={error ? "login-error" : undefined} />
                </div>
                <label className="access-password-label" htmlFor="login-password">Contraseña</label>
                <div className={`access-input${error && !checkFailed ? " has-error" : ""}`}>
                  <input id="login-password" name="password" type={visible ? "text" : "password"}
                    value={password} onChange={(event) => { setPassword(event.target.value); if (!checkFailed) setError(""); }}
                    placeholder="Tu contraseña" autoComplete="current-password" maxLength={256}
                    required disabled={busy || checkFailed} aria-invalid={!!error && !checkFailed}
                    aria-describedby={error ? "login-error" : undefined} />
                  <button type="button" onClick={() => setVisible(!visible)}
                    aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={visible} disabled={busy || checkFailed}>
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button className="access-guest" type="button" disabled={busy || checkFailed}
                  onClick={() => { setEmail("demo@mantacero.com"); setPassword("Demo2026!"); setError(""); }}>
                  Usar acceso de invitado
                </button>
                {error && (
                  <p id="login-error" className="access-error" role="alert">
                    {error}
                  </p>
                )}
                {checkFailed ? (
                  <button
                    className="access-submit"
                    type="button"
                    onClick={() => {
                      setChecking(true);
                      void checkSession();
                    }}
                  >
                    Reintentar conexión <ArrowRight size={18} />
                  </button>
                ) : (
                  <button
                    className="access-submit"
                    type="submit"
                    disabled={busy || !email.trim() || !password}
                  >
                    {busy ? (
                      <>
                        Iniciando sesión{" "}
                        <LoaderCircle className="access-spinner" size={18} />
                      </>
                    ) : (
                      <>
                        Entrar a la operación <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                )}
              </form>
            )}

          </div>
          <div className="access-card-footer">
            <ShieldCheck size={17} />
            <span>
              Acceso a la simulación.
              <br />
              <strong>Una misión por cumplir.</strong>
            </span>
          </div>
        </section>
      </div>
      <footer className="access-footer">
        <span>
          MANTA CERO <b>/</b> ENCUENTRA LA CURA
        </span>
        <span>Simulación ficticia · No es una herramienta clínica</span>
        <span>
          CENTRO DE RESPUESTA <ArrowRight size={12} />
        </span>
      </footer>
    </main>
  );
}
