# Houston Food Bank — Daily Distribution Ops Dashboard

A decision-support dashboard for a single day of Houston Food Bank food distribution:
per-center allocations, truck routing, fairness analysis, risk assessment, ethical
review, suggested improvements, and a plain-language explainer for staff — all backed
by real, sourced data and gated behind a human-approval step before anything is marked
"ready for dispatch."

**Static site. No backend, no build step, no framework.** Plain HTML/CSS/JS, entirely
computed client-side from `data/dataset.js` at page load.

## What's real vs. modeled

Every figure on the site carries a `sourced` / `computed` / `modeled` tag (see the
**Data & Methodology** tab in the app, or `data/dataset.js` directly):

- **sourced** — Feeding America's *Map the Meal Gap 2025* report (Harris County food
  insecurity), Houston Food Bank's own published facts (18-county service area,
  308,000 sq ft warehouse, 1,600+ active partners), USDA/FDA cold-chain rules (danger
  zone, 2-hour/4-hour rule), and real Harris/Fort Bend County ZIP poverty rates.
- **computed** — drive times and distances from the real Houston Food Bank warehouse
  (535 Portwall St) to 13 real Harris/Fort Bend County ZIP centroids, routed over the
  real road network via OSRM (OpenStreetMap-based routing), geocoded via Nominatim.
- **modeled** — ZIP-level food-insecurity rates (Map the Meal Gap only publishes
  county-level figures, so this scales the county rate by each ZIP's poverty rate),
  partner-agency names/capacities (HFB doesn't publish per-agency capacity data
  publicly), and a peak-hour congestion multiplier applied to OSRM's free-flow times.

This is a **representative single-day slice** — 1 warehouse, 6 vehicles, 13 zones — of
Houston Food Bank's real 18-county, 1,600+ partner operation, not a claim to model the
full network.

## Run it locally

No build step. Just serve the folder:

```bash
cd site
python -m http.server 8080   # or: npx serve .
```

Open `http://localhost:8080`.

## Deploy to Render (Static Site, zero config)

1. Push this repo to GitHub.
2. In Render: **New → Static Site** → connect the repo.
3. Root directory: `site` (if this folder isn't already the repo root).
4. Build command: *(leave empty)*. Publish directory: `.`
5. Deploy. `render.yaml` in this folder is picked up automatically for a
   [Render Blueprint](https://render.com/docs/blueprint-spec) deploy if preferred.

## Structure

```
site/
├── index.html            single-page app: nav + all sections
├── data/dataset.js        sourced ground-truth dataset
├── assets/js/allocate.js  allocation + routing engine (pure functions)
├── assets/js/app.js       rendering: tables, charts, map, approval gate
├── assets/css/style.css   design system
└── render.yaml            Render static-site config
```
