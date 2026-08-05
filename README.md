# HFB Ops AI — Houston Food Bank Distribution Optimizer

A real, client-side optimization tool for the Houston Food Bank hackathon brief: food prioritization, delivery routing, volunteer scheduling, fairness, and a hurricane-response mode — all computed live in the browser from the brief's case-study data (no backend, no build step).

**Live app:** see repo "About" / GitHub Pages link.

## What it computes (not just describes)

1. **Food prioritization** — a live-adjustable weighted score (expiration urgency, pantry demand match, nutrition density) ranks the 5 inventory items.
2. **Delivery routing** — a cheapest-insertion VRP heuristic packs 3 trucks by capacity and geography, orders each route by nearest-neighbor from the warehouse, and reports real distance/fuel savings vs. a same-cargo "dedicated round trip per stop" baseline.
3. **Volunteer scheduling** — converts today's shipment plan into volunteer-hours (sorting + loading + unloading), splits it across Morning/Afternoon/Evening by typical workload share, and recommends reallocating the existing 80 volunteers instead of just flagging shortfalls.
4. **Fairness** — two-stage allocation: per-item proportional-fair split across pantries that requested it, then max-min fair share (water-filling) when total demand exceeds truck capacity, so small/specialized pantries aren't crowded out by large ones.
5. **Hurricane mode** — one toggle: doubles families-in-need, holds back a fuel reserve share of fleet capacity, and adds storm-prep volunteer-hours. Every other module recomputes against the new inputs live.

## Run it

Static site, no build: open `index.html`, or serve the folder (`python -m http.server`).

## Files

- `data.js` — the brief's dataset + explicitly-labeled assumptions (unit-weight conversions, coordinates, nutrition scores)
- `engine.js` — pure optimization functions (no DOM)
- `ui.js` — renders engine output, wires up controls
- All numeric assumptions not stated in the brief are commented `// ASSUMPTION:` in `data.js`/`engine.js` and surfaced in the app's Methodology tab.
