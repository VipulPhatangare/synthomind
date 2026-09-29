import {
  ComposedChart, Bar, Cell, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// Same reserved status palette as VerdictChip/TrajectoryChart — verdict
// color always means the same thing across the app.
const VERDICT_COLOR = {
  improving: "var(--color-improving)",
  declining: "var(--color-declining)",
  stagnating: "var(--color-stagnating)",
  insufficient_evidence: "var(--color-insufficient)",
};

const VERDICT_LABEL = {
  improving: "Improving",
  declining: "Declining",
  stagnating: "Stagnating",
  insufficient_evidence: "Insufficient evidence",
};

function shortLabel(name) {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

export default function CompetencyComparisonChart({ competencies }) {
  if (!competencies || competencies.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-ink-muted">No verdicts yet.</div>;
  }

  const data = competencies.map((c) => ({
    ...c,
    label: shortLabel(c.name),
    level: c.level != null ? Math.max(0, Math.min(5, c.level)) : 0,
  }));
  const presentVerdicts = [...new Set(data.map((d) => d.verdict))];

  return (
    <div className="chart-mount">
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--color-ink-muted)"
            fontSize={10}
            tickLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={38}
          />
          <YAxis domain={[0, 5]} stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} width={24} />
          <Tooltip
            contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.name}
            formatter={(value, name) => {
              if (name === "level") return [Number(value).toFixed(2), "Current level"];
              if (name === "role_target_level") return [value, "Role target"];
              return [value, name];
            }}
          />
          <Bar dataKey="level" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.competency_id} fill={VERDICT_COLOR[d.verdict] || VERDICT_COLOR.insufficient_evidence} />
            ))}
          </Bar>
          <Scatter dataKey="role_target_level" fill="var(--color-gold)" shape="diamond" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-muted">
        {presentVerdicts.map((v) => (
          <span key={v} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[v] || VERDICT_COLOR.insufficient_evidence }} />
            {VERDICT_LABEL[v] || v}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rotate-45" style={{ background: "var(--color-gold)" }} />
          Role target
        </span>
      </div>
    </div>
  );
}
