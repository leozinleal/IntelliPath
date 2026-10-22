// 1) Gerar roadmap a partir do assunto digitado
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteRoadmap, generateRoadmap, listRoadmaps } from "../lib/api";

const SUGGESTIONS = ["Python", "Design UI", "Matemática", "História", "Lógica"];

// Remove prefixos repetitivos que a IA costuma colocar ("Trilha de Estudos: ...")
const cleanTitle = (t) => t.replace(/^trilha( de estudos?)?\s*[:\-–]\s*/i, "");

// Ícone de lixeira (SVG, herda a cor do botão)
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// Card de um roadmap do histórico, com progresso e botão de excluir
function RoadmapCard({ roadmap, onDelete }) {
  const { done, total } = roadmap;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const status = total > 0 && done === total ? "Concluído" : done > 0 ? "Em andamento" : "Novo";

  return (
    <div className="rm-wrap">
      <Link to={`/roadmap/${roadmap.id}`} className="rm-card">
        <div className="rm-top">
          <span className="rm-icon" aria-hidden>
            {roadmap.topic.trim().charAt(0).toUpperCase()}
          </span>
          <span className={`rm-status ${status === "Concluído" ? "is-done" : ""}`}>{status}</span>
        </div>

        <strong className="rm-title">{cleanTitle(roadmap.title)}</strong>
        <span className="muted small">
          {/* só mostra o assunto se ele não estiver repetido no título */}
          {!roadmap.title.toLowerCase().includes(roadmap.topic.trim().toLowerCase()) && `${roadmap.topic} · `}
          Criado em {new Date(roadmap.created_at).toLocaleDateString("pt-BR")}
        </span>

        <div className="rm-progress">
          <div className="bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          <span className="small">
            {done}/{total}
          </span>
        </div>

        <span className="rm-cta">{done > 0 && done < total ? "Continuar" : "Abrir trilha"} →</span>
      </Link>

      {/* Fica fora do link, para o clique não abrir a trilha */}
      <button
        type="button"
        className="rm-delete"
        onClick={() => onDelete(roadmap)}
        title="Excluir roadmap"
        aria-label={`Excluir ${cleanTitle(roadmap.title)}`}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

// Janela de confirmação antes de excluir
function ConfirmDelete({ roadmap, busy, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <span className="modal-icon">
          <TrashIcon />
        </span>
        <h3>Excluir roadmap?</h3>
        <p className="muted">
          A trilha <strong>“{cleanTitle(roadmap.title)}”</strong> e todo o progresso dela serão apagados.
          Essa ação não pode ser desfeita.
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [toDelete, setToDelete] = useState(null); // roadmap aguardando confirmação
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    listRoadmaps().then(setHistory).catch(() => {});
  }, []);

  async function handleGenerate(e) {
    e?.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    try {
      const id = await generateRoadmap(topic.trim());
      navigate(`/roadmap/${id}`);
    } catch (err) {
      setError(err.message || "Erro ao gerar o roadmap.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await deleteRoadmap(toDelete.id);
      setHistory((h) => h.filter((r) => r.id !== toDelete.id));
      setToDelete(null);
    } catch (err) {
      setError("Não foi possível excluir: " + err.message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="home">
      <span className="badge">✦ POWERED BY IA</span>
      <h1>
        Aprenda qualquer coisa, <span className="accent">no seu ritmo.</span>
      </h1>
      <p className="muted">
        Digite um tópico e receba um roadmap de estudos personalizado, gerado por inteligência artificial.
      </p>

      <form onSubmit={handleGenerate} className="stack">
        <input
          placeholder="O que você quer estudar hoje?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={loading}
        />
        <button className="primary big" disabled={loading || !topic.trim()}>
          {loading ? "Gerando seu roadmap... (pode levar alguns segundos)" : "✦ Gerar Roadmap"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="chips">
        <span className="muted small">Sugestões:</span>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => setTopic(s)} disabled={loading}>
            {s}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <section className="history">
          <div className="history-head">
            <h3>Meus roadmaps</h3>
            <span className="muted small">
              {history.length} {history.length === 1 ? "trilha" : "trilhas"}
            </span>
          </div>
          <div className="history-grid">
            {history.map((r) => (
              <RoadmapCard key={r.id} roadmap={r} onDelete={setToDelete} />
            ))}
          </div>
        </section>
      )}

      {toDelete && (
        <ConfirmDelete
          roadmap={toDelete}
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}