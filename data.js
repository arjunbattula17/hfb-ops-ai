// ============================================================================
// Houston Food Bank — case-study dataset (from the problem brief) plus the
// minimal derived fields (coordinates, unit-weight conversions, nutrition
// weights) needed to run real optimization on it. Anything not directly
// stated in the brief is marked as an ASSUMPTION so it stays auditable.
// ============================================================================

const SCENARIO = {
  warehouses: 5,
  partnerPantries: 50,
  trucks: 20,
  note: "Full network per brief: 5 warehouses, 50 pantries, 20 trucks. " +
        "This build runs live optimization on the explicit case-study data " +
        "given in the brief (1 warehouse, 4 pantries, 3 trucks) — the same " +
        "algorithms scale to the full network; see README."
};

// Warehouse + pantry locations. Not real HFB facility addresses — generic
// Houston-metro coordinates spread at realistic distances, for routing math.
const WAREHOUSE = { id: "WH", name: "Central Warehouse", lat: 29.760, lon: -95.360 };

const PANTRIES = [
  { id: "A", name: "Pantry A", families: 450, needs: ["Produce", "Milk"],        lat: 29.784, lon: -95.311 },
  { id: "B", name: "Pantry B", families: 700, needs: ["Rice", "Canned Food"],    lat: 29.601, lon: -95.130 },
  { id: "C", name: "Pantry C", families: 300, needs: ["Bread"],                  lat: 29.918, lon: -95.470 },
  { id: "D", name: "Pantry D", families: 900, needs: ["Everything"],             lat: 29.700, lon: -95.610 },
];

// Category -> which inventory items satisfy it (from the brief's own labels)
const CATEGORY_ITEMS = {
  "Produce": ["Apples"],
  "Milk": ["Milk"],
  "Rice": ["Rice"],
  "Canned Food": ["Canned Beans"],
  "Bread": ["Bread"],
};
const ALL_ITEM_NAMES = ["Apples", "Bread", "Rice", "Milk", "Canned Beans"];

// A pantry that asked for "Everything" wants every item.
function pantryWantsItem(pantry, itemName) {
  if (pantry.needs.includes("Everything")) return true;
  return pantry.needs.some(cat => (CATEGORY_ITEMS[cat] || []).includes(itemName));
}

const INVENTORY = [
  {
    name: "Apples", quantity: 900, unit: "lbs", expiresInDays: 1,
    // ASSUMPTION: nutrition density weight (0-1), editorial scale for produce (fiber/vitamins)
    nutrition: 0.70,
    lbsPerUnit: 1,
  },
  {
    name: "Bread", quantity: 600, unit: "loaves", expiresInDays: 2,
    nutrition: 0.40, // ASSUMPTION: refined-carb staple, lower nutrient density
    lbsPerUnit: 1, // ASSUMPTION: ~1 lb per standard loaf
  },
  {
    name: "Rice", quantity: 4000, unit: "lbs", expiresInDays: 240, // "8 months" ~ 240 days
    nutrition: 0.50, // ASSUMPTION: carb staple
    lbsPerUnit: 1,
  },
  {
    name: "Milk", quantity: 1000, unit: "gallons", expiresInDays: 2,
    nutrition: 0.90, // ASSUMPTION: protein/calcium/vitamin D
    lbsPerUnit: 8.6, // ASSUMPTION: ~8.6 lbs per gallon of milk
  },
  {
    name: "Canned Beans", quantity: 7000, unit: "cans", expiresInDays: 730, // "2 years"
    nutrition: 0.85, // ASSUMPTION: protein + fiber, shelf-stable
    lbsPerUnit: 1, // ASSUMPTION: ~1 lb (~15oz) per standard can
  },
];

const TRUCKS = [
  { id: "Truck 1", capacityLbs: 3000, mpg: 8 },
  { id: "Truck 2", capacityLbs: 2500, mpg: 8 },
  { id: "Truck 3", capacityLbs: 4000, mpg: 7 }, // ASSUMPTION: larger truck, slightly lower mpg
];
const FUEL_PRICE_PER_GAL = 3.50; // ASSUMPTION

const VOLUNTEER_SHIFTS = [
  { id: "Morning", available: 20 },
  { id: "Afternoon", available: 50 },
  { id: "Evening", available: 10 },
];
// ASSUMPTION: labor throughput used to convert workload -> volunteer-hours needed
const LBS_PER_VOLUNTEER_HOUR_SORTING = 250; // sorting/packing bulk food
const HOURS_PER_TRUCK_LOAD = 0.75; // loading/unloading a truck at dock
const SHIFT_LENGTH_HOURS = 4;

function haversineMiles(a, b) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
