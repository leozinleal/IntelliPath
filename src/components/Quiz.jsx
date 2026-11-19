// Atividade (quiz) de um tópico: gera perguntas com IA, o aluno responde e vê a nota
import { useEffect, useState } from "react";
import { deleteQuiz, generateQuiz, getQuiz, saveQuizAttempt } from "../lib/api";

const PASS_RATE = 0.7; // 70% de acertos conclui o tópico
const LETTERS = ["A", "B", "C", "D"];

export default function Quiz({ topic, roadmap, onPassed }) {
  const [status, setStatus] = useState("loading"); // loading | empty | generating | answering | result | error
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // { indiceDaPergunta: indiceDaAlternativa }
  const [lastAttempt, setLastAttempt] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Ao abrir o tópico, verifica se já existem perguntas salvas
  useEffect(() => {
    let cancel = false;
    getQuiz(topic.id)
      .then(({ questions, lastAttempt }) => {
        if (cancel) return;
        setQuestions(questions);
        setLastAttempt(lastAttempt);
        setStatus(questions.length ? "answering" : "empty");
      })
      .catch((err) => {
        if (cancel) return;
        setError(err.message);
        setStatus("error");
      });
    return () => {
      cancel = true;
    };
  }, [topic.id]);

  async function handleGenerate({ replace = false } = {}) {
    setStatus("generating");
    setError("");
    try {
      if (replace) {
        await deleteQuiz(topic.id);
        setQuestions([]);
      }
      const saved = await generateQuiz(topic, roadmap);
      setQuestions(saved);
      setAnswers({});
      setStatus("answering");
    } catch (err) {
      setError(err.message || "Não foi possível gerar a atividade.");
      setStatus(questions.length && !replace ? "answering" : "empty");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const total = questions.length;
    const score = questions.filter((q, i) => answers[i] === q.correct_index).length;
    const answerList = questions.map((_, i) => answers[i]);

    setSaving(true);
    try {
      await saveQuizAttempt({ roadmapId: roadmap.id, topicId: topic.id, score, total, answers: answerList });
      setLastAttempt({ score, total, answers: answerList });
      setStatus("result");
      if (score / total >= PASS_RATE && !topic.completed) await onPassed();
    } catch (err) {
      setError("Não foi possível salvar sua nota: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleRetry() {
    setAnswers({});
    setStatus("answering");
  }

  // ---------- Telas ----------
  if (status === "loading") return <div className="card quiz muted">Carregando atividade...</div>;

  if (status === "error")
    return (
      <div className="card quiz">
        <h3>Atividade</h3>
        <p className="error">{error}</p>
      </div>
    );

  if (status === "empty" || status === "generating")
    return (
      <div className="card quiz quiz-empty">
        <span className="quiz-badge">✦ Atividade</span>
        <h3>Teste o que você aprendeu</h3>
        <p className="muted">
          A IA cria 5 perguntas sobre “{topic.title}”. Acertando 70% ou mais, o tópico é marcado como concluído.
        </p>
        {error && <p className="error small">{error}</p>}
        <button className="primary" onClick={() => handleGenerate()} disabled={status === "generating"}>
          {status === "generating" ? "Gerando perguntas..." : "✦ Gerar atividade"}
        </button>
      </div>
    );

  const isResult = status === "result";
  const answeredAll = questions.every((_, i) => answers[i] !== undefined);
  const score = lastAttempt?.score ?? 0;
  const total = lastAttempt?.total ?? questions.length;
  const passed = total > 0 && score / total >= PASS_RATE;

  return (
    <form className="card quiz" onSubmit={handleSubmit}>
      <div className="row between quiz-head">
        <div>
          <span className="quiz-badge">✦ Atividade</span>
          <h3>{topic.title}</h3>
        </div>
        {!isResult && lastAttempt && (
          <span className="muted small">
            Última nota: {lastAttempt.score}/{lastAttempt.total}
          </span>
        )}
      </div>

      {isResult && (
        <div className={`quiz-score ${passed ? "pass" : "fail"}`}>
          <strong>
            {score}/{total} acertos
          </strong>
          <span>
            {passed
              ? "Mandou bem! Tópico concluído ✔"
              : "Quase lá! Revise o vídeo e o artigo e tente de novo (precisa de 70%)."}
          </span>
        </div>
      )}

      <ol className="quiz-list">
        {questions.map((q, qi) => (
          <li key={q.id} className="quiz-q">
            <p className="quiz-question">{q.question}</p>
            <div className="quiz-options">
              {q.options.map((opt, oi) => {
                const chosen = answers[qi] === oi;
                let cls = "quiz-opt";
                if (chosen) cls += " chosen";
                if (isResult && oi === q.correct_index) cls += " correct";
                if (isResult && chosen && oi !== q.correct_index) cls += " wrong";
                return (
                  <label key={oi} className={cls}>
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={chosen}
                      disabled={isResult}
                      onChange={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                    />
                    <span className="quiz-letter">{LETTERS[oi]}</span>
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
            {isResult && q.explanation && (
              <p className="quiz-expl">
                <strong>{answers[qi] === q.correct_index ? "✔ Correto." : "✘ Resposta certa: " + LETTERS[q.correct_index] + "."}</strong>{" "}
                {q.explanation}
              </p>
            )}
          </li>
        ))}
      </ol>

      {error && <p className="error small">{error}</p>}

      <div className="row quiz-actions">
        {isResult ? (
          <>
            <button type="button" className="primary" onClick={handleRetry}>
              ↺ Refazer
            </button>
            <button type="button" onClick={() => handleGenerate({ replace: true })}>
              ✦ Novas perguntas
            </button>
          </>
        ) : (
          <>
            <button className="primary" disabled={!answeredAll || saving}>
              {saving ? "Enviando..." : "Enviar respostas"}
            </button>
            {!answeredAll && (
              <span className="muted small">
                Responda todas as perguntas ({Object.keys(answers).length}/{questions.length})
              </span>
            )}
          </>
        )}
      </div>
    </form>
  );
}
