# TalentIQ — Continuous Talent Intelligence Platform

**Live demo:** [talentiq.vipulphatangare.space](https://talentiq.vipulphatangare.space/)

A longitudinal skill/competency tracker that answers, per employee per
competency: **is this person improving, stagnating, or declining — and how
confident are we, given the evidence we actually have?**

Built against the brief: combine multiple evidence sources, track
trajectories across cycles, call improving/stagnating/declining *per
competency* (not one score), recommend evidence-backed development actions,
and be explicit when the evidence isn't enough to call it.

## Architecture

```
data/           synthetic CSVs (employees, evidence, assessments, feedback, KPIs, ...)
server/         Node/Express API + the analytics engine (MongoDB)
client/         React (Vite) dashboard
```

Evidence (assessments, training, projects, manager/peer feedback,
self-assessment, KPIs) is normalized into a single `evidence_events` stream,
weighted by source reliability / rater credibility / specificity /
independence, and fed to a per-pair **local-linear-trend Kalman filter**
(level + velocity, continuous time — no binning to fixed cycles). The
posterior velocity goes through a **ROPE (Region of Practical Equivalence)**
test to produce one of four verdicts: `improving`, `stagnating`,
`declining`, or `insufficient_evidence`, gated by an **Evidence Sufficiency
Score** (volume × recency × diversity × independence × span, geometric
mean) so a confident-looking posterior built on thin evidence can't produce
a confident verdict.

### What's layered on top

- **Adaptive process noise** — process noise is estimated per-series from
  the normalized innovation sequence, so a genuinely noisy trajectory isn't
  misread as a trending one.
- **Regime-aware verdicts** — a CUSUM changepoint localizer plus a
  BIC-compared two-regime fit lets a confident, independently-evidenced
  *recent* trend promote an abstention (never override an already-confident
  full-history verdict) — the fix for "flat for a year, then improving".
- **Divergence detection** — employee-level pass flagging profiles where one
  competency is confidently improving while another is confidently
  declining, with a significance-gated (Fisher's z) correlation check
  distinguishing genuine concurrent trade-offs from coincidence.
- **"What would change my mind"** — every `insufficient_evidence` verdict
  ships with a sized, concrete counterfactual: the cheapest realistic
  evidence addition that would cross the sufficiency gate.
- **Trajectory forecasting** — projects the posterior forward to estimate
  when a role target is reached, with a confidence band, and a second
  projection assuming the recommended action is taken.
- **Time travel** — replays the same pipeline against evidence as of an
  earlier date, so you can see the verdict actually change as evidence
  accrued.
- **Rater calibration** — per-rater leniency / range-restriction / halo
  index, computed globally, folded into event weighting.
- **Dispute correction loop** — resolving a dispute re-weights the disputed
  event and re-runs that pair's verdict immediately; the correction is
  visible on the employee's profile, not just the dispute record.
- **Recommendation outcome loop** — marking a recommendation's action
  complete snapshots a baseline; evaluating it later measures realized
  uplift, which is folded back into `action_catalog`'s ranking over time.
- **Fairness audit** — verdict distribution *and* evidence volume/diversity
  by a synthetic demographic field (audit-only, never a model input) — a
  verdict-parity check alone can miss an upstream evidence gap.

See `server/src/services/analytics/*.js` for the implementation — each file
carries a doc comment explaining the specific design decision and its
tradeoffs (most were validated against `server/data_gen/eval_report.json`,
not just asserted).

## Dashboard

React/Vite client (Tailwind v4, Recharts, hand-rolled SVG for sparklines and
heatmaps — no component library):

- **Overview** — org-wide entry point; **Employee List** / **Employee
  Detail** — per-competency verdicts, trajectory chart with forecast band,
  evidence drawer, "why this verdict" breakdown, and time travel control.
- **Team Rollup** — manager-level aggregation across direct reports.
- **Disputes** — raise/resolve evidence disputes; resolution re-weights the
  event and re-runs that pair's verdict live.
- **Bias Audit** — the fairness audit view (verdict distribution + evidence
  volume/diversity by synthetic demographic field).
- **Model Quality** — the `npm run evaluate` report (accuracy, calibration,
  abstention/risk-coverage) rendered as charts.
- **Chat** — RAG-backed assistant (Gemini) over embedded evidence + verdict
  summaries.
- **About** — the evidence pipeline and design-decision writeup, in-app.

Auth is JWT-based with a single seeded admin login (see `ADMIN_EMAIL` /
`ADMIN_PASSWORD` below); there's no self-serve signup.

## Setup

```bash
cd server && npm install
cd ../client && npm install
```

Create `server/.env`:

```
MONGODB_URI=              # required
MONGODB_DB_NAME=talentiq  # optional

OPENAI_API_KEY=           # optional — enables build-rag-index (embeddings)
GEMINI_API_KEY=           # optional — enables the Chat page

JWT_SECRET=
JWT_EXPIRE_DAYS=7         # optional
ADMIN_EMAIL=              # seeded admin login, created by init-db
ADMIN_PASSWORD=

PORT=4000                 # optional
CLIENT_ORIGIN=http://localhost:5173   # optional, for CORS
```

```bash
cd server
npm run init-db           # creates collections + indexes + seeds admin login (idempotent)
npm run generate-data     # synthetic dataset -> data/*.csv -> Mongo
npm run run-analytics     # rater calibration, Kalman fit, verdicts, divergence
npm run build-rag-index   # embeds evidence + verdict summaries for chat (needs network)
npm run evaluate          # accuracy/calibration/abstention report vs. ground truth

npm run dev                     # API on :4000
cd ../client && npm run dev     # dashboard on :5173
```

Run `npm run run-analytics` again any time evidence or model logic changes
— it's idempotent — and re-run `npm run build-rag-index` afterward if you
want chat to reflect the new verdicts (it clears and rebuilds the index, so
it's a real cost, not just a refresh).

Other server scripts: `npm run export-csv` (dump current Mongo collections
back to `data/*.csv`), `npm run backup --all` (snapshot collections under
`server/backups/<timestamp>/`), `npm run update-action-uplift` (recompute
`action_catalog` ranking from the recommendation outcome loop). Client also
has `npm run lint` (oxlint) and `npm run build` (production build).

## Evaluation

`npm run evaluate` scores verdicts against the synthetic generator's ground
truth: raw accuracy, macro-F1, per-class precision/recall, calibration
(ECE), and abstention/risk-coverage quality (dangerous vs. boundary errors,
safe abstentions). Treat it as a self-consistency check against the
generator, not external validation.
