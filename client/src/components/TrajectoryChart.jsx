import {
  ComposedChart, Area, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

const VERDICT_COLOR = {
  improving: "var(--color-improving)",
  declining: "var(--color-declining)",
  stagnating: "var(--color-stagnating)",
  insufficient_evidence: "var(--color-insufficient)",
};

// Distinct stroke pattern per verdict — color alone shouldn't carry the
// distinction (colorblindness, grayscale printing, a dim projector).
// Combined with VerdictChip's glyphs (▲▼●◆), verdict identity survives
// losing color entirely.
const VERDICT_DASH = {
  improving: undefined, // solid
  declining: "6 3",
  stagnating: "10 3 2 3",
  insufficient_evidence: "1 3",
};

/**
 * forecast/nowT: when provided, extends the chart past the last observation
 * with a projected median line to the role target and an early/late band —
 * see forecast.js for what these numbers rest on. nowT is the absolute
 * chart-t (same axis as history[].t) that the forecast's own times (t
 * offsets from "now") are relative to.
 * regimeSinceT: when the operative verdict is a recency-override (see
 * evidence_window in the verdict doc), marks where the "current regime"
 * the verdict is actually based on begins — the chart still shows the full
 * history, but the reader can see which part of it the verdict used.
 * orgEvents: [{t, event_type}] — role/team/manager changes plotted as
 * vertical markers, so an inflection point next to a labeled event explains
 * itself instead of sitting disconnected in a pill list above the chart.
 * syncId: when several TrajectoryCharts share the same value (EmployeeDetail
 * passes one across all expanded competency cards), hovering one crosshairs
 * all of them at the matching QUARTER — syncMethod="value" rather than the
 * default index-based sync, since different competencies have different
 * observation counts/spacing on the same t-axis, so "the 3rd point" on one
 * chart is not the same quarter as "the 3rd point" on another.
 */
export default function TrajectoryChart({ history, roleTargetLevel, verdict, forecast, nowT, regimeSinceT, orgEvents, syncId }) {
  if (!history || history.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-ink-muted">No evidence history yet.</div>;
  }

  const data = history.map((h) => ({
    t: h.t,
    level: h.level,
    range: [Math.max(0, h.level - h.level_sd), Math.min(5, h.level + h.level_sd)],
    observed_level: h.observed_level,
  }));

  if (forecast?.reaches_target && nowT != null) {
    const lastLevel = data[data.length - 1].level;
    data.push({ t: nowT, level: lastLevel, forecast_median: lastLevel, forecast_range: [lastLevel, lastLevel] });
    if (forecast.median_t != null) {
      data.push({
        t: nowT + forecast.median_t,
        forecast_median: roleTargetLevel,
        forecast_range: [
          forecast.early_t != null ? roleTargetLevel : roleTargetLevel,
          forecast.late_t != null ? roleTargetLevel : roleTargetLevel,
        ],
      });
    }
  }

  const lineColor = VERDICT_COLOR[verdict] || "var(--color-brand)";
  const lineDash = VERDICT_DASH[verdict];
  const lastLevel = data[data.length - 1]?.level;

  return (
    <div className="chart-mount" role="img" aria-label={`Trajectory chart, ${verdict?.replace(/_/g, " ") || "no verdict"}, current level ${lastLevel?.toFixed(1) ?? "unknown"} of 5`}>
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} syncId={syncId} syncMethod="value">
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={(v) => `Q${Math.round(v) + 1}`}
          stroke="var(--color-ink-muted)"
          fontSize={12}
          tickLine={false}
        />
        <YAxis domain={[0, 5]} stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} width={28} />
        <Tooltip
          contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => `Quarter ${Math.round(v) + 1}`}
          formatter={(value, name) => {
            if (name === "range" || name === "forecast_range") return [null, null];
            if (name === "level") return [value.toFixed(2), "Estimated level"];
            if (name === "observed_level") return [value.toFixed(2), "Observed"];
            if (name === "forecast_median") return [value.toFixed(2), "Projected"];
            return [value, name];
          }}
        />
        {roleTargetLevel != null && (
          <ReferenceLine y={roleTargetLevel} stroke="var(--color-gold)" strokeDasharray="4 4"
            label={{ value: "Role target", position: "insideTopRight", fill: "var(--color-gold)", fontSize: 11 }} />
        )}
        {regimeSinceT != null && (
          <ReferenceLine x={regimeSinceT} stroke="var(--color-ink-muted)" strokeDasharray="2 2"
            label={{ value: "verdict based on evidence since here", position: "insideTopLeft", fill: "var(--color-ink-muted)", fontSize: 10 }} />
        )}
        {orgEvents?.map((ev) => (
          <ReferenceLine
            key={ev.event_id}
            x={ev.t}
            stroke="var(--color-brand)"
            strokeDasharray="3 2"
            strokeOpacity={0.6}
            label={{ value: ev.event_type.replace(/_/g, " "), position: "top", fill: "var(--color-brand)", fontSize: 10 }}
          />
        ))}
        <Area dataKey="range" stroke="none" fill={lineColor} fillOpacity={0.15} isAnimationActive={false} />
        {forecast?.reaches_target && (
          <Area dataKey="forecast_range" stroke="none" fill="var(--color-gold)" fillOpacity={0.12} isAnimationActive={false} />
        )}
        <Scatter dataKey="observed_level" fill="var(--color-ink-muted)" fillOpacity={0.6} r={2.5} isAnimationActive={false} />
        <Line dataKey="level" stroke={lineColor} strokeDasharray={lineDash} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
        {forecast?.reaches_target && (
          <Line dataKey="forecast_median" stroke="var(--color-gold)" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
        )}
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}
