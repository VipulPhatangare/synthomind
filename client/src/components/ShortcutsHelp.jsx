import { useEffect, useState } from "react";

const SHORTCUTS = [
  { keys: "/", desc: "Focus search (Employees list)" },
  { keys: "Esc", desc: "Close an open drawer or dialog" },
  { keys: "?", desc: "Show this list" },
];

/**
 * Global "?" overlay listing available shortcuts — discoverable rather than
 * assumed. Mounted once in Layout so it works from any page.
 */
export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key !== "?" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
      setOpen((v) => !v);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-section mb-3 text-ink">Keyboard shortcuts</h3>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">{s.desc}</span>
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-meta text-ink">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
