import { useState } from "react";
import { supabase } from "../lib/supabase";

const FEATURES = [
  { icon: "✦", title: "Roadmap com IA", text: "Digite um assunto e receba a trilha de estudos pronta." },
  { icon: "▶", title: "Videoaulas e artigos", text: "Conteúdo selecionado para cada tópico da trilha." },
  { icon: "◷", title: "Foco com Pomodoro", text: "Estude em ciclos e acompanhe seu progresso." },
];

export default function Login() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null); // { type: "error" | "success", text }
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  function switchMode(next) {
    setMode(next);
    setMsg(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const { data, error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) return setMsg({ type: "error", text: error.message });
    if (!isLogin && !data.session) {
      setMsg({
        type: "success",
        text: "Conta criada! Confira seu e-mail para confirmar o cadastro e depois faça login.",
      });
    }
  }

  return (
    <div className="auth">
      {/* Lado esquerdo: apresentação */}
      <aside className="auth-hero">
        <div className="auth-glow" aria-hidden />
        <span className="auth-logo">
          Intelli<span>Path</span>
        </span>

        <div className="auth-hero-body">
          <span className="badge light">✦ POWERED BY IA</span>
          <h1>
            Aprenda qualquer coisa,
            <br />
            <span>no seu ritmo.</span>
          </h1>
          <ul className="auth-features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="auth-feat-icon">{f.icon}</span>
                <div>
                  <strong>{f.title}</strong>
                  <p>{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <small className="auth-foot">© {new Date().getFullYear()} IntelliPath</small>
      </aside>

      {/* Lado direito: formulário */}
      <main className="auth-main">
        <form className="auth-card" onSubmit={handleSubmit}>
          <span className="auth-logo mobile-only">
            Intelli<span>Path</span>
          </span>

          <h2>{isLogin ? "Bem-vindo de volta 👋" : "Crie sua conta"}</h2>
          <p className="muted">
            {isLogin ? "Entre para continuar seus estudos." : "Comece a montar sua trilha de estudos em segundos."}
          </p>

          <div className="auth-tabs" role="tablist">
            <button type="button" className={isLogin ? "active" : ""} onClick={() => switchMode("login")}>
              Entrar
            </button>
            <button type="button" className={!isLogin ? "active" : ""} onClick={() => switchMode("signup")}>
              Cadastrar
            </button>
          </div>

          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>

          {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}

          <button className="primary big" disabled={loading}>
            {loading ? "Aguarde..." : isLogin ? "Entrar" : "Criar conta"}
          </button>

          <p className="auth-switch muted small">
            {isLogin ? "Ainda não tem conta? " : "Já tem conta? "}
            <button type="button" className="link" onClick={() => switchMode(isLogin ? "signup" : "login")}>
              {isLogin ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}