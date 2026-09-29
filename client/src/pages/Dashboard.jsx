import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { getDashboardSummary, getHeatmap } from "../api/client.js";
import VerdictChip from "../components/VerdictChip.jsx";
import CompetencyHeatmap from "../components/CompetencyHeatmap.jsx";
import StatTile from "../components/ui/StatTile.jsx";
import SectionCard from "../components/ui/SectionCard.jsx";
import Skeleton, { CardSkeleton } from "../components/ui/Skeleton.jsx";
import Term from "../components/ui/Term.jsx";

const VERDICT_COLOR = {
  improving: "#3fb56c", declining: "#e0475c", stagnating: "#5b8cff", insufficient_evidence: "#8a8a90",
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [heatmap, setHeatmap] = useState(null);

  useEffect(() => {
    getDashboardSummary().then(setData);
    getHeatmap().then((h) => setHeatmap(h.grid));
  }, []);

  if (!data) {
    return (
      <div>
        <Skeleton className="mb-6 h-6 w-40" />
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  const verdictData = Object.entries(data.verdict_distribution).map(([verdict, n]) => ({ verdict, n }));
  const total = verdictData.reduce((a, b) => a + b.n, 0);
  const coveragePct = total ? (((data.verdict_distribution.improving || 0) + (data.verdict_distribution.declining || 0) + (data.verdict_distribution.stagnating || 0)) / total) * 100 : 0;

  return (
    <div>
      <h1 className="text-title mb-1 text-ink">Org overview</h1>
      <p className="text-meta mb-6 text-ink-muted">{total} employee × competency pairs tracked</p>

      {/* Attention-first: what needs a look, not just distributions */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Declining on critical"
          value={data.declining_on_critical}
          sub="core competencies, not just any"
          tone={data.declining_on_critical > 0 ? "bad" : "good"}
        />
        <StatTile
          label="Stale evidence"
          value={data.stale_evidence_count}
          sub="verdicts on 6mo+ old input"
          tone={data.stale_evidence_count > 0 ? "warn" : "good"}
        />
        <StatTile
          label="Open disputes"
          value={data.open_disputes}
          href="/disputes"
        />
        <StatTile
          label="Divergent profiles"
          value={data.profile_shape_distribution?.divergent || 0}
          sub={`${data.n_tradeoff_pairs || 0} trade-off pairs`}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Verdict distribution">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={verdictData}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="verdict" tickFormatter={(v) => v.replace(/_/g, " ")} stroke="var(--color-ink-muted)" fontSize={11} tickLine={false} />
              <YAxis stroke="var(--color-ink-muted)" fontSize={12} tickLine={false} width={28} />
              <Tooltip contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 8 }} />
              <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                {verdictData.map((v) => <Cell key={v.verdict} fill={VERDICT_COLOR[v.verdict]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-meta mt-2 text-ink-muted">
            {coveragePct.toFixed(0)}% <Term term="abstention">committed to a directional or stagnating answer</Term> ·{" "}
            <Link to="/model-quality" className="text-brand hover:text-brand-hover">how good is this? →</Link>
          </p>
        </SectionCard>

        <SectionCard title="Competency × department" action={<Link to="/team" className="text-meta text-ink-muted hover:text-brand">bench depth →</Link>}>
          {heatmap ? <CompetencyHeatmap grid={heatmap} /> : <Skeleton className="h-48 w-full" />}
        </SectionCard>
      </div>

      <SectionCard
        title="Top-priority recommendations"
        action={<span className="text-meta text-ink-muted">sorted by gap × criticality × momentum</span>}
      >
        <div className="space-y-2">
          {data.top_priority_recommendations.map((r) => (
            <Link
              key={r.rec_id}
              to={`/employees/${r.employee_id}`}
              className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm transition-colors hover:border-brand"
            >
              <span className="text-ink">{r.employee_id} · {r.competency_id.replace(/_/g, " ")} — {r.action_name || "no action matched"}</span>
              <div className="flex items-center gap-2">
                <VerdictChip verdict={r.verdict} size="sm" />
                <span className="num text-meta text-ink-muted">priority {r.priority.toFixed(2)}</span>
              </div>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
