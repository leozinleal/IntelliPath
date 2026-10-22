// 2) Cronômetro Pomodoro
// O estado fica num Context no topo do app, então o tempo continua correndo
// mesmo quando o aluno troca entre "Meu Roadmap" e "Sala de Estudo".
import { createContext, useContext, useEffect, useRef, useState } from "react";

const FOCUS_MIN = 25;
const BREAK_MIN = 5;

const PomodoroContext = createContext(null);

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* navegador sem áudio */
  }
}

export function PomodoroProvider({ children }) {
  const [mode, setMode] = useState("focus"); // "focus" | "break"
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_MIN * 60);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0); // focos concluídos na sessão
  const endAt = useRef(null); // horário-alvo (evita atraso se a aba ficar em segundo plano)

  useEffect(() => {
    if (!running) return;
    endAt.current = Date.now() + secondsLeft * 1000;

    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setSecondsLeft(left);

      if (left === 0) {
        clearInterval(id);
        beep();
        if (mode === "focus") {
          setCycles((c) => c + 1);
          setMode("break");
          setSecondsLeft(BREAK_MIN * 60);
        } else {
          setMode("focus");
          setSecondsLeft(FOCUS_MIN * 60);
        }
        setRunning(false);
      }
    }, 250);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  const value = {
    mode,
    secondsLeft,
    running,
    cycles,
    total: (mode === "focus" ? FOCUS_MIN : BREAK_MIN) * 60,
    start: () => setRunning(true),
    pause: () => setRunning(false),
    reset: () => {
      setRunning(false);
      setMode("focus");
      setSecondsLeft(FOCUS_MIN * 60);
    },
  };

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
}

export function Pomodoro() {
  const p = useContext(PomodoroContext);
  const mm = String(Math.floor(p.secondsLeft / 60)).padStart(2, "0");
  const ss = String(p.secondsLeft % 60).padStart(2, "0");
  const pct = 100 - (p.secondsLeft / p.total) * 100;

  const status = p.running
    ? p.mode === "focus" ? "Focando..." : "Pausa — descanse!"
    : p.mode === "focus" ? "Pronto para iniciar" : "Hora da pausa";

  return (
    <div className="card">
      <h3>{p.mode === "focus" ? "Foco (Pomodoro)" : "Pausa curta"}</h3>
      <small className="muted">{status}</small>

      <div className="timer">
        {mm}:{ss}
      </div>
      <div className="bar">
        <div style={{ width: `${pct}%` }} />
      </div>

      <div className="row">
        <button className="primary" onClick={p.start} disabled={p.running}>
          ▶ Iniciar
        </button>
        <button onClick={p.pause} disabled={!p.running}>
          ❚❚ Pausar
        </button>
      </div>
      <button className="link" onClick={p.reset}>
        ↺ Reiniciar sessão
      </button>

      <p className="muted small">
        Ciclos concluídos: {p.cycles} · Dica: 25 min de foco + 5 min de pausa.
      </p>
    </div>
  );
}
