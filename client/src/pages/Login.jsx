import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/employees" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/employees");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Talent<span className="text-brand">IQ</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">Continuous talent intelligence platform</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-line bg-surface p-6 shadow-2xl shadow-black/40"
        >
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
            placeholder="you@company.com"
          />

          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
            placeholder="••••••••"
          />

          {error && <p className="mb-4 text-sm text-declining">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
