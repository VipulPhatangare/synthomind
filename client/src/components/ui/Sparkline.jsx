/**
 * Tiny inline-SVG trajectory preview for dense contexts (table rows,
 * showcase cards) where a full Recharts TrajectoryChart is too heavy —
 * EmployeeList renders up to 25 rows × up to 6 competencies at once.
 * Accepts either shape: [{t, level}] (verdict.level_history, used on the
 * detail page) or [[t, level]] (the compact form the list endpoint sends,
 * deliberately stripped of level_sd/observed_level/eventId per point).
 */
export default function Sparkline({ history, color = "var(--color-brand)", width = 44, height = 16 }) {
  const levels = (history || []).map((h) => (Array.isArray(h) ? h[1] : h.level));
  if (levels.length < 2) {
    return <span className="inline-block" style={{ width, height }} aria-hidden="true" />;
  }

  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const span = max - min || 1;
  const pad = 2;

  const points = levels.map((level, i) => {
    const x = pad + (i / (levels.length - 1)) * (width - pad * 2);
    const y = height - pad - ((level - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastPoint = points[points.length - 1].split(",").map(Number);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trajectory sparkline">
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="1.6" fill={color} />
    </svg>
  );
}
