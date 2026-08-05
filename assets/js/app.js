(function () {
  "use strict";

  // ---------- Compute the plan once ----------
  const zonesWithNeed = computeZoneNeed(HFB_DATA);
  const allocResult = allocatePounds(zonesWithNeed, HFB_DATA.fleet);
  const routeResult = buildRoutes(allocResult, HFB_DATA.fleet, HFB_DATA.coldChainRules);
  const risks = computeRiskAssessment(allocResult, routeResult, HFB_DATA);

  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const pct = (n) => (n * 100).toFixed(1) + "%";

  const PIN_ICON =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 14.5S3 9.8 3 6.3a5 5 0 0 1 10 0c0 3.5-5 8.2-5 8.2z"/><circle cx="8" cy="6.2" r="1.8"/></svg>';
  const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';

  // ---------- Navigation ----------
  const panels = document.querySelectorAll("[data-panel]");
  const navLinks = document.querySelectorAll(".nav-link");
  const titleMap = {
    overview: ["Overview", "Today's plan at a glance"],
    schedule: ["Distribution Schedule", "Dispatch order for Wed, Aug 5 2026"],
    allocations: ["Zone Allocations", "Need-weighted, capacity-capped, per partner agency"],
    routes: ["Truck Routes & Map", "Cold-chain-safe routing over real Harris County roads"],
    fairness: ["Fairness Analysis", "Share of aid vs. share of measured need"],
    risk: ["Risk Assessment", "What could go wrong today, and the mitigation for each"],
    ethics: ["Ethical Review", "How this system tries to be trustworthy"],
    improvements: ["Suggested Improvements", "What would make tomorrow's plan better"],
    explainer: ["Plain-Language Explainer", "For staff who don't want the formulas"],
    methodology: ["Data & Methodology", "Every number, traced to its source"],
  };

  function showSection(id) {
    if (!titleMap[id]) return;
    panels.forEach((p) => p.classList.toggle("hidden", p.id !== id));
    navLinks.forEach((l) => l.classList.toggle("active", l.dataset.section === id));
    document.getElementById("page-title").textContent = titleMap[id][0];
    document.getElementById("page-sub").textContent = titleMap[id][1];
    if (id === "risk") riskTabOpened = true, updateApprovalButton();
    if (id === "routes" && !mapInitialized) initMap();
    document.querySelectorAll(".reveal").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add("in");
    });
    window.scrollTo(0, 0);
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      history.replaceState(null, "", "#" + link.dataset.section);
      showSection(link.dataset.section);
    });
  });

  // ---------- Reveal-on-scroll ----------
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // ---------- KPIs ----------
  document.getElementById("kpi-lbs").textContent = fmt(allocResult.totalAllocated) + " lbs";
  document.getElementById("kpi-need").textContent = fmt(allocResult.totalNeed);
  document.getElementById("kpi-gap").textContent = fmt(allocResult.networkCapacityGapLbs) + " lbs";
  if (allocResult.networkCapacityGapLbs === 0) {
    document.getElementById("kpi-gap-card").classList.remove("warn");
  }

  // ---------- Schedule: kanban board ----------
  const kanbanBoard = document.getElementById("kanban-board");

  function toggleDetail(cardEl, chevronEl) {
    const detail = cardEl.querySelector(".kc-detail, .metric-row-detail");
    if (!detail) return;
    detail.classList.toggle("hidden");
    if (chevronEl) chevronEl.classList.toggle("open");
  }

  function riskCard(f) {
    const el = document.createElement("div");
    el.className = "kanban-card tone-rose reveal";
    el.innerHTML = `
      <div class="kc-top"><strong>${f.neighborhood}</strong><span>${f.zip}</span></div>
      <div class="kc-from">Cold share: ${fmt(f.coldLbs)} lbs · ${f.driveTimeMinFreeFlow.toFixed(0)} min free-flow drive</div>
      <div class="kc-arrow">${PIN_ICON}<span>Needs mitigation</span></div>
      <div class="kc-pill-row"><span class="metric-pill tone-rose">Unrouted <span class="kc-chevron">${CHEVRON}</span></span></div>
      <div class="kc-detail hidden">${f.reason} <strong>Mitigation:</strong> ${f.mitigation}</div>`;
    el.addEventListener("click", () => toggleDetail(el, el.querySelector(".kc-chevron")));
    return el;
  }

  function stopCard(route, stop, kind) {
    const el = document.createElement("div");
    let tone, pillHtml, detailHtml;
    if (kind === "cold") {
      const cap = HFB_DATA.coldChainRules.operatingSafetyMarginMin;
      const marginPct = Math.max(0, Math.min(100, ((cap - route.estMinutes) / cap) * 100));
      tone = marginPct > 40 ? "green" : marginPct > 15 ? "amber" : "rose";
      pillHtml = `${marginPct > 40 ? "Safe margin" : marginPct > 15 ? "Tight margin" : "Marginal"} (${marginPct.toFixed(0)}%)`;
      detailHtml = `Route est. ${route.estMinutes} min vs. ${cap}-min cold-chain safety ceiling (FDA hot-day rule) — ${route.truck.id}, ${route.stops.length} stop(s), ${fmt(route.usedLbs)}/${fmt(route.truck.capacityLbs)} lbs loaded.`;
    } else {
      const util = (route.usedLbs / route.truck.capacityLbs) * 100;
      tone = util > 95 ? "amber" : util < 70 ? "green" : "amber";
      pillHtml = `${util > 95 ? "At capacity" : util < 70 ? "Light load" : "Near capacity"} (${util.toFixed(0)}%)`;
      detailHtml = `${route.truck.id} loaded to ${fmt(route.usedLbs)} of ${fmt(route.truck.capacityLbs)} lbs capacity across ${route.stops.length} stop(s). No hard time limit for dry goods.`;
    }
    el.className = "kanban-card tone-" + (kind === "dry" ? "green" : "amber") + " reveal";
    const lbs = kind === "cold" ? stop.coldLbs : stop.dryLbsThisLeg;
    el.innerHTML = `
      <div class="kc-top"><strong>${kind === "cold" ? "Refrigerated" : "Dry"} · ${fmt(lbs)} lbs</strong><span>${route.truck.id}</span></div>
      <div class="kc-from">from Houston Food Bank — 535 Portwall St</div>
      <div class="kc-arrow">${PIN_ICON}<span>${stop.agencyName}</span></div>
      <div class="kc-meta"><span>${stop.neighborhood} · ${stop.zip}</span><span>${route.estMinutes} min route</span></div>
      <div class="kc-pill-row"><span class="metric-pill tone-${tone}">${pillHtml} <span class="kc-chevron">${CHEVRON}</span></span></div>
      <div class="kc-detail hidden">${detailHtml}</div>`;
    el.addEventListener("click", () => toggleDetail(el, el.querySelector(".kc-chevron")));
    return el;
  }

  const coldPlaced = [];
  const dryPlaced = [];
  routeResult.routes.forEach((r) => {
    r.stops.forEach((s) => {
      if (r.kind === "cold") coldPlaced.push({ route: r, stop: s });
      else dryPlaced.push({ route: r, stop: s });
    });
  });

  const columns = [
    {
      tone: "rose", title: "Cold-chain risk",
      sub: "Exceeds the safe refrigerated delivery window",
      items: routeResult.coldChainRiskFlags,
      render: riskCard,
    },
    {
      tone: "amber", title: "Refrigerated routes",
      sub: `≤ ${HFB_DATA.coldChainRules.operatingSafetyMarginMin}-minute direct delivery`,
      items: coldPlaced,
      render: (x) => stopCard(x.route, x.stop, "cold"),
    },
    {
      tone: "green", title: "Dry routes",
      sub: "Shelf-stable — no hard cold-chain time limit",
      items: dryPlaced,
      render: (x) => stopCard(x.route, x.stop, "dry"),
    },
  ];

  columns.forEach((col) => {
    const colEl = document.createElement("div");
    colEl.className = "kanban-col";
    const head = document.createElement("div");
    head.className = "kanban-col-head tone-" + col.tone;
    head.innerHTML = `
      <div class="kc-title">${col.title}<span class="kc-count">${col.items.length}</span></div>
      <div class="kc-sub">${col.sub}</div>`;
    colEl.appendChild(head);
    col.items.forEach((item) => colEl.appendChild(col.render(item)));
    kanbanBoard.appendChild(colEl);
    colEl.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  });

  // ---------- Metric-row helper (Allocations / Fairness) ----------
  function metricRow({ title, sub, trendLabel, trendTone, value, valueLabel, detailHtml }) {
    const row = document.createElement("div");
    row.className = "metric-row reveal";
    row.innerHTML = `
      <button class="metric-row-head" type="button">
        <span class="row-icon">${PIN_ICON}</span>
        <span class="row-title">${title}<span class="row-sub">${sub}</span></span>
        <span class="trend-pill tone-${trendTone}">${trendLabel}</span>
        <span class="row-value">${value}<span class="row-value-label">${valueLabel}</span></span>
        <span class="row-chevron">${CHEVRON}</span>
      </button>
      <div class="metric-row-detail hidden">${detailHtml}</div>`;
    const head = row.querySelector(".metric-row-head");
    head.addEventListener("click", () => toggleDetail(row, row.querySelector(".row-chevron")));
    return row;
  }

  // ---------- Allocation list ----------
  const allocList = document.getElementById("alloc-list");
  const sortedZones = allocResult.zones.slice().sort((a, b) => b.allocLbs - a.allocLbs);
  sortedZones.forEach((z) => {
    const capPct = (z.allocLbs / z.agencyCapacityLbs) * 100;
    const tone = capPct >= 95 ? "amber" : "green";
    const row = metricRow({
      title: z.neighborhood,
      sub: z.zip,
      trendLabel: z.cappedByAgency ? "At capacity" : "Has headroom",
      trendTone: z.cappedByAgency ? "amber" : "green",
      value: fmt(z.allocLbs) + " lbs",
      valueLabel: "allocated",
      detailHtml: `
        <div class="detail-line"><strong>${z.agencyName}</strong> (${z.agencyTier})</div>
        <div class="detail-line">Poverty rate ${z.povertyRatePct.toFixed(1)}% <span class="src">[${z.povertyRateSource}]</span> · est. food-insecure population ${fmt(z.fiPopulation)}</div>
        <div class="detail-line">Cold ${fmt(z.coldLbs)} lbs / Dry ${fmt(z.dryLbs)} lbs</div>
        <span class="metric-pill tone-${tone}">${capPct.toFixed(0)}% of agency capacity</span>`,
    });
    allocList.appendChild(row);
    io.observe(row);
  });

  // ---------- Fairness list ----------
  const fairnessList = document.getElementById("fairness-list");
  const sortedByGap = allocResult.zones.slice().sort((a, b) => a.equityGap - b.equityGap);
  sortedByGap.forEach((z) => {
    const gapPts = z.equityGap * 100;
    const tone = gapPts < -1 ? "rose" : gapPts > 1 ? "amber" : "green";
    const label = gapPts < -1 ? "Underserved" : gapPts > 1 ? "Overserved" : "Balanced";
    const row = metricRow({
      title: z.neighborhood,
      sub: z.zip,
      trendLabel: label,
      trendTone: tone,
      value: (gapPts >= 0 ? "+" : "") + gapPts.toFixed(1) + " pts",
      valueLabel: "equity gap",
      detailHtml: `
        <div class="detail-line">${pct(z.shareOfLbs)} of today's pounds vs. ${pct(z.shareOfNeed)} of the network's measured need.</div>
        <div class="detail-line">${z.cappedByAgency ? "Primary driver: partner-agency intake capacity limit, not deprioritization." : "Not capacity-constrained today."}</div>
        <span class="metric-pill tone-${tone}">${label}</span>`,
    });
    fairnessList.appendChild(row);
    io.observe(row);
  });

  // ---------- Routes list ----------
  const routesList = document.getElementById("routes-list");
  routeResult.routes.forEach((r) => {
    const div = document.createElement("div");
    div.className = "route-card reveal " + r.kind;
    const stopsHtml = r.stops.length
      ? r.stops
          .map((s) => `<li><span>${s.neighborhood} (${s.zip})</span><span class="mono">${fmt(r.kind === "cold" ? s.coldLbs : s.dryLbsThisLeg)} lbs</span></li>`)
          .join("")
      : `<li><span class="muted">No stops assigned</span></li>`;
    div.innerHTML = `
      <div class="route-head">
        <strong>${r.truck.id}</strong>
        <span>${r.truck.type}</span>
      </div>
      <ul class="route-stops">${stopsHtml}</ul>
      <div class="route-meta">
        <span>${r.estMinutes} min est.</span>
        <span>${fmt(r.usedLbs)} / ${fmt(r.truck.capacityLbs)} lbs</span>
      </div>`;
    routesList.appendChild(div);
    io.observe(div);
  });
  if (routeResult.coldChainRiskFlags.length) {
    const warn = document.createElement("div");
    warn.className = "route-card reveal";
    warn.style.gridColumn = "1 / -1";
    warn.innerHTML = `<div class="route-head"><strong>Unrouted cold-chain risk</strong></div>
      <p class="small muted">${routeResult.coldChainRiskFlags
        .map((f) => `<strong>${f.neighborhood} (${f.zip})</strong>: ${f.mitigation}`)
        .join("<br>")}</p>`;
    routesList.appendChild(warn);
    io.observe(warn);
  }

  // ---------- Map (lazy init) ----------
  let mapInitialized = false;
  function initMap() {
    mapInitialized = true;
    const map = L.map("map").setView([HFB_DATA.warehouse.lat, HFB_DATA.warehouse.lon], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    const whIcon = L.divIcon({
      html: '<div style="background:#2f6b4f;width:16px;height:16px;border-radius:4px;border:2px solid #fffdf9;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
      className: "", iconSize: [16, 16], iconAnchor: [8, 8],
    });
    L.marker([HFB_DATA.warehouse.lat, HFB_DATA.warehouse.lon], { icon: whIcon })
      .addTo(map)
      .bindPopup(`<strong>${HFB_DATA.warehouse.name}</strong><br>${HFB_DATA.warehouse.address}`);

    const colors = { "REEFER-1": "#3b6fd9", "REEFER-2": "#2454b0", "BOX-1": "#2f6b4f", "BOX-2": "#3a7a5c", "BOX-3": "#1d4a37", "BOX-4": "#4f9370" };

    routeResult.routes.forEach((r) => {
      const color = colors[r.truck.id] || "#2f6b4f";
      r.stops.forEach((s) => {
        const marker = L.circleMarker([s.lat, s.lon], {
          radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 2,
        }).addTo(map);
        marker.bindPopup(
          `<strong>${s.neighborhood} (${s.zip})</strong><br>Agency: ${s.agencyName}<br>` +
          `Truck: ${r.truck.id}<br>${r.kind === "cold" ? fmt(s.coldLbs) : fmt(s.dryLbsThisLeg)} lbs`
        );
        L.polyline(
          [[HFB_DATA.warehouse.lat, HFB_DATA.warehouse.lon], [s.lat, s.lon]],
          { color, weight: 2, opacity: 0.55, dashArray: r.kind === "cold" ? "6,5" : null }
        ).addTo(map);
      });
    });
  }

  // ---------- Fairness chart ----------
  new Chart(document.getElementById("fairnessChart"), {
    type: "bar",
    data: {
      labels: allocResult.zones.map((z) => z.zip),
      datasets: [{
        label: "Equity gap (share of lbs − share of need), pct points",
        data: allocResult.zones.map((z) => +(z.equityGap * 100).toFixed(2)),
        backgroundColor: allocResult.zones.map((z) => (z.equityGap * 100 < -1 ? "#dc4a3f" : z.equityGap * 100 > 1 ? "#d97706" : "#2f6b4f")),
        borderRadius: 5,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { title: { display: true, text: "pct points" }, grid: { color: "rgba(89,84,63,.12)" } },
        x: { grid: { display: false } },
      },
    },
  });

  // ---------- Allocation chart ----------
  new Chart(document.getElementById("allocChart"), {
    type: "bar",
    data: {
      labels: sortedZones.map((z) => z.zip),
      datasets: [
        { label: "Cold (lbs)", data: sortedZones.map((z) => z.coldLbs), backgroundColor: "#3b6fd9", stack: "s" },
        { label: "Dry (lbs)", data: sortedZones.map((z) => z.dryLbs), backgroundColor: "#2f6b4f", stack: "s" },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: "rgba(89,84,63,.12)" } },
      },
    },
  });

  // ---------- Risk list ----------
  const riskList = document.getElementById("risk-list");
  const sevOrder = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]).forEach((r) => {
    const div = document.createElement("div");
    div.className = "risk-item reveal " + r.severity;
    div.innerHTML = `
      <h3><span class="sev-dot"></span>${r.title}</h3>
      <p>${r.detail}</p>
      <div class="mitigation"><strong>Mitigation:</strong> ${r.mitigation}</div>`;
    riskList.appendChild(div);
    io.observe(div);
  });

  // ---------- Sources ----------
  const sourcesList = document.getElementById("sources-list");
  HFB_DATA.sources.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`;
    sourcesList.appendChild(li);
  });

  // ---------- Human approval gate ----------
  let riskTabOpened = false;
  const approveBtn = document.getElementById("approve-btn");
  const resetBtn = document.getElementById("reset-btn");
  const pill = document.getElementById("approval-pill");
  const pillText = document.getElementById("approval-pill-text");
  const statusText = document.getElementById("approval-status-text");

  function updateApprovalButton() {
    approveBtn.disabled = !riskTabOpened || sessionStorage.getItem("hfb-approved") === "1";
  }
  function renderApprovalState() {
    const approved = sessionStorage.getItem("hfb-approved") === "1";
    pill.classList.toggle("approved", approved);
    pillText.textContent = approved ? "Approved for dispatch" : "Awaiting human approval";
    statusText.innerHTML = approved
      ? "Status: <strong>Approved</strong> — released for dispatch"
      : "Status: <strong>Awaiting review</strong>";
    updateApprovalButton();
  }
  approveBtn.addEventListener("click", () => {
    sessionStorage.setItem("hfb-approved", "1");
    renderApprovalState();
  });
  resetBtn.addEventListener("click", () => {
    sessionStorage.removeItem("hfb-approved");
    riskTabOpened = false;
    renderApprovalState();
  });
  renderApprovalState();

  // ---------- Initial route + in-page anchor links (e.g. inline "See Methodology") ----------
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (titleMap[id]) showSection(id);
  });
  const initial = (location.hash || "#overview").slice(1);
  showSection(titleMap[initial] ? initial : "overview");
})();
