const VERDICTS = ["improving", "declining", "stagnating", "insufficient_evidence"];
const LABEL = { improving: "Improving", declining: "Declining", stagnating: "Stagnating", insufficient_evidence: "Insuff." };

/** 4x4 confusion matrix as a CSS-grid heatmap — no chart library needed. */
export default function ConfusionMatrix({ matrix }) {
  if (!matrix) return null;
  const max = Math.max(...VERDICTS.flatMap((row) => VERDICTS.map((col) => matrix[row]?.[col] || 0)));

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid" style={{ gridTemplateColumns: `90px repeat(${VERDICTS.length}, 76px)` }}>
        <div />
        {VERDICTS.map((col) => (
          <div key={col} className="text-meta px-1 pb-1 text-center text-ink-muted">{LABEL[col]}</div>
        ))}
        {VERDICTS.map((row) => (
          <div key={row} className="contents">
            <div className="text-meta flex items-center justify-end pr-2 text-ink-muted">{LABEL[row]}</div>
            {VERDICTS.map((col) => {
              const n = matrix[row]?.[col] || 0;
              const intensity = max ? n / max : 0;
              const isDiagonal = row === col;
              const bg = isDiagonal
                ? `color-mix(in srgb, var(--color-improving) ${Math.round(intensity * 70)}%, var(--color-surface-2))`
                : n > 0
                  ? `color-mix(in srgb, var(--color-declining) ${Math.round(intensity * 55)}%, var(--color-surface-2))`
                  : "var(--color-surface-2)";
              return (
                <div
                  key={col}
                  className="num m-0.5 flex h-11 items-center justify-center rounded text-meta text-ink"
                  style={{ background: bg }}
                  title={`true ${LABEL[row]} → predicted ${LABEL[col]}: ${n}`}
                >
                  {n}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-meta mt-2 text-ink-muted">rows = ground truth · columns = predicted · diagonal = correct</p>
    </div>
  );
}
