// ============================================================================
// Optimization engine — pure functions, no DOM. All numbers are computed live
// from data.js + the current control settings (weights, hurricane mode, etc).
// ============================================================================

const URGENCY_THRESHOLD_DAYS = 2; // items expiring within this window ship "today"
const AVG_TRUCK_SPEED_MPH = 30; // ASSUMPTION: urban/suburban delivery speed

// ---- 1. Food prioritization -------------------------------------------------

function computeDemandMatchRaw() {
  // total families across all pantries that would accept each item
  const raw = {};
  for (const item of INVENTORY) {
    raw[item.name] = PANTRIES.reduce((sum, p) => sum + (pantryWantsItem(p, item.name) ? p.families : 0), 0);
  }
  return raw;
}

function computePriorityScores(weights) {
  const demandRaw = computeDemandMatchRaw();
  const maxDemand = Math.max(...Object.values(demandRaw));
  const wSum = weights.expiry + weights.demand + weights.nutrition;
  return INVENTORY.map(item => {
    const urgency = Math.max(0, 1 - Math.min(item.expiresInDays, 30) / 30);
    const demandMatch = maxDemand ? demandRaw[item.name] / maxDemand : 0;
    const nutrition = item.nutrition;
    const score = (weights.expiry * urgency + weights.demand * demandMatch + weights.nutrition * nutrition) / wSum;
    return { name: item.name, urgency, demandMatch, nutrition, score, expiresInDays: item.expiresInDays };
  }).sort((a, b) => b.score - a.score);
}

// ---- 2. SKU-level fair split (proportional to families, per item) ---------

function computeSkuFairSplit(hurricaneMode) {
  // Doubling every pantry's families equally does not change the *proportions*
  // used to split a fixed physical inventory — but we keep the doubled family
  // counts around for the "% of families served" impact metric.
  const famMult = hurricaneMode ? 2 : 1;
  const split = {}; // split[itemName][pantryId] = lbs
  for (const item of INVENTORY) {
    split[item.name] = {};
    const wanting = PANTRIES.filter(p => pantryWantsItem(p, item.name));
    const totalFamilies = wanting.reduce((s, p) => s + p.families * famMult, 0);
    for (const p of wanting) {
      const share = totalFamilies ? (p.families * famMult) / totalFamilies : 0;
      split[item.name][p.id] = item.quantity * item.lbsPerUnit * share;
    }
  }
  return split;
}

// ---- 3. Max-min fair share (water-filling) across pantries on capacity ----

function maxMinFairShare(demands, capacity) {
  let ids = Object.keys(demands).filter(id => demands[id] > 1e-9);
  const remaining = { ...demands };
  const allocated = {};
  ids.forEach(id => (allocated[id] = 0));
  let cap = Math.max(0, capacity);
  while (ids.length > 0 && cap > 1e-9) {
    const share = cap / ids.length;
    let satisfiedAny = false;
    for (const id of [...ids]) {
      if (remaining[id] <= share + 1e-9) {
        allocated[id] += remaining[id];
        cap -= remaining[id];
        remaining[id] = 0;
        ids = ids.filter(x => x !== id);
        satisfiedAny = true;
      }
    }
    if (!satisfiedAny) {
      for (const id of ids) {
        allocated[id] += share;
        remaining[id] -= share;
      }
      cap = 0;
    }
  }
  return allocated;
}

// ---- 4. Full shipment plan: allocate -> trim to capacity -> pack trucks ---

function computeShipmentPlan(weights, hurricaneMode, fuelReservePct) {
  const priorityByName = {};
  computePriorityScores(weights).forEach(p => (priorityByName[p.name] = p.score));

  const skuSplit = computeSkuFairSplit(hurricaneMode);
  const urgentItems = INVENTORY.filter(i => i.expiresInDays <= URGENCY_THRESHOLD_DAYS);

  // ideal (uncapacitated) basket per pantry: [{name, lbs, priorityScore}]
  const idealBasket = {};
  PANTRIES.forEach(p => (idealBasket[p.id] = []));
  for (const item of urgentItems) {
    for (const p of PANTRIES) {
      const lbs = skuSplit[item.name][p.id] || 0;
      if (lbs > 1e-9) idealBasket[p.id].push({ name: item.name, lbs, priorityScore: priorityByName[item.name] });
    }
  }
  const idealTotals = {};
  PANTRIES.forEach(p => (idealTotals[p.id] = idealBasket[p.id].reduce((s, b) => s + b.lbs, 0)));

  const totalCapacity = TRUCKS.reduce((s, t) => s + t.capacityLbs, 0) * (1 - (hurricaneMode ? fuelReservePct : 0));
  const totalRequested = Object.values(idealTotals).reduce((a, b) => a + b, 0);

  const finalAlloc = maxMinFairShare(idealTotals, totalCapacity); // pantryId -> lbs granted

  // trim each pantry's basket down to its granted total, cutting lowest-priority items first
  const finalBasket = {};
  const shortfallByPantry = {};
  for (const p of PANTRIES) {
    const granted = finalAlloc[p.id] || 0;
    const ideal = idealTotals[p.id] || 0;
    const cut = Math.max(0, ideal - granted);
    shortfallByPantry[p.id] = cut;
    const sorted = [...idealBasket[p.id]].sort((a, b) => a.priorityScore - b.priorityScore);
    let remainingCut = cut;
    const shipped = idealBasket[p.id].map(b => ({ ...b, shippedLbs: b.lbs }));
    for (const low of sorted) {
      if (remainingCut <= 1e-9) break;
      const row = shipped.find(x => x.name === low.name);
      const take = Math.min(row.shippedLbs, remainingCut);
      row.shippedLbs -= take;
      remainingCut -= take;
    }
    finalBasket[p.id] = shipped.filter(s => s.shippedLbs > 1e-9);
  }

  // pack trucks: cheapest-insertion heuristic (distance-aware, not just size-aware) —
  // greedily assigns each pantry's cargo to whichever truck+route adds the least
  // extra driving distance, so multi-stop trucks only combine pantries that are
  // actually on the way to each other. Prevents "consolidation" that's geographically
  // worse than dedicated round trips.
  const pantryById = Object.fromEntries(PANTRIES.map(p => [p.id, p]));
  const pantryTotalsForPacking = PANTRIES
    .map(p => ({ pantryId: p.id, lbs: finalBasket[p.id].reduce((s, b) => s + b.shippedLbs, 0) }))
    .filter(x => x.lbs > 1e-9)
    .sort((a, b) => b.lbs - a.lbs);

  function nnRouteDistance(stops) {
    const ids = [...new Set(stops.map(s => s.pantryId))];
    let current = WAREHOUSE, dist = 0, remaining = [...ids];
    while (remaining.length) {
      let bestIdx = 0, bestD = Infinity;
      remaining.forEach((id, idx) => {
        const d = haversineMiles(current, pantryById[id]);
        if (d < bestD) { bestD = d; bestIdx = idx; }
      });
      dist += bestD;
      current = pantryById[remaining[bestIdx]];
      remaining.splice(bestIdx, 1);
    }
    dist += haversineMiles(current, WAREHOUSE);
    return dist;
  }

  const truckAssignments = TRUCKS.map(t => ({ truck: t, stops: [], usedLbs: 0, remaining: t.capacityLbs }));
  for (const p of pantryTotalsForPacking) {
    let toPlace = p.lbs;
    while (toPlace > 1e-6) {
      let best = null;
      for (const ts of truckAssignments) {
        if (ts.remaining <= 1e-6) continue;
        const take = Math.min(ts.remaining, toPlace);
        const before = nnRouteDistance(ts.stops);
        const after = nnRouteDistance([...ts.stops, { pantryId: p.pantryId, lbs: take }]);
        const marginal = after - before;
        if (!best || marginal < best.marginal) best = { ts, take, marginal };
      }
      if (!best) break; // no truck capacity left (shouldn't happen: totals matched to capacity)
      best.ts.stops.push({ pantryId: p.pantryId, lbs: best.take });
      best.ts.remaining -= best.take;
      best.ts.usedLbs += best.take;
      toPlace -= best.take;
    }
  }

  const routes = truckAssignments.map(a => {
    const byPantry = {};
    a.stops.forEach(s => (byPantry[s.pantryId] = (byPantry[s.pantryId] || 0) + s.lbs));
    let remaining = Object.keys(byPantry);
    let current = WAREHOUSE;
    const order = [];
    while (remaining.length) {
      let bestIdx = 0, bestDist = Infinity;
      remaining.forEach((id, idx) => {
        const d = haversineMiles(current, pantryById[id]);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      });
      const chosen = remaining.splice(bestIdx, 1)[0];
      order.push({ pantryId: chosen, lbs: byPantry[chosen] });
      current = pantryById[chosen];
    }
    let dist = 0;
    let prev = WAREHOUSE;
    for (const stop of order) {
      dist += haversineMiles(prev, pantryById[stop.pantryId]);
      prev = pantryById[stop.pantryId];
    }
    dist += haversineMiles(prev, WAREHOUSE); // return leg
    const driveHours = dist / AVG_TRUCK_SPEED_MPH;
    const fuelGal = dist / a.truck.mpg;
    const fuelCost = fuelGal * FUEL_PRICE_PER_GAL;
    return { truck: a.truck, usedLbs: a.usedLbs, order, distanceMiles: dist, driveHours, fuelGal, fuelCost };
  });

  // naive baseline: same cargo, same number of truck-stops, but every stop is its
  // own dedicated out-and-back trip (no multi-stop routing). By the triangle
  // inequality this is always >= the consolidated route distance — it isolates
  // the saving that comes specifically from combining stops onto one continuous
  // route instead of returning to base between every delivery.
  const naiveDistance = routes.reduce(
    (s, r) => s + r.order.reduce((s2, stop) => s2 + 2 * haversineMiles(WAREHOUSE, pantryById[stop.pantryId]), 0), 0
  );
  const optimizedDistance = routes.reduce((s, r) => s + r.distanceMiles, 0);

  const totalStops = routes.reduce((s, r) => s + r.order.length, 0);

  return {
    weights, hurricaneMode, fuelReservePct,
    totalCapacity, totalRequested,
    idealTotals, finalAlloc, finalBasket, shortfallByPantry,
    routes, naiveDistance, optimizedDistance, totalStops,
    totalTruckLoads: routes.filter(r => r.usedLbs > 0).length,
  };
}

// ---- 5. Volunteer scheduling -------------------------------------------------

const WORKLOAD_SHARE = { Morning: 0.30, Afternoon: 0.55, Evening: 0.15 }; // ASSUMPTION: typical daily ops split
const HURRICANE_EXTRA_HOURS_PER_PANTRY = 50; // ASSUMPTION: storm-prep tasks (extra sorting, pre-positioning, shelter kits)

function computeVolunteerPlan(shipmentPlan, hurricaneMode) {
  const urgentLbs = INVENTORY.filter(i => i.expiresInDays <= URGENCY_THRESHOLD_DAYS)
    .reduce((s, i) => s + i.quantity * i.lbsPerUnit, 0);
  const sortingHours = urgentLbs / LBS_PER_VOLUNTEER_HOUR_SORTING;
  const loadingHours = shipmentPlan.totalTruckLoads * HOURS_PER_TRUCK_LOAD;
  const unloadingHours = shipmentPlan.totalStops * HOURS_PER_TRUCK_LOAD;
  const demandMultiplier = hurricaneMode ? 2 : 1;
  const extraHours = hurricaneMode ? HURRICANE_EXTRA_HOURS_PER_PANTRY * PANTRIES.length : 0;
  const totalHours = (sortingHours + loadingHours + unloadingHours) * demandMultiplier + extraHours;
  const totalVolunteers = VOLUNTEER_SHIFTS.reduce((s, v) => s + v.available, 0);

  const shifts = VOLUNTEER_SHIFTS.map(v => {
    const neededHours = totalHours * WORKLOAD_SHARE[v.id];
    const neededHeadcount = Math.ceil(neededHours / SHIFT_LENGTH_HOURS);
    const recommendedHeadcount = Math.round(totalVolunteers * WORKLOAD_SHARE[v.id]);
    return {
      id: v.id, available: v.available, neededHours, neededHeadcount, recommendedHeadcount,
      deficit: Math.max(0, neededHeadcount - v.available),
      rebalanceDelta: recommendedHeadcount - v.available,
    };
  });

  return { totalHours, totalVolunteers, shifts, sortingHours, loadingHours, unloadingHours, extraHours };
}
