import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useSession } from "../session";
import AuthHero from "../components/AuthHero";
import Icon from "../components/Icons";
import { ThemeToggle, usePalette } from "../theme";
import { LangToggle, useT } from "../i18n";

/** A small stylised map (the card under the headline), drawn in the theme's colours. */
function MiniMap() {
  const pal = usePalette();
  const blocks: [number, number][] = [];
  for (let y = 6; y < 120; y += 30) for (let x = 4; x < 400; x += 44) if ((x * 7 + y * 3) % 11) blocks.push([x, y]);
  return (
    <svg className="l-minimap" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="400" height="120" className="mm-land" />
      {blocks.map(([x, y]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={34 + ((x + y) % 3) * 3} height={21} rx={3} className="mm-block" />
      ))}
      {[32, 62, 92].map((y) => (
        <path key={y} d={`M0 ${y} H400`} className="mm-road" />
      ))}
      {[40, 128, 216, 304].map((x) => (
        <path key={x} d={`M${x} 0 V120`} className="mm-road" />
      ))}
      <path d="M0 78 C 90 66, 200 90, 400 60" className="mm-major" />
      <path d="M150 0 C 160 40, 140 80, 166 120" className="mm-wadi" />
      <path d="M250 50 L 300 44" stroke={pal.exposed} strokeWidth="4" strokeDasharray="4 5" strokeLinecap="round" fill="none" />
      <path d="M60 100 L 104 96" stroke={pal.exposed} strokeWidth="4" strokeDasharray="4 5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function LoginPage() {
  const { user, login, register } = useSession();
  const t = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/"} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = mode === "login" ? await login(email, password) : await register(email, password);
      navigate(u.role === "admin" ? "/admin" : "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const switchMode = () => (setMode(mode === "login" ? "register" : "login"), setError(null));

  return (
    <main className="l-app">
      <AuthHero />
      <div className="l-side">
        <div className="l-toggle">
          <LangToggle />
          <ThemeToggle />
        </div>
        <div className="l-col">
          <div className="l-intro">
            <div className="l-logo">
              <i>
                <Icon name="drop" size={15} />
              </i>
              FloodSafe
            </div>
            <h1>
              {t("Routes sûres,")}
              <br />
              {t("même sous la pluie.")}
            </h1>
            <div className="l-mapcard">
              <MiniMap />
            </div>
          </div>

          <form onSubmit={submit} className="l-sheet">
            <h2>{mode === "login" ? t("Bon retour 👋") : t("Créer un compte")}</h2>
            <p className="l-sub">{t("Les routes inondables de Nabeul, avant de partir.")}</p>
            <label className="l-label" htmlFor="l-email">
              {t("E-mail")}
            </label>
            <div className="l-field">
              <Icon name="user" size={15} />
              <input
                id="l-email"
                type="email"
                autoComplete="email"
                placeholder={t("nom@exemple.tn")}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <label className="l-label" htmlFor="l-pass">
              {t("Mot de passe")}
            </label>
            <div className="l-field">
              <input
                id="l-pass"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="••••••••••"
                required
                minLength={mode === "register" ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {mode === "register" && <small className="l-help">{t("8 caractères au minimum")}</small>}
            {error && <p className="error">{error}</p>}
            <button className="m-btn wide l-submit" disabled={busy}>
              {busy ? "…" : mode === "login" ? t("Se connecter") : t("Créer le compte")}
            </button>
            <p className="l-switch">
              {mode === "login" ? t("Pas de compte ? ") : t("Déjà un compte ? ")}
              <button type="button" onClick={switchMode}>
                {mode === "login" ? t("Créer un compte") : t("Se connecter")}
              </button>
            </p>
            <p className="l-disclaimer">{t("Indication de risque, pas une certitude. Ne remplace pas les alertes officielles (INM, Protection civile).")}</p>
          </form>
        </div>
      </div>
    </main>
  );
}
