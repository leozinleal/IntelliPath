import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { PomodoroProvider } from "./components/Pomodoro";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Roadmap from "./pages/Roadmap";
import StudyRoom from "./pages/StudyRoom";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="center">Carregando...</p>;
  if (!session) return <Login />;

  return (
    <BrowserRouter>
      <PomodoroProvider>
        <header className="nav">
          <strong className="logo">IntelliPath</strong>
          <nav>
            <NavLink to="/" end>Início</NavLink>
            <NavLink to="/roadmap">Meu Roadmap</NavLink>
            <NavLink to="/estudo">Sala de Estudo</NavLink>
          </nav>
          <div className="user">
            <span className="muted small">{session.user.email}</span>
            <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/roadmap/:id" element={<Roadmap />} />
            <Route path="/estudo" element={<StudyRoom />} />
            <Route path="/estudo/:topicId" element={<StudyRoom />} />
          </Routes>
        </main>
      </PomodoroProvider>
    </BrowserRouter>
  );
}
