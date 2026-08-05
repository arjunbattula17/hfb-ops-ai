// ============================================================================
// UI glue: reads control state, calls engine.js, paints the DOM. No business
// logic lives here — every number displayed comes straight from engine.js.
// ============================================================================

const state = { hurricane: false, fuelReserve: 0.35, weights: { expiry: 0.5, demand: 0.3, nutrition: 0.2 }, volunteerOverride: null };
const fmt = n => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt1 = n => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const pantryById = Object.fromEntries(PANTRIES.map(p => [p.id, p]));
const TRUCK_COLORS = ["#d9611b", "#2f7d4f", "#4a6fa5"];

function currentPlan() { return computeShipmentPlan(state.weights, state.hurricane, state.fuelReserve); }
function currentVol(plan) { return computeVolunteerPlan(plan, state.hurricane, state.volunteerOverride); }

function applyRecommendedShifts(vol) {
  state.volunteerOverride = Object.fromEntries(vol.shifts.map(s => [s.id, s.recommendedHeadcount]));
  renderAll();
}
function resetShifts() {
  state.volunteerOverride = null;
  renderAll();
}

// ---- tabs -------------------------------------------------------------
document.querySelectorAll("nav.tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
  });
});

// ---- hurricane toggle ---------------------------------------------------
const hurricaneToggle = document.getElementById("hurricaneToggle");
const hurricaneCheckbox = document.getElementById("hurricaneCheckbox");
hurricaneToggle.addEventListener("click", (e) => {
  if (e.target !== hurricaneCheckbox) hurricaneCheckbox.checked = !hurricaneCheckbox.checked;
  state.hurricane = hurricaneCheckbox.checked;
  hurricaneToggle.classList.toggle("active", state.hurricane);
  document.getElementById("hurricaneLabel").textContent = "🌀 Hurricane Mode: " + (state.hurricane ? "ON" : "OFF");
  renderAll();
});

// ---- weight sliders -------------------------------------------------------
["wExpiry", "wDemand", "wNutrition"].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener("input", () => {
    state.weights.expiry = parseFloat(document.getElementById("wExpiry").value);
    state.weights.demand = parseFloat(document.getElementById("wDemand").value);
    state.weights.nutrition = parseFloat(document.getElementById("wNutrition").value);
    renderAll();
  });
});

function syncSliderLabels() {
  document.getElementById("wExpiryVal").textContent = state.weights.expiry.toFixed(2);
  document.getElementById("wDemandVal").textContent = state.weights.demand.toFixed(2);
  document.getElementById("wNutritionVal").textContent = state.weights.nutrition.toFixed(2);
}

// ---- render: overview -------------------------------------------------
function renderOverview(plan, vol, scores) {
  const banner = document.getElementById("hurricaneBanner");
  banner.innerHTML = state.hurricane
    ? `<div class="callout">🌀 <strong>Hurricane Mode active:</strong> families-in-need doubled at every pantry, ${Math.round(state.fuelReserve * 100)}% of fleet capacity held back as fuel reserve, and ${fmt(HURRICANE_EXTRA_HOURS_PER_PANTRY * PANTRIES.length)} extra volunteer-hours added for storm-prep tasks. All numbers below reflect this.</div>`
    : "";

  const totalDeferred = Object.values(plan.shortfallByPantry).reduce((a, b) => a + b, 0);
  const deficitShifts = vol.shifts.filter(s => s.deficit > 0).length;
  const stats = [
    { num: `${fmt(plan.totalRequested)} lb`, lbl: "Urgent food demand today", cls: "" },
    { num: `${fmt(totalDeferred)} lb`, lbl: "Deferred — won't fit today's run", cls: totalDeferred > 0 ? "warn" : "good" },
    { num: `${fmt1(100 - 100 * totalDeferred / plan.totalRequested)}%`, lbl: "Of urgent food shipped today", cls: totalDeferred > 0 ? "" : "good" },
    { num: `${deficitShifts}/3`, lbl: "Volunteer shifts understaffed", cls: deficitShifts > 0 ? "warn" : "good" },
  ];
  document.getElementById("overviewStats").innerHTML = stats.map(s =>
    `<div class="card stat ${s.cls}"><div class="num">${s.num}</div><div class="lbl">${s.lbl}</div></div>`).join("");

  document.getElementById("overviewPriorityTable").innerHTML =
    `<tr><th>Item</th><th class="num">Score</th><th>Expires in</th></tr>` +
    scores.map(s => `<tr><td>${s.name}</td><td class="num">${s.score.toFixed(3)}</td><td>${s.expiresInDays <= 2 ? `<span class="badge urgent">${s.expiresInDays}d</span>` : s.expiresInDays >= 365 ? `${(s.expiresInDays/365).toFixed(1)}y` : `${s.expiresInDays}d`}</td></tr>`).join("");

  const fulfillDiv = document.getElementById("overviewFulfillment");
  fulfillDiv.innerHTML = PANTRIES.map(p => {
    const ideal = plan.idealTotals[p.id] || 0;
    const granted = plan.finalAlloc[p.id] || 0;
    if (ideal <= 0) {
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px">
          <span><strong>${p.name}</strong> (${p.families} families — ${p.needs.join(", ")})</span>
          <span style="color:var(--ink-soft)">no urgent items today</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>
      </div>`;
    }
    const pct = 100 * granted / ideal;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px">
        <span><strong>${p.name}</strong> (${p.families} families — ${p.needs.join(", ")})</span>
        <span>${pct.toFixed(0)}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill ${pct >= 99.5 ? "green" : pct < 60 ? "red" : ""}" style="width:${Math.min(100, pct)}%"></div></div>
    </div>`;
  }).join("");
}

// ---- render: prioritization -------------------------------------------
function expiryBadge(days) {
  if (days <= 2) return `<span class="badge urgent">${days}d</span>`;
  if (days >= 365) return `<span class="badge wait">${(days / 365).toFixed(1)}y</span>`;
  return `<span class="badge wait">${days}d</span>`;
}

function renderPrioritization(scores) {
  const demandRaw = computeDemandMatchRaw();
  const top = scores[0];
  document.getElementById("priorityReadout").innerHTML =
    `<strong>Ship ${top.name} first</strong> — expires in ${top.expiresInDays <= 2 ? top.expiresInDays + " day" + (top.expiresInDays === 1 ? "" : "s") : (top.expiresInDays >= 365 ? (top.expiresInDays / 365).toFixed(1) + " years" : top.expiresInDays + " days")}, wanted by up to ${fmt(demandRaw[top.name])} families.`;

  document.getElementById("priorityTable").innerHTML =
    `<tr><th>Item</th><th>Expires in</th><th class="num">Urgency</th><th class="num">Demand match</th><th class="num">Nutrition</th><th class="num">Score</th></tr>` +
    scores.map(s => `<tr>
      <td>${s.name}</td>
      <td>${expiryBadge(s.expiresInDays)}</td>
      <td class="num">${s.urgency.toFixed(2)}</td>
      <td class="num">${s.demandMatch.toFixed(2)}</td>
      <td class="num">${s.nutrition.toFixed(2)}</td>
      <td class="num"><strong>${s.score.toFixed(2)}</strong></td>
    </tr>`).join("");
}

// ---- render: routing ----------------------------------------------------
function renderRouting(plan) {
  document.getElementById("truckTable").innerHTML =
    `<tr><th>Truck</th><th class="num">Load</th><th>Stops (warehouse → … → warehouse)</th><th class="num">Miles</th></tr>` +
    plan.routes.map((r, i) => `<tr>
      <td><span class="legend"><span class="swatch" style="background:${TRUCK_COLORS[i]}"></span>${r.truck.id}</span></td>
      <td class="num">${fmt(r.usedLbs)} / ${fmt(r.truck.capacityLbs)} lb</td>
      <td>${r.order.length ? r.order.map(o => pantryById[o.pantryId].name + " (" + fmt(o.lbs) + "lb)").join(" → ") : "—"}</td>
      <td class="num">${fmt1(r.distanceMiles)}</td>
    </tr>`).join("");

  document.getElementById("routeSavingsPct").textContent =
    plan.naiveDistance > 0 ? fmt1(100 * (plan.naiveDistance - plan.optimizedDistance) / plan.naiveDistance) + "%" : "—";
  const totalFuelCost = plan.routes.reduce((s, r) => s + r.fuelCost, 0);
  document.getElementById("routeFuelCost").textContent = "$" + fmt1(totalFuelCost);
  const totalDeferred = Object.values(plan.shortfallByPantry).reduce((a, b) => a + b, 0);
  document.getElementById("routeShortfall").textContent = fmt(totalDeferred);
  document.getElementById("routeShortfallCard").className = "card stat" + (totalDeferred > 0 ? " warn" : " good");

  drawRouteMap(plan);
}

function project(lat, lon, bounds) {
  const { minLat, maxLat, minLon, maxLon } = bounds;
  const x = 40 + (lon - minLon) / (maxLon - minLon) * 520;
  const y = 300 - (lat - minLat) / (maxLat - minLat) * 260;
  return [x, y];
}

function drawRouteMap(plan) {
  const svg = document.getElementById("routeMap");
  const allPts = [WAREHOUSE, ...PANTRIES];
  const bounds = {
    minLat: Math.min(...allPts.map(p => p.lat)) - 0.04, maxLat: Math.max(...allPts.map(p => p.lat)) + 0.04,
    minLon: Math.min(...allPts.map(p => p.lon)) - 0.04, maxLon: Math.max(...allPts.map(p => p.lon)) + 0.04,
  };
  let svgContent = "";
  plan.routes.forEach((r, i) => {
    if (!r.order.length) return;
    const pts = [WAREHOUSE, ...r.order.map(o => pantryById[o.pantryId]), WAREHOUSE];
    const path = pts.map(p => project(p.lat, p.lon, bounds).join(",")).join(" ");
    svgContent += `<polyline points="${path}" fill="none" stroke="${TRUCK_COLORS[i]}" stroke-width="2.5" stroke-dasharray="6 4" opacity="0.85" />`;
  });
  const [wx, wy] = project(WAREHOUSE.lat, WAREHOUSE.lon, bounds);
  svgContent += `<rect x="${wx - 8}" y="${wy - 8}" width="16" height="16" fill="#26231f" rx="3" /><text x="${wx}" y="${wy - 14}" font-size="11" text-anchor="middle" fill="#26231f" font-weight="700">Warehouse</text>`;
  PANTRIES.forEach(p => {
    const [x, y] = project(p.lat, p.lon, bounds);
    const served = (plan.finalAlloc[p.id] || 0) > 0;
    svgContent += `<circle cx="${x}" cy="${y}" r="9" fill="${served ? "#d9611b" : "#a89e8c"}" stroke="#fdf9f0" stroke-width="2" />
      <text x="${x}" y="${y + 4}" font-size="10" text-anchor="middle" fill="#fdf9f0" font-weight="700">${p.id}</text>
      <text x="${x}" y="${y + 24}" font-size="10.5" text-anchor="middle" fill="#26231f">${p.name}</text>`;
  });
  svg.innerHTML = svgContent;

  document.getElementById("routeLegend").innerHTML = plan.routes.map((r, i) =>
    `<span><span class="swatch" style="background:${TRUCK_COLORS[i]}"></span>${r.truck.id} — ${fmt1(r.distanceMiles)} mi</span>`).join("");
}

// ---- render: volunteers -------------------------------------------------
function renderVolunteers(vol) {
  const applied = !!state.volunteerOverride;
  document.getElementById("volunteerActionBar").innerHTML = applied
    ? `<span class="badge ok">Recommended plan applied</span> <button class="btn-link" id="btnResetShifts">reset to signed-up counts</button>`
    : `<button class="btn-apply" id="btnApplyShifts">Apply recommended reallocation →</button>`;

  document.getElementById("volunteerTable").innerHTML =
    `<tr><th>Shift</th><th>Staffing (signed up vs. workload needs)</th><th class="num">${applied ? "Applied" : "Signed up"}</th><th class="num">Recommended</th><th>Status</th></tr>` +
    vol.shifts.map(s => {
      let badge = `<span class="badge ok">balanced</span>`;
      if (s.deficit > 0) badge = `<span class="badge urgent">short ${s.deficit}</span>`;
      else if (s.rebalanceDelta <= -5 && !applied) badge = `<span class="badge wait">overstaffed</span>`;
      const maxScale = Math.max(s.available, s.neededHeadcount, s.recommendedHeadcount, 1);
      const availPct = Math.min(100, 100 * s.available / maxScale);
      const needPct = Math.min(100, 100 * s.neededHeadcount / maxScale);
      return `<tr>
        <td>${s.id}</td>
        <td>
          <div class="bar-track" style="height:14px;position:relative">
            <div class="bar-fill ${s.deficit > 0 ? "red" : "green"}" style="width:${availPct}%"></div>
            <div style="position:absolute;left:${needPct}%;top:-2px;bottom:-2px;width:2px;background:var(--ink)"></div>
          </div>
        </td>
        <td class="num">${s.available}</td>
        <td class="num">${s.recommendedHeadcount} <span style="color:${s.rebalanceDelta>0?"#c0392b":s.rebalanceDelta<0?"#2f7d4f":"inherit"}">(${s.rebalanceDelta>0?"+":""}${s.rebalanceDelta})</span></td>
        <td>${badge}</td></tr>`;
    }).join("");

  const applyBtn = document.getElementById("btnApplyShifts");
  if (applyBtn) applyBtn.addEventListener("click", () => applyRecommendedShifts(vol));
  const resetBtn = document.getElementById("btnResetShifts");
  if (resetBtn) resetBtn.addEventListener("click", resetShifts);

  document.getElementById("volunteerWorkloadBreakdown").innerHTML = `
    <div style="font-size:13px;line-height:2">
      <div>Sorting/packing (${fmt(INVENTORY.filter(i=>i.expiresInDays<=2).reduce((s,i)=>s+i.quantity*i.lbsPerUnit,0))} lb of urgent inventory): <strong>${fmt1(vol.sortingHours)}h</strong></div>
      <div>Truck loading (${vol.totalHours ? "at warehouse dock" : ""}): <strong>${fmt1(vol.loadingHours)}h</strong></div>
      <div>Pantry unloading (per stop): <strong>${fmt1(vol.unloadingHours)}h</strong></div>
      ${state.hurricane ? `<div>Storm-prep tasks (${PANTRIES.length} pantries): <strong>${fmt1(vol.extraHours)}h</strong></div>` : ""}
      <div style="border-top:1px solid var(--border); margin-top:6px; padding-top:6px">Total volunteer-hours needed: <strong>${fmt1(vol.totalHours)}h</strong> across ${vol.totalVolunteers} available volunteers</div>
    </div>`;
  document.getElementById("volunteerAssumptions").innerHTML =
    `Assumptions: ${LBS_PER_VOLUNTEER_HOUR_SORTING} lb sorted per volunteer-hour, ${HOURS_PER_TRUCK_LOAD}h per truck load/unload, ${SHIFT_LENGTH_HOURS}h shifts. Workload split across shifts (Morning 30% receiving, Afternoon 55% packing+loading+delivery, Evening 15% cleanup/prep) is an operational estimate, not from the brief — tune in engine.js.`;
}

// ---- render: fairness -------------------------------------------------
function renderFairness(plan) {
  const shortfalls = PANTRIES.map(p => ({ p, cut: plan.shortfallByPantry[p.id] || 0 })).filter(x => x.cut > 1e-6);
  const explainEl = document.getElementById("fairnessExplain");
  if (!shortfalls.length) {
    explainEl.innerHTML = `<div class="callout info">Every pantry with an urgent-batch need is fully served today — no shortfall to absorb.</div>`;
  } else {
    shortfalls.sort((a, b) => b.cut - a.cut);
    const satisfied = PANTRIES.filter(p => (plan.idealTotals[p.id] || 0) > 0 && (plan.shortfallByPantry[p.id] || 0) <= 1e-6).map(p => p.name);
    const parts = shortfalls.map(x => `${x.p.name} absorbs ${fmt(x.cut)} lb of shortfall`).join("; ");
    explainEl.innerHTML = `<div class="callout">${parts}${satisfied.length ? ` — because ${satisfied.join(" and ")}'s smaller request${satisfied.length > 1 ? "s are" : " is"} satisfied first under max-min fair share.` : "."}</div>`;
  }

  document.getElementById("fairnessTable").innerHTML =
    `<tr><th>Pantry</th><th class="num">Families</th><th class="num">Requested</th><th class="num">Allocated</th><th class="num">Fulfillment</th><th>Items shipped today</th></tr>` +
    PANTRIES.map(p => {
      const ideal = plan.idealTotals[p.id] || 0;
      const granted = plan.finalAlloc[p.id] || 0;
      const pctLabel = ideal > 0 ? (100 * granted / ideal).toFixed(0) + "%" : "no urgent need";
      const items = plan.finalBasket[p.id].map(b => `${b.name} ${fmt(b.shippedLbs)}lb`).join(", ") || "—";
      return `<tr><td><strong>${p.name}</strong><br><span style="color:var(--ink-soft);font-size:11.5px">${p.needs.join(", ")}</span></td>
        <td class="num">${p.families * (state.hurricane ? 2 : 1)}</td>
        <td class="num">${fmt(ideal)} lb</td>
        <td class="num">${fmt(granted)} lb</td>
        <td class="num">${pctLabel}</td>
        <td>${items}</td></tr>`;
    }).join("");
}

// ---- render: about ------------------------------------------------------
function renderAbout() {
  document.getElementById("aboutContent").innerHTML = `
  <h3>Q1 · Food prioritization</h3>
  <p>Each item gets <code>score = (w_expiry·urgency + w_demand·demandMatch + w_nutrition·nutrition) / (w_sum)</code>. Urgency scales 0→1 as expiry approaches (floor at 30 days out). Demand match is the item's share of total competing family-requests. Nutrition is an editorial 0–1 density estimate. Weights are adjustable on the Prioritization tab.</p>
  <h3>Q2 · Delivery optimization</h3>
  <p>Trucks are packed with a cheapest-insertion heuristic: cargo for each pantry goes to whichever truck+route adds the least extra driving distance, respecting capacity. Routes within a truck are ordered by nearest-neighbor from the warehouse. Compared against a same-cargo, same-stop-count "naive" baseline where every stop is a dedicated out-and-back trip — the gap is the pure routing/consolidation saving.</p>
  <h3>Q3 · Volunteer scheduling</h3>
  <p>Workload (sorting + truck loading + pantry unloading, in volunteer-hours) is estimated from today's shipment plan, split across shifts by typical daily task mix, then compared to current shift signups. "Recommended" headcount reallocates the same 80 volunteers proportional to where the workload actually falls.</p>
  <h3>Q4 · Fairness</h3>
  <p>Two-stage allocation: (1) each item is split across the pantries that want it, proportional to families; (2) if total demand exceeds truck capacity, max-min fair share (water-filling) fully satisfies the smallest requests first — capped at their own 100% ask, never over-served — then spreads any remaining shortfall across the larger, harder-to-fully-satisfy requesters, rather than favoring the largest or closest pantry outright. Within a pantry's own basket, the lowest priority-score item is trimmed first when a cut is required.</p>
  <h3>Q5 · Hurricane mode</h3>
  <p>Toggling it: (1) doubles families-in-need at every pantry per the brief; (2) holds back a fuel-reserve share of total truck capacity (default 35%, "fuel is limited"); (3) adds fixed storm-prep volunteer-hours per pantry. All four other modules recompute against these changed inputs — nothing is hardcoded for the hurricane case.</p>
  <h3>Known limitations</h3>
  <p>Routing/volunteer heuristics are greedy, not globally-optimal solvers (fine at this scale — 4 pantries, 3 trucks; would want an actual VRP/MILP solver, e.g. OR-Tools, at 50-pantry scale). Nutrition scores, labor throughput, and shift-workload split are editorial estimates, not sourced data — all flagged inline and easy to retune in the source files. Coordinates are illustrative, not real facility addresses.</p>
  `;
}

// ---- main render loop -----------------------------------------------------
function renderAll() {
  syncSliderLabels();
  const plan = currentPlan();
  const vol = currentVol(plan);
  const scores = computePriorityScores(state.weights);
  renderOverview(plan, vol, scores);
  renderPrioritization(scores);
  renderRouting(plan);
  renderVolunteers(vol);
  renderFairness(plan);
}

renderAbout();
renderAll();
