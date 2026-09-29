import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listEmployees, getMeta, exportUrl } from "../api/client.js";
import DivergenceBadge from "../components/DivergenceBadge.jsx";
import CompetencyStrip from "../components/CompetencyStrip.jsx";
import Sparkline from "../components/ui/Sparkline.jsx";
import { TableRowSkeleton } from "../components/ui/Skeleton.jsx";

const VERDICT_COLOR = {
  improving: "var(--color-improving)", declining: "var(--color-declining)",
  stagnating: "var(--color-stagnating)", insufficient_evidence: "var(--color-insufficient)",
};

/** The competency with the most "story" to tell: a confident direction over
 * a flat/unknown one, ties broken by confidence. Used for the one-per-row
 * Trend sparkline — six side-by-side sparklines would be too dense to read,
 * but "what's this person's headline trend" fits in one. */
function mostNotable(verdictSummary) {
  if (!verdictSummary?.length) return null;
  const rank = { improving: 2, declining: 2, stagnating: 1, insufficient_evidence: 0 };
  return [...verdictSummary].sort((a, b) => {
    const r = (rank[b.verdict] ?? 0) - (rank[a.verdict] ?? 0);
    return r !== 0 ? r : (b.confidence ?? 0) - (a.confidence ?? 0);
  })[0];
}

const VERDICTS = ["improving", "declining", "stagnating", "insufficient_evidence"];
const SHAPES = ["divergent", "uniform_improving", "uniform_declining", "mixed_flat"];
const QUICK_FILTERS = [
  { label: "Divergent profiles", shape: "divergent" },
  { label: "Any decline", verdict: "declining" },
  { label: "Uniform improving", shape: "uniform_improving" },
];

// Sorts the current PAGE only (not the full 500) — a lightweight affordance
// on top of server pagination, most useful combined with a shape/verdict
// filter that already narrows the set to something small and relevant.
const SORTERS = {
  default: null,
  divergence_desc: (a, b) => (b.divergence_score ?? -1) - (a.divergence_score ?? -1),
  declining_desc: (a, b) => (b.verdict_counts?.declining ?? 0) - (a.verdict_counts?.declining ?? 0),
};

export default function EmployeeList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState({ total: 0, employees: [] });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("default");
  const searchRef = useRef(null);

  // "/" focuses search — standard list-view convention (Gmail, GitHub, …),
  // skipped while already typing in a field so it doesn't hijack normal typing.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "/" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Filters live in the URL so a refresh or a shared link preserves them —
  // previously lost on every reload.
  const department = searchParams.get("department") || "";
  const verdict = searchParams.get("verdict") || "";
  const shape = searchParams.get("shape") || "";
  const q = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const PAGE_SIZE = 25;

  function updateParam(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      if (key !== "page") next.delete("page"); // any filter change resets to page 1
      return next;
    });
  }

  useEffect(() => {
    getMeta().then((m) => setDepartments(m.departments));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE };
    if (department) params.department = department;
    if (verdict) params.verdict = verdict;
    if (shape) params.shape = shape;
    if (q) params.q = q;
    listEmployees(params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [department, verdict, shape, q, page]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const sorter = SORTERS[sort];
  const rows = sorter ? [...data.employees].sort(sorter) : data.employees;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-title text-ink">Employees</h1>
          <p className="text-meta text-ink-muted">{data.total} people · continuous skill trajectories across 6 competencies</p>
        </div>
        <a
          href={exportUrl("employees.csv")}
          className="rounded-md border border-line px-3 py-2 text-sm text-ink-muted transition-colors hover:border-brand hover:text-ink"
        >
          ↓ Download CSV
        </a>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((f) => {
          const active = (f.shape && f.shape === shape && !f.verdict) || (f.verdict && f.verdict === verdict && !f.shape);
          return (
            <button
              key={f.label}
              onClick={() => {
                updateParam("shape", f.shape || "");
                updateParam("verdict", f.verdict || "");
              }}
              className={`text-meta rounded-full border px-2.5 py-1 transition-colors ${
                active ? "border-brand bg-brand/15 text-brand" : "border-line text-ink-muted hover:border-brand hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => updateParam("q", e.target.value)}
          placeholder="Search by name… (press /)"
          className="w-56 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
        <select
          value={department}
          onChange={(e) => updateParam("department", e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={verdict}
          onChange={(e) => updateParam("verdict", e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="">Any verdict</option>
          {VERDICTS.map((v) => (
            <option key={v} value={v}>{v.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          value={shape}
          onChange={(e) => updateParam("shape", e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="">Any profile shape</option>
          {SHAPES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          title="Sorts the current page only"
        >
          <option value="default">Default order</option>
          <option value="divergence_desc">Sort: divergence (this page)</option>
          <option value="declining_desc">Sort: declining count (this page)</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-meta uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Department / Role</th>
              <th className="px-4 py-3 font-medium">Team</th>
              <th className="px-4 py-3 font-medium">Trend</th>
              <th className="px-4 py-3 font-medium">Competencies</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)}
            {!loading && rows.map((e) => {
              const notable = mostNotable(e.verdict_summary);
              return (
                <tr key={e.employee_id} className="border-t border-line hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/employees/${e.employee_id}`} className="font-medium text-ink hover:text-brand">
                        {e.name}
                      </Link>
                      <DivergenceBadge shape={e.profile_shape} />
                    </div>
                    <div className="text-meta text-ink-muted">{e.employee_id}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{e.role_title}</td>
                  <td className="px-4 py-3 text-ink-muted">{e.team_id}</td>
                  <td className="px-4 py-3">
                    {notable && (
                      <div title={`${notable.competency_id.replace(/_/g, " ")}: ${notable.verdict.replace(/_/g, " ")}`}>
                        <Sparkline history={notable.sparkline} color={VERDICT_COLOR[notable.verdict]} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <CompetencyStrip verdictSummary={e.verdict_summary} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && data.total > PAGE_SIZE && (
        <div className="num mt-3 flex items-center justify-between text-sm text-ink-muted">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParam("page", String(Math.max(1, page - 1)))}
              disabled={page <= 1}
              className="rounded-md border border-line px-3 py-1.5 transition-colors hover:border-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              onClick={() => updateParam("page", String(Math.min(totalPages, page + 1)))}
              disabled={page >= totalPages}
              className="rounded-md border border-line px-3 py-1.5 transition-colors hover:border-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
