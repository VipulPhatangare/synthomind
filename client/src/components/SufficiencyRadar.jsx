const COMPONENT_LABEL = {
  volume: "Volume", recency: "Recency", diversity: "Diversity",
  independence: "Independence", span: "Span",
};
const FLAG_TO_COMPONENT = {
  single_rater_or_source: "independence", single_source_type: "diversity",
  self_report_only: "diversity", stale: "recency", very_thin: "volume",
  halo_suspected: "independence",
};

/**
 * Five components collapsed to one word ("Strong"/"Weak") elsewhere in the
 * app — this shows WHY: "everything from one rater" reads very differently
 * from "evidence is 14 months old", and both currently look identical as a
 * single sufficiency score.
 */
export default function SufficiencyRadar({ components, flags = [] }) {
  if (!components) return null;
  const flaggedComponents = new Set(flags.map((f) => FLAG_TO_COMPONENT[f]).filter(Boolean));

  return (
    <div className="space-y-1.5">
      {Object.entries(components).map(([key, value]) => {
        const isFlagged = flaggedComponents.has(key);
        const color = value >= 0.6 ? "var(--color-improving)" : value >= 0.3 ? "var(--color-gold)" : "var(--color-declining)";
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-meta w-24 shrink-0 text-ink-muted">{COMPONENT_LABEL[key] || key}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${Math.min(value, 1) * 100}%`, background: color }} />
            </div>
            <span className="num w-10 text-right text-meta text-ink-muted">{value.toFixed(2)}</span>
            {isFlagged && <span className="text-meta text-declining" title="Flagged as a weak point">⚠</span>}
          </div>
        );
      })}
    </div>
  );
}
