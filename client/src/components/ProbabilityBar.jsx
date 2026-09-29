/**
 * Stacked bar over the three-way verdict split (improving/stagnating/
 * declining), plus the velocity axis with the ROPE band drawn on it —
 * makes "84% confident" mean something instead of being a bare number.
 * probs: { improving, declining, stagnating } (sums to ~1).
 */
export default function ProbabilityBar({ probs, velocityMu, velocitySd, delta = 0.15 }) {
  if (!probs) return null;
  const segments = [
    { key: "declining", pct: probs.declining, color: "var(--color-declining)" },
    { key: "stagnating", pct: probs.stagnating, color: "var(--color-stagnating)" },
    { key: "improving", pct: probs.improving, color: "var(--color-improving)" },
  ];

  // Velocity axis: center on 0, span wide enough to show the posterior mean
  // and a couple of standard deviations either side, plus the ROPE band.
  const span = Math.max(Math.abs(velocityMu) + 3 * (velocitySd || 0.1), delta * 2, 0.4);
  const toPct = (v) => ((v + span) / (span * 2)) * 100;

  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.key}
            style={{ width: `${Math.max(s.pct * 100, 0)}%`, background: s.color }}
            title={`P(${s.key}) = ${(s.pct * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-meta text-ink-muted">
        <span>P(declining) {(probs.declining * 100).toFixed(0)}%</span>
        <span>P(stagnating) {(probs.stagnating * 100).toFixed(0)}%</span>
        <span>P(improving) {(probs.improving * 100).toFixed(0)}%</span>
      </div>

      {velocityMu != null && (
        <div className="mt-3">
          <div className="relative h-6 w-full rounded bg-surface-2">
            {/* ROPE band */}
            <div
              className="absolute inset-y-0 rounded bg-ink-muted/15"
              style={{ left: `${toPct(-delta)}%`, width: `${toPct(delta) - toPct(-delta)}%` }}
            />
            {/* zero line */}
            <div className="absolute inset-y-0 w-px bg-ink-muted/40" style={{ left: `${toPct(0)}%` }} />
            {/* posterior mean marker */}
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
              style={{ left: `${toPct(velocityMu)}%`, background: velocityMu > delta ? "var(--color-improving)" : velocityMu < -delta ? "var(--color-declining)" : "var(--color-stagnating)" }}
            />
          </div>
          <p className="text-meta mt-1 text-ink-muted">
            velocity {velocityMu >= 0 ? "+" : ""}{velocityMu.toFixed(2)}/qtr · shaded band = ±{delta} "no real change" zone
          </p>
        </div>
      )}
    </div>
  );
}
