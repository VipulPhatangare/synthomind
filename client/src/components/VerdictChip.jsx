const STYLES = {
  improving: { color: "var(--color-improving)", label: "Improving", glyph: "▲" },
  declining: { color: "var(--color-declining)", label: "Declining", glyph: "▼" },
  stagnating: { color: "var(--color-stagnating)", label: "Stagnating", glyph: "●" },
  insufficient_evidence: { color: "var(--color-insufficient)", label: "Insufficient Evidence", glyph: "◆" },
};

export default function VerdictChip({ verdict, confidence, size = "md" }) {
  const s = STYLES[verdict] || STYLES.insufficient_evidence;
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${pad}`}
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${s.color} 40%, transparent)` }}
    >
      <span>{s.glyph}</span>
      <span>{s.label}</span>
      {confidence != null && <span className="opacity-70">· {(confidence * 100).toFixed(0)}%</span>}
    </span>
  );
}
