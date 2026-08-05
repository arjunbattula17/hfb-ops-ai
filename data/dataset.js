/**
 * HOUSTON FOOD BANK — DAILY DISTRIBUTION TEST DAY DATASET
 * Test day: Wednesday, August 5, 2026 (peak Gulf Coast summer — cold-chain risk is elevated)
 *
 * PROVENANCE: every field carries a "source" tag.
 *   "sourced"  = pulled from a live, cited public source this session (see SOURCES below)
 *   "computed" = derived from a real routing engine (OSRM) over real road geometry, this session
 *   "modeled"  = estimated using a disclosed, reproducible method anchored to sourced data
 *                (never claimed as an official published figure — see methodology.html)
 *
 * This is a REPRESENTATIVE SLICE of Houston Food Bank's real operation, not the full
 * 18-county, 1,600+ partner network. Scope: the main warehouse + 13 real ZIP zones
 * spanning Harris County + 1 Katy (Fort Bend-adjacent) zone, for one operating day.
 */

const HFB_DATA = {
  meta: {
    orgName: "Houston Food Bank",
    testDate: "2026-08-05",
    scopeNote:
      "Representative single-day slice: 1 warehouse, 6 vehicles, 13 partner-agency zones. " +
      "Real HFB operates 1,600+ active partners across 18 counties — this models a realistic " +
      "subset at true scale ratios, not the full network.",
    serviceArea: {
      counties: 18,
      countiesNamed: [
        "Harris", "Fort Bend", "Montgomery", "Galveston", "Brazoria", "Waller",
        "Walker", "Chambers", "Liberty", "and 9 additional southeast Texas counties",
      ],
      source: "sourced",
      sourceNote: "Houston Food Bank FactSheet FY23 / houstonfoodbank.org — 18-county southeast Texas service area",
    },
    orgStats: {
      activePartners: 1600,
      mealsPerYearFY2025: 143_000_000,
      poundsPerDayPeak: 1_000_000,
      warehouseSqFt: 308_000,
      kitchenSqFt: 15_000,
      kitchenName: "Keegan Kitchen",
      source: "sourced",
      sourceNote:
        "Partners/meals/facility figures: Houston Food Bank FactSheet + current houstonfoodbank.org " +
        "'About Us' copy. The 1M-lbs/day 'peak' figure traces to 2020 pandemic-surge reporting " +
        "(distribution jumped from ~400,000 lbs/day in 2019 to ~1M lbs/day in 2020) — it is a " +
        "historical peak, not a confirmed current-day daily average, and is labeled as such here.",
    },
    demandContext: {
      note:
        "SNAP benefit disruptions in late 2025 drove Houston Food Bank to open special " +
        "distribution sites for SNAP recipients and furloughed federal workers, and partner " +
        "agencies report sustained elevated demand into 2026. This test day assumes demand " +
        "at the elevated (post-SNAP-disruption) baseline, not pre-2025 levels.",
      source: "sourced",
      sourceNote: "Houston Public Media, 'Houston Food Bank to launch special distribution sites for SNAP recipients, federal workers', Oct 28 2025.",
    },
  },

  warehouse: {
    name: "Houston Food Bank — Main Distribution Center",
    address: "535 Portwall St, Houston, TX 77029",
    lat: 29.7809711,
    lon: -95.2747386,
    source: "sourced",
    sourceNote: "Geocoded via OpenStreetMap Nominatim; confirmed POI name 'Houston Food Bank' at this address.",
  },

  countyBaseline: {
    foodInsecurityRatePct: 18.2,
    childFoodInsecurityRatePct: 24.6,
    childFoodInsecureCount: 306_140,
    povertyRateProxyPct: 19.6,
    disparities: { black: 34, latino: 25, nonHispanicWhite: 11 },
    source: "sourced",
    sourceNote:
      "Feeding America 'Map the Meal Gap' 2025 report (2023 data), via Community Impact " +
      "(Jul 2 2025): Harris County food insecurity 18.2% overall, child rate 24.6% " +
      "(306,140 children). Racial/ethnic disparity figures from the same report.",
    methodologyNote:
      "Map the Meal Gap does NOT publish ZIP-code-level food-insecurity rates — county is the " +
      "finest published resolution. ZIP-level rates below are MODELED by scaling the county " +
      "rate against each ZIP's poverty rate (poverty is Feeding America's own primary predictor " +
      "variable for the county-level model). See methodology.html.",
  },

  /**
   * Partner-agency zones. Each represents one real Harris/Fort Bend County ZIP.
   * agencyName is a representative stand-in (HFB does not publish per-agency capacity
   * data) sized to a realistic tier for that ZIP's real characteristics.
   * driveTimeMinFreeFlow / driveDistanceMiles are COMPUTED from OSRM over real road
   * geometry from the real warehouse address to the real ZIP centroid.
   */
  zones: [
    {
      zip: "77026", neighborhood: "Fifth Ward / Kashmere Gardens",
      agencyName: "Fifth Ward Neighborhood Pantry", agencyTier: "Large Hub",
      lat: 29.7954486, lon: -95.3323524,
      povertyRatePct: 32.2, povertyRateSource: "sourced",
      populationEst: 15500, populationSource: "modeled",
      driveTimeMinFreeFlow: 8.9, driveDistanceMiles: 5.1, routeSource: "computed",
      agencyCapacityLbs: 7000,
    },
    {
      zip: "77015", neighborhood: "East Houston / Channelview edge",
      agencyName: "East Harris Family Services", agencyTier: "Mid-Size",
      lat: 29.7805398, lon: -95.1853659,
      povertyRatePct: 20.0, povertyRateSource: "modeled",
      populationEst: 42000, populationSource: "modeled",
      driveTimeMinFreeFlow: 11.7, driveDistanceMiles: 7.5, routeSource: "computed",
      agencyCapacityLbs: 4500,
    },
    {
      zip: "77016", neighborhood: "Trinity Gardens / Northeast Houston",
      agencyName: "Trinity Gardens Community Pantry", agencyTier: "Large Hub",
      lat: 29.8483538, lon: -95.3108106,
      povertyRatePct: 29.5, povertyRateSource: "modeled",
      populationEst: 24000, populationSource: "modeled",
      driveTimeMinFreeFlow: 13.5, driveDistanceMiles: 7.0, routeSource: "computed",
      agencyCapacityLbs: 6500,
    },
    {
      zip: "77051", neighborhood: "Sunnyside / South Union",
      agencyName: "Sunnyside Community Pantry", agencyTier: "Large Hub",
      lat: 29.6766511, lon: -95.3654505,
      povertyRatePct: 38.0, povertyRateSource: "sourced",
      populationEst: 18500, populationSource: "modeled",
      driveTimeMinFreeFlow: 19.1, driveDistanceMiles: 10.8, routeSource: "computed",
      agencyCapacityLbs: 7500,
    },
    {
      zip: "77033", neighborhood: "South Park",
      agencyName: "South Park Family Pantry", agencyTier: "Large Hub",
      lat: 29.6676722, lon: -95.3474380,
      povertyRatePct: 33.1, povertyRateSource: "sourced",
      populationEst: 30000, populationSource: "modeled",
      driveTimeMinFreeFlow: 20.4, driveDistanceMiles: 10.2, routeSource: "computed",
      agencyCapacityLbs: 7000,
    },
    {
      zip: "77587", neighborhood: "South Houston (city)",
      agencyName: "South Houston Outreach Pantry", agencyTier: "Small",
      lat: 29.6625799, lon: -95.2312789,
      povertyRatePct: 22.0, povertyRateSource: "modeled",
      populationEst: 9500, populationSource: "modeled",
      driveTimeMinFreeFlow: 19.5, driveDistanceMiles: 11.5, routeSource: "computed",
      agencyCapacityLbs: 2000,
    },
    {
      zip: "77081", neighborhood: "Gulfton",
      agencyName: "Gulfton Neighborhood Center Pantry", agencyTier: "Large Hub",
      lat: 29.7065468, lon: -95.4805815,
      povertyRatePct: 34.0, povertyRateSource: "modeled",
      populationEst: 45000, populationSource: "modeled",
      driveTimeMinFreeFlow: 23.8, driveDistanceMiles: 15.5, routeSource: "computed",
      agencyCapacityLbs: 7500,
    },
    {
      zip: "77036", neighborhood: "Sharpstown / Fondren Southwest",
      agencyName: "Sharpstown Multi-Service Pantry", agencyTier: "Large Hub",
      lat: 29.7031634, lon: -95.5340903,
      povertyRatePct: 28.0, povertyRateSource: "modeled",
      populationEst: 46000, populationSource: "modeled",
      driveTimeMinFreeFlow: 27.2, driveDistanceMiles: 18.5, routeSource: "computed",
      agencyCapacityLbs: 6000,
    },
    {
      zip: "77024", neighborhood: "Memorial",
      agencyName: "Memorial Area Assistance Pantry", agencyTier: "Small",
      lat: 29.7819224, lon: -95.5416155,
      povertyRatePct: 6.0, povertyRateSource: "modeled",
      populationEst: 24500, populationSource: "modeled",
      driveTimeMinFreeFlow: 24.5, driveDistanceMiles: 17.4, routeSource: "computed",
      agencyCapacityLbs: 1200,
    },
    {
      zip: "77060", neighborhood: "Aldine",
      agencyName: "Aldine Community Pantry", agencyTier: "Mid-Size",
      lat: 29.9231106, lon: -95.3976662,
      povertyRatePct: 24.0, povertyRateSource: "modeled",
      populationEst: 34000, populationSource: "modeled",
      driveTimeMinFreeFlow: 26.0, driveDistanceMiles: 18.0, routeSource: "computed",
      agencyCapacityLbs: 4500,
    },
    {
      zip: "77338", neighborhood: "Humble",
      agencyName: "Humble Area Food Pantry", agencyTier: "Mid-Size",
      lat: 29.9817919, lon: -95.2826248,
      povertyRatePct: 14.0, povertyRateSource: "modeled",
      populationEst: 34000, populationSource: "modeled",
      driveTimeMinFreeFlow: 27.0, driveDistanceMiles: 18.9, routeSource: "computed",
      agencyCapacityLbs: 3000,
    },
    {
      zip: "77082", neighborhood: "Westchase / Alief",
      agencyName: "Westchase Alief Pantry", agencyTier: "Mid-Size",
      lat: 29.7231646, lon: -95.6108941,
      povertyRatePct: 17.0, povertyRateSource: "modeled",
      populationEst: 40000, populationSource: "modeled",
      driveTimeMinFreeFlow: 32.0, driveDistanceMiles: 22.7, routeSource: "computed",
      agencyCapacityLbs: 3500,
    },
    {
      zip: "77494", neighborhood: "Katy",
      agencyName: "Katy Area Pantry", agencyTier: "Small",
      lat: 29.7821486, lon: -95.8085602,
      povertyRatePct: 5.0, povertyRateSource: "modeled",
      populationEst: 33000, populationSource: "modeled",
      driveTimeMinFreeFlow: 43.3, driveDistanceMiles: 33.3, routeSource: "computed",
      agencyCapacityLbs: 1200,
    },
  ],

  fleet: [
    { id: "REEFER-1", type: "Refrigerated (34–40°F)", capacityLbs: 8000, coldChain: true },
    { id: "REEFER-2", type: "Refrigerated (34–40°F)", capacityLbs: 8000, coldChain: true },
    { id: "BOX-1", type: "Dry / ambient box truck", capacityLbs: 12000, coldChain: false },
    { id: "BOX-2", type: "Dry / ambient box truck", capacityLbs: 12000, coldChain: false },
    { id: "BOX-3", type: "Dry / ambient box truck", capacityLbs: 12000, coldChain: false },
    { id: "BOX-4", type: "Dry / ambient box truck", capacityLbs: 12000, coldChain: false },
  ],

  coldChainRules: {
    dangerZoneF: [41, 135],
    tcsColdMaxF: 41,
    twoHourRuleMin: 120,
    oneHourRuleAboveAmbientF: 90,
    oneHourRuleMin: 60,
    fourHourAbsoluteMaxMin: 240,
    operatingSafetyMarginMin: 45,
    source: "sourced",
    sourceNote:
      "FDA Food Code (governs retail/food-service/warehouse facilities, incl. food bank " +
      "distribution — NOT the same document as USDA FSIS consumer take-out guidance): TCS " +
      "(Time/Temperature Control for Safety) food must stay ≤41°F; 41–135°F is the Food Code's " +
      "danger zone. USDA FSIS consumer guidance separately holds that food in the danger zone " +
      "over 2 cumulative hours (or over 1 hour / 60 minutes if ambient exceeds 90°F) must be " +
      "refrigerated, cooked, or discarded; 4 cumulative hours is an absolute discard threshold.",
    appliedRule:
      "Houston's average August afternoon exceeds 90°F, so the STRICTER 60-minute threshold — " +
      "not the 120-minute one — is the rule actually in effect on a day like this test day. " +
      "This system therefore caps refrigerated routes at 45 minutes of transit, a real working " +
      "margin under the 60-minute threshold (not the 120-minute one), for loading time, traffic " +
      "variance, and agency-side unloading before the discard clock runs out.",
  },

  sources: [
    { label: "Feeding America — Map the Meal Gap 2025 Report", url: "https://www.feedingamerica.org/sites/default/files/2025-05/Map%20the%20Meal%20Gap%202025%20Report.pdf" },
    { label: "Community Impact — Harris County food insecurity rate rises to 18.2%", url: "https://communityimpact.com/houston/bay-area/government/2025/07/02/harris-countys-overall-food-insecurity-rate-sees-increase-rising-to-182/" },
    { label: "Houston Food Bank FactSheet FY23 (18-county service area)", url: "https://www.houstonfoodbank.org/wp-content/uploads/2023/09/About_HFB_FactSheet_FY23.pdf" },
    { label: "Houston Public Media — HFB special distribution sites for SNAP recipients, federal workers", url: "https://www.houstonpublicmedia.org/articles/news/houston/2025/10/28/534530/houston-food-bank-to-launch-special-distribution-sites-for-snap-recipients-federal-workers/" },
    { label: "Houston Food Bank — Become an Agency / Partner Network", url: "https://www.houstonfoodbank.org/about-us/ouragencies/become-an-agency/" },
    { label: "Zip Atlas — Highest Poverty ZIP Codes in Houston", url: "https://zipatlas.com/us/tx/houston/zip-code-comparison/highest-poverty.htm" },
    { label: "Houston State of Health Data Portal — Households Below Poverty by ZIP", url: "https://www.houstonstateofhealth.com/indicators/index/view?indicatorId=8483&localeId=2675" },
    { label: "FDA — Safe Food Handling (danger zone, 2-hour rule)", url: "https://www.fda.gov/food/buy-store-serve-safe-food/safe-food-handling" },
    { label: "USDA FSIS — Safe Handling of Take-Out Foods (2-hour / 4-hour cumulative rule)", url: "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/safe-handling-take-out-foods" },
    { label: "OpenStreetMap Nominatim — geocoding (warehouse + ZIP centroids)", url: "https://nominatim.openstreetmap.org/" },
    { label: "Project OSRM — driving-time routing engine over real road network", url: "http://router.project-osrm.org/" },
  ],
};
