import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

/**
 * Reliability curve — the chart that actually proves "when the system says
 * 90% confident, it's right ~90% of the time". Each point is one confidence
 * bin (avgConfidence vs. actual accuracy in that bin); the diagonal is
 * perfect calibration. Points below the diagonal are overconfident, above
 * are underconfident. Point size ~ bin sample count, so a bin backed by 3
 * pairs doesn't visually compete with one backed by 1700.
 */
export default function CalibrationChart({ bins }) {
  if (!bins || bins.length === 0) return <p className="text-meta text-ink-muted">No calibration bins.</p>;

  const data = bins.map((b) => ({ x: b.avgConfidence, y: b.accuracy, n: b.n, range: b.range }));
  const maxN = Math.max(...data.map((d) => d.n));

  return (
    <div className="chart-mount">
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="x" type="number" domain={[0.5, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          stroke="var(--color-ink-muted)" fontSize={12} tickLine={false}
          label={{ value: "predicted confidence", position: "insideBottom", offset: -4, fill: "var(--color-ink-muted)", fontSize: 11 }}
        />
        <YAxis
          dataKey="y" type="number" domain={[0.5, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} width={44}
          label={{ value: "actual accuracy", angle: -90, position: "insideLeft", fill: "var(--color-ink-muted)", fontSize: 11 }}
        />
        <ReferenceLine segment={[{ x: 0.5, y: 0.5 }, { x: 1, y: 1 }]} stroke="var(--color-ink-muted)" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          formatter={(value, name) => {
            if (name === "y") return [`${(value * 100).toFixed(1)}%`, "actual accuracy"];
            return [value, name];
          }}
          labelFormatter={(_, payload) => payload?.[0]?.payload ? `confidence bin ${payload[0].payload.range} (n=${payload[0].payload.n})` : ""}
        />
        <Scatter
          data={data}
          fill="var(--color-brand)"
          shape={(props) => {
            const r = 4 + (props.payload.n / maxN) * 14;
            return <circle cx={props.cx} cy={props.cy} r={r} fill="var(--color-brand)" fillOpacity={0.55} stroke="var(--color-brand)" strokeWidth={1.5} />;
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
    </div>
  );
}
