import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import AuthPage from "./pages/AuthPage";
import Landing from "./pages/Landing";
import Recordings from "./pages/Recordings";
import RecordingDetailPage from "./pages/RecordingDetail";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link to="/app" className="brand">Recap<span>.</span></Link>
          <div className="meta">
            <span>{user?.name}</span>
            <button className="btn link" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/app" element={<Protected><Shell><Recordings /></Shell></Protected>} />
      <Route path="/r/:id" element={<Protected><Shell><RecordingDetailPage /></Shell></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}