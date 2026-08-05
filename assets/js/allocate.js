/**
 * ALLOCATION + ROUTING ENGINE
 * Pure functions over HFB_DATA. No network calls, no build step — runs entirely
 * client-side so the static site is fully self-contained.
 *
 * Disclosed modeling assumptions (surfaced in the UI, not hidden):
 *   - COLD_SHARE: fraction of each zone's allocation assumed perishable (produce/
 *     dairy/protein) vs shelf-stable dry goods. Typical food-bank product mix.
 *   - CONGESTION_MULTIPLIER: peak-hour Harris County traffic factor applied to
 *     OSRM's free-flow driving-time baseline.
 *   - DWELL_MIN_PER_STOP: loading/unloading time added per route stop.
 */
const ALLOC_ASSUMPTIONS = {
  COLD_SHARE: 0.28,
  CONGESTION_MULTIPLIER: 1.25,
  DWELL_MIN_PER_STOP: 12,
};

function computeZoneNeed(data) {
  const { countyBaseline, zones } = data;
  return zones.map((z) => {
    const fiRatePct = countyBaseline.foodInsecurityRatePct * (z.povertyRatePct / countyBaseline.povertyRateProxyPct);
    const fiRateClamped = Math.max(3, Math.min(45, fiRatePct));
    const fiPopulation = Math.round(z.populationEst * (fiRateClamped / 100));
    return { ...z, fiRatePct: fiRateClamped, fiPopulation };
  });
}

function allocatePounds(zonesWithNeed, fleet) {
  const totalDailyLbs = fleet.reduce((s, t) => s + t.capacityLbs, 0);
  const totalNeed = zonesWithNeed.reduce((s, z) => s + z.fiPopulation, 0);

  let working = zonesWithNeed.map((z) => ({
    ...z,
    idealLbs: (z.fiPopulation / totalNeed) * totalDailyLbs,
  }));

  // Water-filling: cap at agency capacity, redistribute overflow to zones with headroom.
  let pool = 0;
  working = working.map((z) => {
    if (z.idealLbs > z.agencyCapacityLbs) {
      pool += z.idealLbs - z.agencyCapacityLbs;
      return { ...z, allocLbs: z.agencyCapacityLbs, cappedByAgency: true };
    }
    return { ...z, allocLbs: z.idealLbs, cappedByAgency: false };
  });

  for (let round = 0; round < 3 && pool > 1; round++) {
    const headroomZones = working.filter((z) => z.allocLbs < z.agencyCapacityLbs);
    const totalHeadroom = headroomZones.reduce((s, z) => s + (z.agencyCapacityLbs - z.allocLbs), 0);
    if (totalHeadroom <= 0) break;
    let distributed = 0;
    working = working.map((z) => {
      if (z.allocLbs >= z.agencyCapacityLbs) return z;
      const headroom = z.agencyCapacityLbs - z.allocLbs;
      const share = Math.min(headroom, (headroom / totalHeadroom) * pool);
      distributed += share;
      return { ...z, allocLbs: z.allocLbs + share };
    });
    pool -= distributed;
  }

  const networkCapacityGapLbs = Math.round(pool);
  const totalAllocated = working.reduce((s, z) => s + z.allocLbs, 0);

  working = working.map((z) => ({
    ...z,
    allocLbs: Math.round(z.allocLbs),
    coldLbs: Math.round(z.allocLbs * ALLOC_ASSUMPTIONS.COLD_SHARE),
    dryLbs: Math.round(z.allocLbs * (1 - ALLOC_ASSUMPTIONS.COLD_SHARE)),
    shareOfLbs: z.allocLbs / totalAllocated,
    shareOfNeed: z.fiPopulation / totalNeed,
  }));

  return {
    zones: working.map((z) => ({ ...z, equityGap: z.shareOfLbs - z.shareOfNeed })),
    totalDailyLbs,
    totalAllocated: Math.round(totalAllocated),
    totalNeed,
    networkCapacityGapLbs,
  };
}

function routeMinutes(stops) {
  if (stops.length === 0) return 0;
  const farthest = Math.max(...stops.map((s) => s.driveTimeMinFreeFlow));
  return farthest * ALLOC_ASSUMPTIONS.CONGESTION_MULTIPLIER + ALLOC_ASSUMPTIONS.DWELL_MIN_PER_STOP * stops.length;
}

function buildRoutes(allocResult, fleet, coldChainRules) {
  const zones = allocResult.zones;
  const reefers = fleet.filter((t) => t.coldChain);
  const boxTrucks = fleet.filter((t) => !t.coldChain);

  // --- Cold routes: nearest-first greedy pack under the 90-min safety ceiling ---
  const coldZones = zones
    .filter((z) => z.coldLbs > 0)
    .slice()
    .sort((a, b) => a.driveTimeMinFreeFlow - b.driveTimeMinFreeFlow);

  const reeferRoutes = reefers.map((t) => ({ truck: t, stops: [], usedLbs: 0 }));
  const coldChainRiskFlags = [];

  for (const z of coldZones) {
    let placed = false;
    for (const route of reeferRoutes) {
      const wouldFitCapacity = route.usedLbs + z.coldLbs <= route.truck.capacityLbs;
      const projectedTime = routeMinutes([...route.stops, z]);
      if (wouldFitCapacity && projectedTime <= coldChainRules.operatingSafetyMarginMin) {
        route.stops.push(z);
        route.usedLbs += z.coldLbs;
        placed = true;
        break;
      }
    }
    if (!placed) {
      coldChainRiskFlags.push({
        zip: z.zip,
        neighborhood: z.neighborhood,
        coldLbs: z.coldLbs,
        driveTimeMinFreeFlow: z.driveTimeMinFreeFlow,
        reason:
          `Direct refrigerated delivery would exceed the ${coldChainRules.operatingSafetyMarginMin}-minute ` +
          `operating safety margin (the FDA's stricter 60-minute danger-zone threshold applies once ` +
          `ambient exceeds 90°F, which is typical on this test day) once congestion and existing ` +
          `reefer stops are accounted for.`,
        mitigation:
          "Recommend: repack this stop's perishable share with certified ice packs/gel refrigerant " +
          "and run it as an insulated (non-mechanical) cold box on a dry route, or add a 3rd reefer run.",
      });
    }
  }

  // --- Dry routes: first-fit-decreasing bin packing by capacity, no hard time ceiling ---
  const dryZones = zones
    .filter((z) => z.dryLbs > 0)
    .slice()
    .sort((a, b) => b.dryLbs - a.dryLbs);
  const boxRoutes = boxTrucks.map((t) => ({ truck: t, stops: [], usedLbs: 0 }));
  const dryOverflow = [];

  for (const z of dryZones) {
    let remaining = z.dryLbs;
    for (const route of boxRoutes) {
      if (remaining <= 0) break;
      const space = route.truck.capacityLbs - route.usedLbs;
      if (space <= 0) continue;
      const take = Math.min(space, remaining);
      route.stops.push({ ...z, dryLbsThisLeg: take });
      route.usedLbs += take;
      remaining -= take;
    }
    if (remaining > 0) dryOverflow.push({ zip: z.zip, neighborhood: z.neighborhood, unplacedLbs: Math.round(remaining) });
  }

  const allRoutes = [
    ...reeferRoutes.map((r) => ({ ...r, kind: "cold", estMinutes: Math.round(routeMinutes(r.stops)) })),
    ...boxRoutes.map((r) => ({ ...r, kind: "dry", estMinutes: Math.round(routeMinutes(r.stops)) })),
  ];

  return { routes: allRoutes, coldChainRiskFlags, dryOverflow };
}

function computeRiskAssessment(allocResult, routeResult, data) {
  const risks = [];

  if (routeResult.coldChainRiskFlags.length > 0) {
    risks.push({
      severity: "high",
      title: `${routeResult.coldChainRiskFlags.length} zone(s) exceed the safe cold-chain delivery window`,
      detail:
        `${routeResult.coldChainRiskFlags.map((f) => `${f.neighborhood} (${f.zip})`).join(", ")} ` +
        `cannot receive refrigerated goods on a direct route within the ${data.coldChainRules.operatingSafetyMarginMin}-minute ` +
        `safety margin under today's ${ALLOC_ASSUMPTIONS.CONGESTION_MULTIPLIER}x peak-congestion assumption.`,
      mitigation: "See per-zone mitigation in the Truck Routes section. Requires supervisor sign-off before dispatch.",
    });
  }

  if (allocResult.networkCapacityGapLbs > 0) {
    risks.push({
      severity: "medium",
      title: `${allocResult.networkCapacityGapLbs.toLocaleString()} lbs of real need cannot be placed today`,
      detail:
        "Total food-insecure-population-weighted need exceeds what today's fleet capacity and " +
        "partner-agency intake capacity can absorb, even after redistributing capacity-capped overflow.",
      mitigation: "Escalate to network growth / capacity-building pipeline (see Suggested Improvements). Do not silently drop — log as unmet need for the next distribution cycle.",
    });
  }

  const heatRisk = {
    severity: "medium",
    title: "August Gulf Coast heat compresses the cold-chain safety margin",
    detail:
      "Ambient temperatures above 90°F trigger the FDA's stricter 60-minute (not 120-minute) danger-zone " +
      "threshold. Houston's average August high exceeds 90°F on most afternoons, which is why this " +
      "system applies a 45-minute operating ceiling — a real margin under the 60-minute threshold that " +
      "actually governs a day like this one, not the more lenient 120-minute rule.",
    mitigation: "Prioritize refrigerated routes for morning dispatch; avoid mid-afternoon reefer departures where possible.",
  };
  risks.push(heatRisk);

  const worstEquity = allocResult.zones.slice().sort((a, b) => a.equityGap - b.equityGap)[0];
  if (worstEquity && worstEquity.equityGap < -0.01) {
    risks.push({
      severity: "medium",
      title: `${worstEquity.neighborhood} (${worstEquity.zip}) is underserved relative to measured need`,
      detail:
        `Receiving ${(worstEquity.shareOfLbs * 100).toFixed(1)}% of today's pounds against ` +
        `${(worstEquity.shareOfNeed * 100).toFixed(1)}% of the network's food-insecure population — ` +
        `a ${Math.abs(worstEquity.equityGap * 100).toFixed(1)}-point equity gap, driven by ` +
        `${worstEquity.cappedByAgency ? "partner-agency intake capacity limits" : "fleet capacity limits"}.`,
      mitigation: "Flag for manual review before approval; consider a supplemental micro-route or agency capacity grant.",
    });
  }

  risks.push({
    severity: "low",
    title: "Single warehouse = single point of failure",
    detail: "All 13 zones today are served from one distribution center (535 Portwall St). No backup depot is modeled in this test-day slice.",
    mitigation: "Out of scope for a single-day plan; track as a network resilience item.",
  });

  return risks;
}
