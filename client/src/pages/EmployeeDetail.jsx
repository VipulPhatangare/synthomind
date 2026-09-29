import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { getEmployee, exportUrl, getForecasts, getVerdictAsOf } from "../api/client.js";
import EmployeeSummaryBand from "../components/EmployeeSummaryBand.jsx";
import CompetencyComparisonChart from "../components/CompetencyComparisonChart.jsx";
import CompetencyCard from "../components/CompetencyCard.jsx";
import EvidenceDrawer from "../components/EvidenceDrawer.jsx";
import DivergenceCallout from "../components/DivergenceCallout.jsx";
import TimeTravelControl from "../components/TimeTravelControl.jsx";
import ChatPanel from "../components/ChatPanel.jsx";
import SectionCard from "../components/ui/SectionCard.jsx";
import Skeleton, { CardSkeleton } from "../components/ui/Skeleton.jsx";

// Matches server/data_gen/archetypes.js QUARTERS[0].start — needed client-side
// only to place the forecast's "now" and org events on the same chart t-axis
// as level_history.
const DATASET_START = Date.UTC(2024, 9, 1);
const MS_PER_QUARTER = 91.25 * 86400000;
const tFor = (date) => (new Date(date).getTime() - DATASET_START) / MS_PER_QUARTER;

export default function EmployeeDetail() {
  const { employeeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [drawerCompetency, setDrawerCompetency] = useState(null);
  const [forecasts, setForecasts] = useState({});
  const [asOf, setAsOf] = useState(null); // { date, byCompetency: { [cid]: result } }
  const [asOfLoading, setAsOfLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Expanded-card state: deep-linked via ?competency= (Overview / showcase
  // cards land here with exactly one card open), otherwise defaults to just
  // the first competency with a verdict — reading all six to form an
  // impression was the problem this collapsing fixes.
  const [expanded, setExpanded] = useState(() => new Set(searchParams.get("competency") ? [searchParams.get("competency")] : []));
  const whyDefaultOpen = searchParams.get("why") === "1";

  useEffect(() => {
    setData(null);
    setForecasts({});
    setAsOf(null);
    getEmployee(employeeId).then((d) => {
      setData(d);
      setExpanded((prev) => {
        if (prev.size > 0) return prev;
        const first = d.competencies.find((c) => c.verdict)?.competency_id;
        return first ? new Set([first]) : prev;
      });
    });
  }, [employeeId]);

  useEffect(() => {
    getForecasts(employeeId).then((d) => setForecasts(d.forecasts)).catch(() => {});
  }, [employeeId]);

  const orgEventsWithT = useMemo(
    () => (data?.org_events || []).map((ev) => ({ ...ev, t: tFor(ev.occurred_at) })),
    [data]
  );

  function toggleExpand(competencyId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(competencyId)) next.delete(competencyId);
      else next.add(competencyId);
      return next;
    });
    // Deep link stays in sync so a reload / share keeps the same card open.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("competency", competencyId);
      return next;
    }, { replace: true });
  }

  async function handleReplay(date) {
    if (!data) return;
    setAsOfLoading(true);
    try {
      const pairs = await Promise.all(
        data.competencies
          .filter((c) => c.verdict)
          .map((c) => getVerdictAsOf(employeeId, c.competency_id, date).then((r) => [c.competency_id, r]))
      );
      setAsOf({ date, byCompetency: Object.fromEntries(pairs) });
    } finally {
      setAsOfLoading(false);
    }
  }

  if (!data) {
    return (
      <div>
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  const { employee, competencies, org_events, profile } = data;
  const comparisonData = competencies.map((c) => ({
    competency_id: c.competency_id, name: c.name,
    level: c.verdict?.level_mu, verdict: c.verdict?.verdict, role_target_level: c.verdict?.role_target_level,
  }));

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <Link to="/employees" className="text-meta text-ink-muted hover:text-brand">← Employees</Link>
            <h1 className="text-title mt-1 text-ink">{employee.name}</h1>
            <p className="text-meta text-ink-muted">
              {employee.role_title} · {employee.team_id} · {employee.location}
              {employee.status === "departed" && <span className="ml-2 text-declining">· departed (Q{employee.departure_quarter + 1})</span>}
            </p>
          </div>
          <a
            href={exportUrl(`employee/${employee.employee_id}.csv`)}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink-muted transition-colors hover:border-brand hover:text-ink"
          >
            ↓ Download CSV
          </a>
        </div>

        {org_events?.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2 text-meta text-ink-muted">
            {org_events.map((ev) => (
              <span key={ev.event_id} className="rounded-full border border-line px-2.5 py-1">
                {ev.event_type.replace(/_/g, " ")} · {new Date(ev.occurred_at).toISOString().slice(0, 10)}
              </span>
            ))}
          </div>
        )}

        <EmployeeSummaryBand competencies={competencies} profile={profile} />
        <DivergenceCallout profile={profile} />

        <SectionCard title="All competencies at a glance" className="mb-6">
          <CompetencyComparisonChart competencies={comparisonData} />
        </SectionCard>

        <TimeTravelControl
          onReplay={handleReplay}
          onReset={() => setAsOf(null)}
          active={!!asOf}
          loading={asOfLoading}
        />

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {competencies.map((c) => (
            <CompetencyCard
              key={c.competency_id}
              competency={c}
              expanded={expanded.has(c.competency_id)}
              onToggleExpand={() => toggleExpand(c.competency_id)}
              forecast={forecasts[c.competency_id]}
              asOfResult={asOf?.byCompetency?.[c.competency_id]}
              asOfDate={asOf?.date}
              orgEvents={orgEventsWithT}
              nowT={c.verdict ? tFor(c.verdict.updated_at) : null}
              onViewEvidence={() => setDrawerCompetency(c.competency_id)}
              whyDefaultOpen={whyDefaultOpen && expanded.has(c.competency_id)}
              syncId={`employee-${employeeId}-trajectories`}
            />
          ))}
        </div>

        {drawerCompetency && (
          <EvidenceDrawer
            employeeId={employee.employee_id}
            competencyId={drawerCompetency}
            onClose={() => setDrawerCompetency(null)}
          />
        )}
      </div>

      {/* Chat rail — collapsed by default so it doesn't cost ~30% of the
          viewport on every visit; opens as a slide-in panel when wanted. */}
      {chatOpen ? (
        <div className="w-full shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-8rem)] lg:w-96">
          <div className="mb-2 flex justify-end">
            <button onClick={() => setChatOpen(false)} className="text-meta text-ink-muted hover:text-ink">
              Hide chat ✕
            </button>
          </div>
          <ChatPanel
            scopedEmployeeId={employee.employee_id}
            scopedEmployeeName={employee.name}
            title={`Ask about ${employee.name.split(" ")[0]}`}
          />
        </div>
      ) : (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-10 rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-black shadow-xl shadow-black/40 transition-colors hover:bg-brand-hover lg:static lg:self-start"
        >
          Ask about {employee.name.split(" ")[0]} →
        </button>
      )}
    </div>
  );
}
