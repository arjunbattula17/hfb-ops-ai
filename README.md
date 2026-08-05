# HFB AI Ops — Houston Food Bank Operations Dashboard

A real-data-only AI operations dashboard for Houston Food Bank, covering distribution logistics, volunteer scheduling, distribution fairness, waste reduction, and hurricane/disaster response.

**Live app:** https://arjunbattula17.github.io/hfb-ops-ai/
**Live build log (the actual builder/critic transcript):** https://arjunbattula17.github.io/hfb-ops-ai/status.html

## How it was built

For each of the 5 modules, a fresh-context **builder** subagent drafted the module using only facts traceable to real published sources (Houston Food Bank's own FY25 fact sheets, its Form 990 via ProPublica Nonprofit Explorer, Feeding America's Map the Meal Gap, and real UPS ORION / Amazon Last-Mile Routing Research Challenge / FedEx logistics benchmarks). A fresh-context, adversarial **critic** subagent then independently re-fetched and re-verified the load-bearing numbers, flagged anything fabricated, unsourced, or misquoted, scored the draft, and named the single biggest gap. That gap was sent back to the builder for one revision round, then re-checked by the critic again.

No number in this dashboard is invented. Anything that couldn't be verified from a real source is explicitly labeled as an estimate (with its derivation shown) or listed as an open/unresolved gap — see the Methodology & Sources section on the dashboard and the full research facts pack in `data.js`.

One module (Waste Reduction) still shows "critic not convinced" after one revision round — that's left visible intentionally rather than rubber-stamped, because the underlying HFB figure (85M lbs / 47% of output) rests on a single self-reported PDF read that couldn't be independently corroborated with a second source this session.

## Files

- `data.js` — the full output of the research + builder/critic pipeline: `DATA.research` (5 domains of live-sourced facts, with URLs) and `DATA.results` (per-module builder1/critic1/builder2/critic2)
- `app.js` — renders `DATA` into the dashboard (`index.html`)
- `status.js` — renders the builder→critic evolution transcript (`status.html`)
- `style.css` — shared styling, no build step

## Run it

Static site, no build: open `index.html`, or serve the folder (`python -m http.server`).
