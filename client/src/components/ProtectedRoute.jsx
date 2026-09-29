import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "./Layout.jsx";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-ink-muted">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return <Layout>{children}</Layout>;
}
