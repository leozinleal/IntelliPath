// Tela "Meu Roadmap": lista de tópicos (3) com links e (4) checkbox de progresso
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRoadmap, listRoadmaps, setTopicCompleted, totalMinutes } from "../lib/api";
import { Pomodoro } from "../components/Pomodoro";

export default function Roadmap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | empty | error
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setStatus("loading");
        let rid = id;
        if (!rid) {
          const list = await listRoadmaps();
          if (list.length === 0) return !cancel && setStatus("empty");
          rid = list[0].id; // abre o mais recente
        }
        const data = await getRoadmap(rid);
        if (!cancel) {
          setRoadmap(data);
          setStatus("ok");
        }
      } catch (err) {
        if (!cancel) {
          setError(err.message);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  async function toggle(topic) {
    const completed = !topic.completed;
    // atualiza a tela na hora (otimista) e depois salva no banco
    setRoadmap((r) => ({ ...r, topics: r.topics.map((t) => (t.id === topic.id ? { ...t, completed } : t)) }));
    try {
      await setTopicCompleted(topic.id, completed);
    } catch (err) {
      alert("Não foi possível salvar: " + err.message);
      setRoadmap((r) => ({ ...r, topics: r.topics.map((t) => (t.id === topic.id ? { ...t, completed: !completed } : t)) }));
    }
  }

  if (status === "loading") return <p className="center">Carregando roadmap...</p>;
  if (status === "error") return <p className="center error">Erro: {error}</p>;
  if (status === "empty")
    return (
      <p className="center">
        Você ainda não tem roadmaps. <Link to="/">Gere o primeiro aqui</Link>.
      </p>
    );

  const done = roadmap.topics.filter((t) => t.completed).length;
  const total = roadmap.topics.length;

  return (
    <div className="layout">
      <section>
        <p className="eyebrow">TRILHA · {roadmap.title.toUpperCase()}</p>
        <h2>Seu Roadmap gerado por IA</h2>
        <div className="progress-line">
          <div className="bar">
            <div style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="small">
            {done}/{total} concluídos
          </span>
        </div>

        <ol className="topics">
          {roadmap.topics.map((t) => (
            <li key={t.id} className={`card topic ${t.completed ? "done" : ""}`}>
              <label className="topic-title">
                <input type="checkbox" checked={t.completed} onChange={() => toggle(t)} />
                <strong>
                  {t.position}. {t.title}
                </strong>
              </label>
              <p className="muted">{t.description}</p>
              <div className="row">
                {t.video_id ? (
                  <button className="primary" onClick={() => navigate(`/estudo/${t.id}`)}>
                    ▶ Assistir Vídeo {t.video_minutes ? <small>{t.video_minutes} min</small> : null}
                  </button>
                ) : (
                  <span className="muted small">Sem vídeo encontrado</span>
                )}
                {t.article_url ? (
                  <a className="btn" href={t.article_url} target="_blank" rel="noreferrer" title={t.article_title ?? ""}>
                    📄 Ler Artigo {t.article_minutes ? <small>{t.article_minutes} min</small> : null}
                  </a>
                ) : (
                  <span className="muted small">Sem artigo encontrado</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <aside>
        <Pomodoro />
        <div className="card">
          <h3>Seu Progresso</h3>
          <p className="kv">
            <span>Tópicos concluídos</span>
            <strong>
              {done}/{total}
            </strong>
          </p>
          <p className="kv">
            <span>Tempo estimado</span>
            <strong>{totalMinutes(roadmap.topics)} min</strong>
          </p>
        </div>
      </aside>
    </div>
  );
}