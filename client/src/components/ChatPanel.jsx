import { useEffect, useRef, useState } from "react";
import { createChatSession, sendChatMessage } from "../api/client.js";
import { SCOPED_TEMPLATES, GENERAL_TEMPLATES, resolveTemplate } from "./chatTemplates.js";
import TrajectoryChart from "./TrajectoryChart.jsx";
import CompetencyComparisonChart from "./CompetencyComparisonChart.jsx";
import MarkdownLite from "./MarkdownLite.jsx";

/**
 * Reusable chat UI — used both embedded (scoped to one employee, on their
 * detail page) and standalone (general org-wide questions, on /chat).
 *
 * By default, creates its own fresh session on mount (the embedded usage on
 * EmployeeDetail: a fresh scoped conversation each time you open a
 * different employee). Pass resumeSession/resumeMessages to load an
 * existing conversation instead — the standalone /chat page's history
 * sidebar does this, and relies on the CALLER remounting this component
 * (via a changing `key`) when switching which session is active, rather
 * than this component trying to detect that itself: a full remount is the
 * simplest correct way to reset every piece of local state (input,
 * expanded, template visibility, …) together.
 */
export default function ChatPanel({ scopedEmployeeId, scopedEmployeeName, title = "Ask TalentIQ", resumeSession, resumeMessages, onSessionReady, onMessageSent }) {
  const [session, setSession] = useState(resumeSession || null);
  const [messages, setMessages] = useState(resumeMessages || []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showTemplates, setShowTemplates] = useState(!resumeMessages?.length);
  const [sessionUsage, setSessionUsage] = useState(
    resumeSession
      ? { totalTokens: resumeSession.total_tokens, promptTokens: resumeSession.total_prompt_tokens, outputTokens: resumeSession.total_output_tokens }
      : null
  );
  const bottomRef = useRef(null);

  const firstName = scopedEmployeeName ? scopedEmployeeName.split(" ")[0] : null;
  const templates = scopedEmployeeName ? SCOPED_TEMPLATES : GENERAL_TEMPLATES;

  useEffect(() => {
    if (resumeSession) {
      onSessionReady?.(resumeSession);
      return;
    }
    // Embedded usage only (standalone /chat always remounts via `key` on
    // session switch, so this branch's resets never fire there): switching
    // which employee is scoped doesn't remount ChatPanel, so this effect is
    // the only signal to start over with a clean conversation.
    setSession(null);
    setMessages([]);
    setSessionUsage(null);
    createChatSession().then((s) => { setSession(s); onSessionReady?.(s); }).catch(() => setError("Could not start a chat session."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedEmployeeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || !session || sending) return;

    const isFirstMessage = messages.length === 0;
    const outgoing = isFirstMessage && scopedEmployeeId ? `Regarding employee ${scopedEmployeeId}: ${trimmed}` : trimmed;

    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);
    setError("");
    try {
      const result = await sendChatMessage(session.session_id, outgoing);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: result.answer,
          sources: result.sources,
          followUps: result.follow_up_questions,
          chart: result.chart,
          usage: result.usage,
        },
      ]);
      if (result.session_usage) setSessionUsage(result.session_usage);
      onMessageSent?.();
    } catch (err) {
      setError(
        err.response?.status === 500
          ? "The chatbot isn't fully configured yet (embedding/LLM API keys pending) — the rest of the platform works independently of this."
          : err.response?.data?.error || "Something went wrong sending that message."
      );
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <>
      {expanded && <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setExpanded(false)} />}
      <div
        className={
          expanded
            ? "fixed inset-4 z-50 flex flex-col rounded-xl border border-line bg-surface p-4 shadow-2xl md:inset-10"
            : "flex h-full flex-col"
        }
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <p className="text-xs text-ink-muted">
              Grounded in evidence only.
              {scopedEmployeeName && <span className="ml-1 text-brand">Scoped to {scopedEmployeeName}.</span>}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              title={showTemplates ? "Hide suggested questions" : "Show suggested questions"}
              className={`rounded-md border px-2 py-1 text-xs ${
                showTemplates ? "border-brand text-brand" : "border-line text-ink-muted hover:border-brand hover:text-ink"
              }`}
            >
              💡 Suggestions
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse" : "Expand"}
              className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:border-brand hover:text-ink"
            >
              {expanded ? "⤡ Collapse" : "⤢ Expand"}
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-3">
          {showTemplates && (
            <div className={messages.length > 0 ? "border-b border-line/50 pb-3" : ""}>
              <p className="mb-2 text-xs text-ink-muted">
                {messages.length === 0 ? "Try one of these, or ask your own question:" : "Suggested questions:"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => {
                  const resolved = resolveTemplate(t, firstName);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={sending}
                      onClick={() => sendMessage(resolved)}
                      className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-brand hover:text-ink disabled:opacity-50"
                    >
                      {resolved}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`rounded-lg px-3 py-2 text-sm ${m.chart ? "max-w-[95%]" : "max-w-[85%]"} ${
                  m.role === "user" ? "bg-brand text-black" : "bg-surface-2 text-ink"
                }`}
              >
                {m.role === "assistant" ? (
                  <MarkdownLite text={m.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}

                {m.chart?.type === "trajectory" && (
                  <div className="mt-2 rounded-lg border border-line/50 bg-bg/40 p-2">
                    <p className="mb-1 text-[11px] font-medium text-ink-muted">{m.chart.competency_name} · trajectory</p>
                    <TrajectoryChart history={m.chart.history} roleTargetLevel={m.chart.role_target_level} verdict={m.chart.verdict} />
                  </div>
                )}
                {m.chart?.type === "comparison" && (
                  <div className="mt-2 rounded-lg border border-line/50 bg-bg/40 p-2">
                    <p className="mb-1 text-[11px] font-medium text-ink-muted">Competency levels vs. role target</p>
                    <CompetencyComparisonChart competencies={m.chart.competencies} />
                  </div>
                )}

                {m.sources?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 border-t border-line/50 pt-2 text-[10px] text-ink-muted">
                    {m.sources.map((s) => (
                      <span key={s.chunk_id} className="rounded-full bg-bg px-2 py-0.5">
                        {s.employee_id}/{s.competency_id} · {new Date(s.occurred_at).toISOString().slice(0, 10)}
                      </span>
                    ))}
                  </div>
                )}

                {m.role === "assistant" && m.usage && (
                  <p className="mt-2 border-t border-line/50 pt-2 text-[10px] text-ink-muted">
                    {m.usage.totalTokens.toLocaleString()} tokens · {m.usage.promptTokens.toLocaleString()} in / {m.usage.outputTokens.toLocaleString()} out
                  </p>
                )}

                {m.role === "assistant" && m.followUps?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line/50 pt-2">
                    {m.followUps.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={sending}
                        onClick={() => sendMessage(q)}
                        className="rounded-full border border-brand/40 px-2.5 py-1 text-[11px] text-brand hover:bg-brand/10 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && <p className="text-xs text-ink-muted">Thinking…</p>}
          {error && <p className="text-xs text-declining">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={sending || !session}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:bg-brand-hover disabled:opacity-60"
          >
            Send
          </button>
        </form>

        {sessionUsage && (
          <p className="mt-1.5 text-right text-[10px] text-ink-muted">
            Session total: {sessionUsage.totalTokens.toLocaleString()} tokens ({sessionUsage.promptTokens.toLocaleString()} in / {sessionUsage.outputTokens.toLocaleString()} out)
          </p>
        )}
      </div>
    </>
  );
}
