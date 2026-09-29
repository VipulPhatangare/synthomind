import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

export async function login(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
}

export async function logout() {
  await api.post("/auth/logout");
}

export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function getMeta() {
  const { data } = await api.get("/meta");
  return data;
}

export async function listEmployees(params) {
  const { data } = await api.get("/employees", { params });
  return data;
}

export async function getEmployee(employeeId) {
  const { data } = await api.get(`/employees/${employeeId}`);
  return data;
}

export async function getEvidence(employeeId, competencyId) {
  const { data } = await api.get(`/employees/${employeeId}/evidence/${competencyId}`);
  return data;
}

export async function getDashboardSummary() {
  const { data } = await api.get("/dashboard/summary");
  return data;
}

export async function getBiasAudit() {
  const { data } = await api.get("/dashboard/bias-audit");
  return data;
}

export async function getTeamRollup(params) {
  const { data } = await api.get("/dashboard/team-rollup", { params });
  return data;
}

export async function getHeatmap() {
  const { data } = await api.get("/dashboard/heatmap");
  return data;
}

export async function getEvaluation() {
  const { data } = await api.get("/evaluation");
  return data;
}

export async function getShowcase() {
  const { data } = await api.get("/meta/showcase");
  return data;
}

export async function getVerdictAsOf(employeeId, competencyId, date) {
  const { data } = await api.get(`/verdicts/${employeeId}/${competencyId}/as-of`, { params: { date } });
  return data;
}

export async function getForecast(employeeId, competencyId) {
  const { data } = await api.get(`/verdicts/${employeeId}/${competencyId}/forecast`);
  return data;
}

export async function getForecasts(employeeId) {
  const { data } = await api.get(`/verdicts/${employeeId}/forecasts`);
  return data;
}

export async function completeRecommendation(recId) {
  const { data } = await api.post(`/recommendations/${recId}/complete`);
  return data;
}

export async function listRecommendationOutcomes(params) {
  const { data } = await api.get("/recommendations/outcomes", { params });
  return data;
}

export async function listDisputes(params) {
  const { data } = await api.get("/disputes", { params });
  return data;
}

export async function createDispute(payload) {
  const { data } = await api.post("/disputes", payload);
  return data;
}

export async function resolveDispute(disputeId, resolution) {
  const { data } = await api.patch(`/disputes/${disputeId}`, { resolution });
  return data;
}

export function exportUrl(path) {
  return `/api/export/${path}`;
}

export async function createChatSession() {
  const { data } = await api.post("/chat/sessions");
  return data;
}

export async function listChatSessions() {
  const { data } = await api.get("/chat/sessions");
  return data;
}

export async function getChatSession(sessionId) {
  const { data } = await api.get(`/chat/sessions/${sessionId}`);
  return data;
}

export async function deleteChatSession(sessionId) {
  await api.delete(`/chat/sessions/${sessionId}`);
}

export async function deleteAllChatSessions() {
  const { data } = await api.delete("/chat/sessions");
  return data;
}

export async function sendChatMessage(sessionId, message) {
  const { data } = await api.post(`/chat/sessions/${sessionId}/messages`, { message });
  return data;
}
