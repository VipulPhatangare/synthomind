/**
 * Extracted from Dashboard.jsx and TeamRollup.jsx, which each defined an
 * identical inline StatTile — one shared version so a visual change doesn't
 * need to happen twice. `tone` colors the value for a stat that's good/bad
 * news (e.g. "0 dangerous errors" in green, "3 single points of failure" in
 * red); omit it for neutral stats.
 */
const TONE_COLOR = {
  good: "var(--color-improving)",
  bad: "var(--color-declining)",
  warn: "var(--color-gold)",
};

export default function StatTile({ label, value, sub, tone, href, onClick }) {
  const Wrapper = href || onClick ? "button" : "div";
  const interactive = !!(href || onClick);

  const content = (
    <>
      <p className="text-meta uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="num mt-1 text-display" style={tone ? { color: TONE_COLOR[tone] } : undefined}>
        {value}
      </p>
      {sub && <p className="text-meta mt-1 text-ink-muted">{sub}</p>}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className="block rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-brand"
      >
        {content}
      </a>
    );
  }

  return (
    <Wrapper
      onClick={onClick}
      className={`rounded-xl border border-line bg-surface p-4 text-left ${
        interactive ? "transition-colors hover:border-brand" : ""
      }`}
    >
      {content}
    </Wrapper>
  );
}
