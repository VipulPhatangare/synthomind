const STYLES = {
  divergent: { color: "var(--color-declining)", label: "Divergent", glyph: "⇅" },
  uniform_improving: { color: "var(--color-improving)", label: "Uniform ↑", glyph: "▲" },
  uniform_declining: { color: "var(--color-declining)", label: "Uniform ↓", glyph: "▼" },
  mixed_flat: { color: "var(--color-stagnating)", label: "Flat", glyph: "●" },
  unclear: null,
};

/** Surfaces the employee-level divergence profile — "one skill improves while another weakens". */
export default function DivergenceBadge({ shape, size = "sm" }) {
  const s = STYLES[shape];
  if (!s) return null;
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${pad}`}
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${s.color} 40%, transparent)` }}
      title={shape === "divergent" ? "At least one competency confidently improving and one confidently declining" : undefined}
    >
      <span>{s.glyph}</span>
      <span>{s.label}</span>
    </span>
  );
}
