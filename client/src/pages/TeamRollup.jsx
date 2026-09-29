import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTeamRollup, getMeta } from "../api/client.js";
import StatTile from "../components/ui/StatTile.jsx";
import SectionCard from "../components/ui/SectionCard.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Skeleton from "../components/ui/Skeleton.jsx";
import Term from "../components/ui/Term.jsx";

function BenchBar({ n, total }) {
  const pct = total ? (n / total) * 100 : 0;
  const color = n === 0 ? "var(--color-declining)" : n === 1 ? "var(--color-gold)" : "var(--color-improving)";
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full" style={{ width: `${Math.max(pct, n > 0 ? 6 : 0)}%`, background: color }} />
    </div>
  );
}

export default function TeamRollup() {
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getMeta().then((m) => setDepartments(m.departments)); }, []);
  useEffect(() => {
    setLoading(true);
    getTeamRollup(department ? { department } : {}).then(setData).finally(() => setLoading(false));
  }, [department]);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-title text-ink">Team &amp; succession</h1>
          <p className="text-meta text-ink-muted">Bench depth per competency and manager-level verdict skew, built entirely from existing verdicts.</p>
        </div>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {loading && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {!loading && data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatTile
              label="Single points of failure"
              value={data.single_point_of_failure_count}
              sub="critical competencies, exactly 1 person above target"
              tone={data.single_point_of_failure_count > 0 ? "bad" : "good"}
            />
            <StatTile label="Org declining rate" value={`${(data.org_declining_rate * 100).toFixed(1)}%`} sub="baseline for manager skew below" />
            <StatTile label="Competencies tracked" value={data.bench_depth.length} />
          </div>

          <SectionCard title="Bench depth (thinnest first)" className="mb-6">
            {data.single_point_of_failure_count === 0 && (
              <div className="mb-3">
                <EmptyState
                  icon="✓"
                  tone="good"
                  title="No single points of failure"
                  detail="Every tracked competency has at least two people above the role target."
                />
              </div>
            )}
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-meta uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Competency</th>
                    <th className="px-3 py-2 font-medium">Bench</th>
                    <th className="px-3 py-2 font-medium">Above target</th>
                    <th className="px-3 py-2 font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bench_depth.map((b) => (
                    <tr key={b.competency_id} className={`border-t border-line ${b.is_single_point_of_failure ? "bg-declining/5" : ""}`}>
                      <td className="px-3 py-2 text-ink">{b.competency_id.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2"><BenchBar n={b.n_above_target} total={b.n_total} /></td>
                      <td className="num px-3 py-2 text-ink-muted">{b.n_above_target} / {b.n_total}</td>
                      <td className="px-3 py-2">
                        {b.is_single_point_of_failure ? (
                          <Link to={`/employees/${b.at_risk_employee_id}`} className="text-declining hover:underline">
                            ⚠ {b.at_risk_employee_id}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Manager rollup — declining-rate skew vs. org baseline">
            <p className="text-meta mb-3 text-ink-muted">
              A high skew could be a real team problem, or a <Term term="calibration">rater-calibration</Term> artifact
              — cross-check with the <Link to="/bias-audit" className="text-brand hover:text-brand-hover">bias audit</Link> before acting on it.
            </p>
            <div className="space-y-1.5">
              {data.manager_rollup.slice(0, 15).map((m) => (
                <div key={m.manager_id} className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                  <span className="text-ink">{m.manager_name}</span>
                  <span className="num flex items-center gap-3 text-meta text-ink-muted">
                    <span>{(m.declining_rate * 100).toFixed(0)}% declining</span>
                    <span style={{ color: m.skew_vs_org > 0.1 ? "var(--color-declining)" : "var(--color-ink-muted)" }}>
                      {m.skew_vs_org >= 0 ? "+" : ""}{(m.skew_vs_org * 100).toFixed(0)}pp vs org
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
