import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault(); // stop the browser's default full-page form submit
    setBusy(true); setError("");
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="auth">
        <h1>Meetings, minus the note-taking<span style={{ color: "var(--accent)" }}>.</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>Upload a recording. Get the transcript, summary and action items.</p>
        <form className="card" onSubmit={submit}>
          {error && <div className="error">{error}</div>}
          {!isLogin && (
            <label className="field">Name<input type="text" value={form.name} onChange={set("name")} required /></label>
          )}
          <label className="field">Email<input type="email" value={form.email} onChange={set("email")} required /></label>
          <label className="field">Password
            <input type="password" value={form.password} onChange={set("password")} minLength={isLogin ? 1 : 8} required
              placeholder={isLogin ? "" : "At least 8 characters"} />
          </label>
          <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}
          </button>
        </form>
        <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>
          {isLogin ? "New here? " : "Already have an account? "}
          <Link to={isLogin ? "/register" : "/login"} style={{ color: "var(--accent)" }}>{isLogin ? "Create an account" : "Log in"}</Link>
        </p>
      </div>
    </div>
  );
}