import { Link } from "react-router-dom";
import SectionCard from "../components/ui/SectionCard.jsx";
import Term from "../components/ui/Term.jsx";

const PIPELINE_STAGES = [
  {
    n: 1, title: "Evidence normalization",
    body: "Assessments, training results, project outcomes, manager/peer feedback, self-assessment, and KPIs are all normalized into one evidence_events stream, tagged by employee, competency, source type, and timestamp — no source is treated as more authoritative by default.",
  },
  {
    n: 2, title: "Weighting",
    body: "Every observation gets a composite weight: source reliability × rater credibility × specificity × independence × extraction confidence × attribution factor. A vague, secondhand, low-specificity comment counts for less than a detailed, direct, individually-attributed one.",
  },
  {
    n: 3, title: "Rater calibration",
    body: "Computed once, globally, across every manager/peer rating: each rater's leniency (systematically high/low), range restriction (rates everyone the same), and halo index (doesn't differentiate between competencies) feed back into that rater's credibility in step 2 — so a lenient rater's 4/5 doesn't count the same as a strict rater's 4/5.",
  },
  {
    n: 4, title: "Continuous trajectory fit",
    body: "A local-linear-trend Kalman filter — level + velocity, two states — over CONTINUOUS time (irregular gaps between observations, in quarters, not binned to fixed review cycles). Process noise is estimated per series from the innovation sequence, so a genuinely noisy trajectory isn't misread as a trending one.",
  },
  {
    n: 5, title: "Regime detection",
    body: "A changepoint localizer finds where a trend most likely shifted. When the evidence since that point independently supports a confident verdict on its own, it's allowed to promote an otherwise-diluted \"insufficient evidence\" read — never to override a verdict the full history already supported confidently.",
  },
  {
    n: 6, title: "Verdict (ROPE test)",
    body: "The velocity posterior is tested against a Region of Practical Equivalence: is enough probability mass past ±0.15/quarter to call it a real, confident direction — or does it belong in the \"no real change\" band. Four outcomes: improving, declining, stagnating, insufficient_evidence.",
  },
  {
    n: 7, title: "Evidence sufficiency gate",
    body: "A geometric mean of volume, recency, diversity, independence, and span — deliberately geometric, not arithmetic, so one collapsed component (everything from a single rater) vetoes the score instead of being averaged away. Below the gate, the verdict is forced to insufficient_evidence regardless of how confident the posterior looks.",
  },
  {
    n: 8, title: "Divergence & recommendations",
    body: "Across an employee's competencies: profile shape (divergent / uniform / mixed) and statistically significant (Fisher's z-gated) trade-off pairs. Per competency: a root-cause diagnosis from the evidence pattern, a matched development action, and — when the verdict abstained — a sized counterfactual for what evidence would resolve it.",
  },
];

const DECISIONS = [
  {
    title: "Why abstention is a first-class output, not a fallback",
    body: "insufficient_evidence is computed, not defaulted to on error. A tight-looking posterior built on thin or single-source evidence is still bad evidence — the sufficiency gate forces the honest answer even when the math alone looks confident.",
  },
  {
    title: "Why continuous time, not review cycles",
    body: "Binning evidence into fixed quarterly/annual cycles throws away exactly the information that makes a trajectory continuous. The Kalman filter's transition step uses the actual elapsed time between observations, however irregular.",
  },
  {
    title: "Why regime promotion only ever upgrades an abstention",
    body: "It would be easy to let a confident recent trend simply overrule an older one. That's exactly the kind of recency bias a rigorous system should resist. The rule here is asymmetric: a confident recent regime can turn \"we don't know\" into a real answer, but it can never override a verdict the full history already supported.",
  },
  {
    title: "Why the correlation behind a trade-off pair is significance-gated",
    body: "A raw Pearson r on a handful of points is close to meaningless — at n=3, even r=0.99 doesn't clear p<0.05. Trade-off pairs use Fisher's z-transform for a real p-value, and even then only establish CONCURRENT opposite movement, not causation.",
  },
];

export default function About() {
  return (
    <div>
      <h1 className="text-title text-ink">About this platform</h1>
      <p className="text-meta mb-6 mt-1 max-w-3xl text-ink-muted">
        What TalentIQ actually does under the hood — the evidence pipeline, the model, and the specific design
        decisions behind it. For the quick tour, see <Link to="/" className="text-brand hover:text-brand-hover">Overview</Link>;
        for the accuracy numbers, see <Link to="/model-quality" className="text-brand hover:text-brand-hover">Model Quality</Link>.
      </p>

      <SectionCard title="The problem" className="mb-6">
        <p className="text-section text-ink">
          Traditional assessments give a snapshot at one point in time. Capability actually changes continuously —
          through projects, training, feedback, and new responsibilities — and a snapshot can't tell you whether
          someone is improving, stagnating, or declining, only where they stand today.
        </p>
        <p className="text-meta mt-2 text-ink-muted">
          TalentIQ answers that question per competency (not as one blended score), combines every evidence source
          the org already produces, and is explicit about when the evidence isn't enough to call it — with a sized,
          concrete statement of what would change that, not just a shrug.
        </p>
      </SectionCard>

      <h2 className="text-title mb-3 text-ink">The pipeline</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {PIPELINE_STAGES.map((s) => (
          <div key={s.n} className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-meta font-semibold text-brand">
                {s.n}
              </span>
              <h3 className="text-section text-ink">{s.title}</h3>
            </div>
            <p className="text-meta text-ink-muted">{s.body}</p>
          </div>
        ))}
      </div>

      <h2 className="text-title mb-3 text-ink">Design decisions worth knowing about</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {DECISIONS.map((d) => (
          <SectionCard key={d.title} title={d.title}>
            <p className="text-meta text-ink-muted">{d.body}</p>
          </SectionCard>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="What's also in the system">
          <ul className="text-meta list-disc space-y-1.5 pl-4 text-ink-muted">
            <li><Term term="calibration">Rater calibration</Term> — per-rater leniency/range-restriction/halo, computed globally</li>
            <li>Time travel — replays the pipeline against evidence as of an earlier date, no shortcuts</li>
            <li>Trajectory forecasting — projects the posterior forward to an ETA on the role target, with a confidence band</li>
            <li>Dispute correction loop — resolving a dispute re-weights the disputed event and re-runs that pair's verdict immediately</li>
            <li>Recommendation outcome loop — marking an action complete snapshots a baseline; evaluating it later measures realized uplift and feeds back into how future actions are ranked</li>
            <li>Fairness audit — verdict distribution AND evidence volume/diversity by a synthetic demographic field (audit-only, never a model input)</li>
          </ul>
        </SectionCard>

        <SectionCard title="Tech stack">
          <div className="grid grid-cols-2 gap-3 text-meta text-ink-muted">
            <div>
              <p className="mb-1 font-medium text-ink">Server</p>
              <p>Node.js, Express, MongoDB</p>
              <p>Analytics engine — hand-rolled Kalman filter, ROPE test, no ML framework</p>
              <p>Gemini for the RAG-backed chat assistant</p>
            </div>
            <div>
              <p className="mb-1 font-medium text-ink">Client</p>
              <p>React, Vite, React Router</p>
              <p>Recharts for charts, hand-rolled SVG for sparklines/heatmaps</p>
              <p>Tailwind v4, no component library</p>
            </div>
          </div>
          <p className="text-meta mt-3 text-ink-muted">
            Full source-level detail lives in code comments next to the decisions themselves —
            <code> server/src/services/analytics/*.js</code> — each file explains its own tradeoffs, most of them
            validated against <Link to="/model-quality" className="text-brand hover:text-brand-hover">the evaluation report</Link>,
            not just asserted.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
