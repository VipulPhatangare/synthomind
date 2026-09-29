import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getBiasAudit } from "../api/client.js";
import SectionCard from "../components/ui/SectionCard.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Skeleton from "../components/ui/Skeleton.jsx";

export default function BiasAudit() {
  const [data, setData] = useState(null);
  useEffect(() => { getBiasAudit().then(setData); }, []);

  if (!data) {
    return (
      <div>
        <Skeleton className="mb-6 h-6 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const verdicts = ["improving", "declining", "stagnating", "insufficient_evidence"];
  const chartData = verdicts.map((v) => ({
    verdict: v.replace(/_/g, " "),
    "Group A": data.verdict_distribution_by_group.A[v] || 0,
    "Group B": data.verdict_distribution_by_group.B[v] || 0,
  }));

  const totalA = Object.values(data.verdict_distribution_by_group.A).reduce((a, b) => a + b, 0);
  const totalB = Object.values(data.verdict_distribution_by_group.B).reduce((a, b) => a + b, 0);
  const maxPctPointGap = totalA && totalB
    ? Math.max(...verdicts.map((v) =>
        Math.abs((data.verdict_distribution_by_group.A[v] || 0) / totalA - (data.verdict_distribution_by_group.B[v] || 0) / totalB)
      )) * 100
    : null;

  const specA = data.avg_feedback_specificity_by_group.A;
  const specB = data.avg_feedback_specificity_by_group.B;
  const specDelta = specA != null && specB != null ? Math.abs(specA - specB) : null;

  const noDisparity = maxPctPointGap != null && maxPctPointGap < 3 && specDelta != null && specDelta < 0.03;

  return (
    <div>
      <h1 className="text-title text-ink">Fairness audit</h1>
      <p className="text-meta mb-6 max-w-2xl text-ink-muted">{data.note}</p>

      <div className="mb-4">
        {noDisparity ? (
          <EmptyState
            icon="✓"
            tone="good"
            title="No significant disparity detected"
            detail={`Verdict distribution differs by at most ${maxPctPointGap.toFixed(1)} percentage points between groups; feedback specificity differs by ${specDelta.toFixed(3)}.`}
          />
        ) : (
          <div className="rounded-lg border border-gold/40 bg-gold/10 p-4">
            <p className="text-section text-gold">⚠ A gap worth investigating</p>
            <p className="text-meta mt-1 text-ink-muted">
              Largest verdict-distribution gap: {maxPctPointGap?.toFixed(1)} percentage points. Check whether it traces to evidence
              volume/diversity below before assuming it reflects real performance differences.
            </p>
          </div>
        )}
      </div>

      <SectionCard title="Verdict distribution by group" className="mb-4">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="verdict" stroke="var(--color-ink-muted)" fontSize={11} tickLine={false} />
            <YAxis stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} width={28} />
            <Tooltip contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Group A" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Group B" fill="var(--color-gold)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Average feedback specificity by group" className="mb-4">
        <p className="num text-sm text-ink-muted">
          Group A: <span className="text-ink">{specA?.toFixed(3)}</span> · Group B: <span className="text-ink">{specB?.toFixed(3)}</span>
        </p>
        <p className="text-meta mt-2 text-ink-muted">
          {specDelta != null && specDelta < 0.03
            ? "No meaningful disparity detected in this dataset — feedback specificity is statistically indistinguishable between groups."
            : "A gap this size would warrant investigating whether written feedback is systematically vaguer for one group."}
        </p>
      </SectionCard>

      {data.evidence_volume_audit && (
        <SectionCard title="Evidence volume & diversity audit">
          <p className="text-meta mb-3 max-w-2xl text-ink-muted">{data.evidence_volume_audit.note}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="num rounded-lg border border-line bg-surface-2 p-3 text-sm">
              <p className="text-meta text-ink-muted">Avg observations / pair</p>
              <p className="mt-1 text-ink">A: {data.evidence_volume_audit.avg_observations_per_pair_by_group.A} · B: {data.evidence_volume_audit.avg_observations_per_pair_by_group.B}</p>
            </div>
            <div className="num rounded-lg border border-line bg-surface-2 p-3 text-sm">
              <p className="text-meta text-ink-muted">Avg sufficiency score</p>
              <p className="mt-1 text-ink">A: {data.evidence_volume_audit.avg_sufficiency_score_by_group.A} · B: {data.evidence_volume_audit.avg_sufficiency_score_by_group.B}</p>
            </div>
            <div className="num rounded-lg border border-line bg-surface-2 p-3 text-sm">
              <p className="text-meta text-ink-muted">Avg source-type diversity</p>
              <p className="mt-1 text-ink">A: {data.evidence_volume_audit.avg_source_type_diversity_by_group.A} · B: {data.evidence_volume_audit.avg_source_type_diversity_by_group.B}</p>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
