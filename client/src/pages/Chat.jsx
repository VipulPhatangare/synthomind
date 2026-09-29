import { useEffect, useState } from "react";
import { listChatSessions, getChatSession, deleteChatSession, deleteAllChatSessions } from "../api/client.js";
import ChatPanel from "../components/ChatPanel.jsx";
import Skeleton from "../components/ui/Skeleton.jsx";

/** Server message doc -> ChatPanel's internal message shape. */
function mapMessage(m) {
  return {
    role: m.role,
    content: m.content,
    sources: m.sources,
    followUps: m.follow_up_questions,
    chart: m.chart,
    usage: m.token_usage,
  };
}

function relativeLabel(date) {
  const d = new Date(date);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}

export default function Chat() {
  const [sessions, setSessions] = useState(null);
  const [activeId, setActiveId] = useState(null); // drives sidebar highlighting only
  const [activeData, setActiveData] = useState(null); // { session, messages } for a resumed session
  const [loadingActive, setLoadingActive] = useState(false);
  // The ChatPanel `key` — deliberately a SEPARATE piece of state from
  // activeId, set only by explicit user actions (click a history item,
  // click "New chat"). activeId also gets updated reactively once a brand
  // new session's id comes back from the server (onSessionReady), and if
  // THAT flowed into the key too, ChatPanel would remount itself the
  // instant its own session finished being created — wiping the
  // conversation and creating a duplicate session in a loop.
  const [mountKey, setMountKey] = useState("new-0");
  const [newChatNonce, setNewChatNonce] = useState(0);

  function refreshSessions() {
    listChatSessions().then((d) => setSessions(d.sessions)).catch(() => setSessions([]));
  }
  useEffect(refreshSessions, []);

  async function openSession(sessionId) {
    if (sessionId === activeId) return;
    setActiveId(sessionId);
    setMountKey(sessionId);
    setLoadingActive(true);
    try {
      const d = await getChatSession(sessionId);
      setActiveData({ session: d.session, messages: d.messages.map(mapMessage) });
    } finally {
      setLoadingActive(false);
    }
  }

  function startNewChat() {
    setActiveId(null);
    setActiveData(null);
    const next = newChatNonce + 1;
    setNewChatNonce(next);
    setMountKey(`new-${next}`);
  }

  async function handleDelete(e, sessionId) {
    e.stopPropagation(); // don't also trigger the row's openSession click
    if (!window.confirm("Delete this conversation? This can't be undone.")) return;
    await deleteChatSession(sessionId);
    if (sessionId === activeId) startNewChat(); // the open conversation just vanished — fall back to a blank one
    refreshSessions();
  }

  async function handleDeleteAll() {
    if (sessions?.length === 0) return;
    if (!window.confirm(`Delete all ${sessions?.length ?? ""} conversations? This can't be undone.`)) return;
    await deleteAllChatSessions();
    startNewChat(); // whatever was open just vanished too
    refreshSessions();
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* History sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col rounded-xl border border-line bg-surface md:flex">
        <div className="border-b border-line p-3">
          <button
            onClick={startNewChat}
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover"
          >
            + New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sessions === null && (
            <div className="space-y-2 p-1">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          )}
          {sessions?.length === 0 && (
            <p className="text-meta p-2 text-ink-muted">No previous conversations yet.</p>
          )}
          {sessions?.map((s) => (
            <div
              key={s.session_id}
              role="button"
              tabIndex={0}
              onClick={() => openSession(s.session_id)}
              onKeyDown={(e) => e.key === "Enter" && openSession(s.session_id)}
              className={`group mb-1 flex w-full items-start gap-1 rounded-lg p-2 text-left transition-colors ${
                activeId === s.session_id ? "bg-brand/15 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{s.preview || (s.active_employee_name ? `About ${s.active_employee_name}` : "New conversation")}</p>
                <p className="text-meta text-ink-muted">
                  {relativeLabel(s.updated_at)}
                  {s.active_employee_name && ` · ${s.active_employee_name}`}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => handleDelete(e, s.session_id)}
                title="Delete conversation"
                aria-label="Delete conversation"
                className="shrink-0 rounded px-1.5 py-0.5 text-ink-muted opacity-0 transition-opacity hover:bg-declining/15 hover:text-declining focus:opacity-100 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {sessions?.length > 0 && (
          <div className="border-t border-line p-2">
            <button
              onClick={handleDeleteAll}
              className="text-meta w-full rounded-md px-2 py-1.5 text-center text-ink-muted transition-colors hover:bg-declining/15 hover:text-declining"
            >
              Delete all conversations
            </button>
          </div>
        )}
      </aside>

      {/* Active conversation */}
      <div className="min-w-0 flex-1">
        {loadingActive ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : (
          <ChatPanel
            key={mountKey}
            title="Ask TalentIQ"
            resumeSession={activeData?.session}
            resumeMessages={activeData?.messages}
            onSessionReady={(s) => setActiveId(s.session_id)}
            onMessageSent={refreshSessions}
          />
        )}
      </div>
    </div>
  );
}
