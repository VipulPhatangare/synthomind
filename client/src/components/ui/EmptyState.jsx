/**
 * Explains WHY a view is empty rather than looking broken — e.g.
 * "single points of failure: 0" needs to read as a positive finding, not a
 * loading glitch, and "no evidence disputed" is different from "no data".
 */
export default function EmptyState({ icon = "✓", title, detail, tone = "neutral" }) {
  const color = tone === "good" ? "var(--color-improving)" : tone === "warn" ? "var(--color-gold)" : "var(--color-ink-muted)";
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-8 text-center">
      <span className="mb-2 text-xl" style={{ color }}>{icon}</span>
      <p className="text-section text-ink">{title}</p>
      {detail && <p className="text-meta mt-1 max-w-sm text-ink-muted">{detail}</p>}
    </div>
  );
}
