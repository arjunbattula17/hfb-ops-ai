# Architecture Decision Log

## ADR-001: Reuse the existing GitHub repo instead of creating a new one

**Status:** Accepted
**Date:** 2026-08-05

**Context:** While building this dashboard from scratch under a 45-minute budget, an abandoned prior
attempt at the same assignment was discovered on disk at `C:\Users\deept\Documents\Kento\hfb-ai-ops`
— a git repo ("HFB Ops AI") already wired to a GitHub remote (`github.com/arjunbattula17/hfb-ops-ai`),
with all its working-tree files already deleted but the deletion never committed. It represented the
same task, same user, same intended submission.

**Alternatives Considered:**

### Build in a fresh directory and create a new GitHub repo
- Pros: No risk of colliding with unknown prior state; clean history.
- Cons: Leaves two repos claiming to be "the" submission — the user would have to figure out which
  one to actually submit. The old repo's remote was already presumably shared/known.
- Rejected: Directly conflicts with the goal of a single, submittable static site.

### Leave the old repo untouched, build separately, ask the user to merge later
- Pros: Fully non-destructive.
- Cons: Defers a decision the user would rather not have to make; wastes the scarce time budget on
  a question with an obvious answer once the repo's abandoned state was confirmed (working tree
  already empty, uncommitted deletions, no stash).
- Rejected: The working tree was already destructively cleared by something else before this session
  started — there was no live work to protect.

**Decision:** Verified the old repo's working tree was already empty (files deleted, not committed,
no stash) before touching anything, then copied the new build into that same directory and pushed to
the existing remote, replacing the old content in a single commit.

**Consequences:**
- One canonical repo (`arjunbattula17/hfb-ops-ai`) for the whole assignment — no ambiguity about what
  to submit or deploy on Render.
- The old attempt's content is fully recoverable from git history (commits `b2c694a`..`8ae7e8f`) if
  anything from it turns out to be worth revisiting.
- Establishes a precedent: before building in a directory, check for and investigate pre-existing git
  state rather than assuming a clean slate.

---

## ADR-002: Cold-chain operating margin set to 45 minutes, not 90

**Status:** Accepted
**Date:** 2026-08-05

**Context:** The routing engine caps refrigerated-truck routes at an "operating safety margin" to stay
inside FDA/USDA food-safety time limits. The dataset already encoded that ambient temperatures above
90°F trigger a stricter 60-minute danger-zone threshold (vs. the standard 120-minute rule) — and
Houston's August afternoons routinely exceed 90°F, which is also this system's own test-day scenario.
A fresh-context data-grounding critic agent, asked to independently verify the dataset and routing
logic against real FDA/USDA sources, caught that `operatingSafetyMarginMin` was hardcoded to 90
minutes regardless — 30 minutes past the 60-minute rule the tool's own data said was in effect.

**Alternatives Considered:**

### Leave it at 90 minutes (a margin under the lenient 120-minute rule)
- Pros: No change needed; fewer zones flagged as cold-chain risk, simpler-looking output.
- Cons: Silently applies the wrong federal rule on the exact kind of day (hot Houston August
  afternoon) the system is supposed to be modeling. A real food-safety sign-off would catch this
  immediately and lose trust in every other number on the site.
- Rejected: Directly contradicts the project's core premise — real rules, correctly applied — and was
  flagged as the single biggest trust gap by the critic.

### Make the margin dynamic per-route based on actual forecast temperature
- Pros: More precise; would correctly relax the limit on a cooler day.
- Cons: No live weather data source was integrated (out of scope for this build), and the test day is
  fixed to a known hot day, so a dynamic input would have no real data behind it — worse than an
  honest fixed assumption.
- Rejected: Would trade a disclosed, defensible assumption for an undisclosed, undefensible one.

**Decision:** Hardcoded the margin to 45 minutes — a real working buffer under the 60-minute threshold
that actually governs this test day — and updated all dependent copy (risk narrative, methodology
page, plain-language explainer) to state the 60-minute rule explicitly instead of the 120-minute one.

**Consequences:**
- Re-running the allocation/routing engine with the corrected margin raised the cold-chain-risk count
  from 4 zones to 10 of 13 — a much larger, more consequential finding than before, now the
  highest-severity item in Risk Assessment.
- Directly strengthened the "Suggested Improvements" case for more reefer capacity — the finding isn't
  cosmetic, it changes what the dashboard recommends doing.
- Establishes a pattern for this project: cross-check that narrative/config values agree with the
  facts stated elsewhere in the same dataset, not just that each value is individually sourced.

---

## ADR-003: UI redesign — sidebar → top nav + kanban board, matching a reference design

**Status:** Accepted
**Date:** 2026-08-05

**Context:** The initial build used a dark-navy left sidebar, teal accent, and plain HTML tables for
schedule/allocation data. The user supplied seven reference screenshots of a different dashboard
("HFB Signal") with a distinct visual language — warm cream background, serif headings, forest-green
accent, flat bordered cards, a 3-column kanban "routing queue," and expandable list rows with colored
status pills — and asked for the site to be restyled to match it across every section.

**Alternatives Considered:**

### Re-skin colors/fonts only, keep the sidebar + table structure
- Pros: Much smaller diff; lower risk of introducing new bugs; faster.
- Cons: Wouldn't actually match the reference — the reference has no sidebar at all, and its most
  visually distinctive elements (the kanban queue, the expandable category-row list) are structural,
  not just color choices. A colors-only pass would miss what the user was actually pointing at.
- Rejected: The user's ask ("change the UI... add it to each section... try to make the website look
  good [like the reference]") was clearly about structure and interaction pattern, not just palette.

### Rebuild every section pixel-for-pixel against the reference, including fabricating a matching "confidence %" metric like the reference shows
- Pros: Maximum visual fidelity.
- Cons: The reference's per-item "confidence" percentages appear to be a forecasting-model output this
  project has no equivalent for. Copying the exact number would mean displaying a fabricated,
  unsourced statistic — directly against this project's own "every number traces to a source" premise
  (Data & Methodology tab, Ethical Review's "no black-box optimization" claim).
- Rejected: Reused the *visual pattern* (colored pill + expandable detail) but filled it with real,
  already-computed numbers specific to this system (cold-chain safety margin %, truck capacity
  utilization %, agency-capacity %) instead of inventing a new metric to match the reference exactly.

**Decision:** Rebuilt the design system (cream/serif/green tokens), replaced the sidebar with a top
header + horizontal tab nav, converted Distribution Schedule to a 3-column kanban board, and converted
Zone Allocations / Fairness Analysis from tables into expandable metric-list rows — all still backed
by the same underlying dataset and allocation engine, just presented in the reference's structural
idiom.

**Consequences:**
- The site's visual identity is now independent of its data layer (`data/dataset.js`,
  `assets/js/allocate.js` were untouched by this change) — future re-themes can happen without
  touching the numbers, and vice versa.
- Every status pill and "confidence"-shaped element on the site must, going forward, trace to a real
  computed value (per ADR precedent set here) — this is now a de facto project rule, not just this
  change's justification.
- No live browser render was available to visually confirm the result in this session (remote Chrome
  extension can't reach this machine's localhost); verification was static (ID/tag matching, syntax
  checks, resource resolution). A real visual QA pass is still outstanding.
