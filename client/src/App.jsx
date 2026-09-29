import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import About from "./pages/About.jsx";
import EmployeeList from "./pages/EmployeeList.jsx";
import EmployeeDetail from "./pages/EmployeeDetail.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import TeamRollup from "./pages/TeamRollup.jsx";
import ModelQuality from "./pages/ModelQuality.jsx";
import BiasAudit from "./pages/BiasAudit.jsx";
import Disputes from "./pages/Disputes.jsx";
import Chat from "./pages/Chat.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
          <Route path="/about" element={<ProtectedRoute><About /></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute><EmployeeList /></ProtectedRoute>} />
          <Route path="/employees/:employeeId" element={<ProtectedRoute><EmployeeDetail /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/team" element={<ProtectedRoute><TeamRollup /></ProtectedRoute>} />
          <Route path="/model-quality" element={<ProtectedRoute><ModelQuality /></ProtectedRoute>} />
          <Route path="/bias-audit" element={<ProtectedRoute><BiasAudit /></ProtectedRoute>} />
          <Route path="/disputes" element={<ProtectedRoute><Disputes /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
