// Tela "Sala de Estudo": vídeo incorporado + artigo + marcar concluído + próximos tópicos
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRoadmap, getTopic, listRoadmaps, setTopicCompleted, youtubeUrl } from "../lib/api";
import { Pomodoro } from "../components/Pomodoro";

export default function StudyRoom() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState(null);
  const [current, setCurrent] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setStatus("loading");
        let rm, topic;
        if (topicId) {
          topic = await getTopic(topicId);
          rm = await getRoadmap(topic.roadmap_id);
        } else {
          const list = await listRoadmaps();
          if (list.length === 0) return !cancel && setStatus("empty");
          rm = await getRoadmap(list[0].id);
          topic = rm.topics.find((t) => !t.completed) ?? rm.topics[0]; // próximo pendente
        }
        if (!cancel) {
          setRoadmap(rm);
          setCurrent(rm.topics.find((t) => t.id === topic.id));
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
  }, [topicId]);

  async function toggleCurrent() {
    const completed = !current.completed;
    try {
      await setTopicCompleted(current.id, completed);
      const updated = { ...current, completed };
      setCurrent(updated);
      setRoadmap((r) => ({ ...r, topics: r.topics.map((t) => (t.id === updated.id ? updated : t)) }));
    } catch (err) {
      alert("Não foi possível salvar: " + err.message);
    }
  }

  if (status === "loading") return <p className="center">Carregando aula...</p>;
  if (status === "error") return <p className="center error">Erro: {error}</p>;
  if (status === "empty")
    return (
      <p className="center">
        Nenhum roadmap ainda. <Link to="/">Gere um roadmap</Link> para começar a estudar.
      </p>
    );

  const others = roadmap.topics.filter((t) => t.id !== current.id);

  return (
    <div className="layout">
      <section>
        <p className="muted small">
          <Link to={`/roadmap/${roadmap.id}`}>{roadmap.title}</Link> › Aula {current.position}
        </p>

        {current.video_id ? (
          <div className="video">
            <iframe
              src={`https://www.youtube.com/embed/${current.video_id}`}
              title={current.video_title || current.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="card muted">Nenhum vídeo encontrado para este tópico.</div>
        )}

        <div className="card">
          <div className="row between">
            <h2>
              {current.position}. {current.title}
            </h2>
            <label className="check">
              <input type="checkbox" checked={current.completed} onChange={toggleCurrent} />
              Marcar como concluído
            </label>
          </div>
          <p className="muted">{current.description}</p>
          {current.video_title && (
            <p className="small">
              Vídeo: <a href={youtubeUrl(current.video_id)} target="_blank" rel="noreferrer">{current.video_title}</a>
            </p>
          )}
          {current.article_url ? (
            <a className="btn" href={current.article_url} target="_blank" rel="noreferrer">
              📄 Ler artigo: {current.article_title ?? "Wikipédia"}
              {current.article_minutes ? ` (${current.article_minutes} min)` : ""}
            </a>
          ) : (
            <span className="muted small">Nenhum artigo encontrado para este tópico.</span>
          )}
        </div>
      </section>

      <aside>
        <Pomodoro />
        <div className="card">
          <h3>Outros tópicos</h3>
          <ul className="next">
            {others.map((t) => (
              <li key={t.id}>
                <button className="link" onClick={() => navigate(`/estudo/${t.id}`)}>
                  {t.completed ? "✔" : t.position}. {t.title}
                </button>
                {t.video_minutes ? <span className="muted small"> {t.video_minutes} min</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
