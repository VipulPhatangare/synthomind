/**
 * Competency × department heatmap — replaces the old headcount-by-department
 * bar chart as the dashboard's second visual. Headcount alone says nothing
 * about trajectory; this is the one view that shows "which department is
 * struggling on which competency" at a glance. Cell color is a diverging
 * scale on mean velocity, centered at 0 (flat) — plain CSS, no chart library.
 */
const MAX_VELOCITY_FOR_SCALE = 0.35; // clamps color intensity; true betas in this dataset run to ~0.35-0.4

function cellColor(meanVelocity) {
  const t = Math.max(-1, Math.min(1, meanVelocity / MAX_VELOCITY_FOR_SCALE));
  const color = t >= 0 ? "var(--color-improving)" : "var(--color-declining)";
  const intensity = Math.round(Math.abs(t) * 65); // 0-65% mix, keeps text legible at full intensity
  return `color-mix(in srgb, ${color} ${intensity}%, var(--color-surface-2))`;
}

export default function CompetencyHeatmap({ grid }) {
  if (!grid || grid.length === 0) {
    return <p className="text-meta text-ink-muted">No verdict data yet.</p>;
  }

  const departments = [...new Set(grid.map((c) => c.department))].sort();
  // Order competencies by how many departments have them (shared competencies
  // cluster left), then alphabetically — makes the grid's dense left block
  // and sparse right block visually obvious rather than random.
  const coverageByCompetency = new Map();
  for (const c of grid) coverageByCompetency.set(c.competency_id, (coverageByCompetency.get(c.competency_id) || 0) + 1);
  const competencies = [...coverageByCompetency.keys()].sort((a, b) => {
    const diff = coverageByCompetency.get(b) - coverageByCompetency.get(a);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const cellByKey = new Map(grid.map((c) => [`${c.department}::${c.competency_id}`, c]));

  return (
    <div className="chart-mount overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="text-meta sticky left-0 bg-surface pr-2 text-right text-ink-muted" />
            {competencies.map((cid) => (
              <th key={cid} className="text-meta w-14 px-1 pb-1 text-center font-normal text-ink-muted">
                <span className="block truncate" title={cid.replace(/_/g, " ")}>
                  {cid.replace(/_/g, " ").split(" ")[0]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {departments.map((dept) => (
            <tr key={dept}>
              <td className="text-meta sticky left-0 whitespace-nowrap bg-surface pr-2 text-right text-ink-muted">{dept}</td>
              {competencies.map((cid) => {
                const cell = cellByKey.get(`${dept}::${cid}`);
                if (!cell) {
                  return <td key={cid} className="h-8 w-14 rounded bg-surface-2/40" title={`${dept} · ${cid.replace(/_/g, " ")}: not applicable`} />;
                }
                return (
                  <td
                    key={cid}
                    className="num h-8 w-14 rounded text-center text-meta text-ink"
                    style={{ background: cellColor(cell.mean_velocity) }}
                    title={`${dept} · ${cid.replace(/_/g, " ")}\nmean velocity ${cell.mean_velocity >= 0 ? "+" : ""}${cell.mean_velocity.toFixed(2)}/qtr\nn=${cell.n} · sufficiency ${cell.mean_sufficiency.toFixed(2)}`}
                  >
                    {cell.mean_velocity >= 0 ? "+" : ""}{cell.mean_velocity.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-meta text-ink-muted">
        <span>declining</span>
        <span className="h-2.5 w-16 rounded-full" style={{ background: "linear-gradient(to right, var(--color-declining), var(--color-surface-2), var(--color-improving))" }} />
        <span>improving</span>
      </div>
    </div>
  );
}
