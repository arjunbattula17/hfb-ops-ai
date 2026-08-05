(function () {
  "use strict";

  // ---------- Compute the plan once ----------
  const zonesWithNeed = computeZoneNeed(HFB_DATA);
  const allocResult = allocatePounds(zonesWithNeed, HFB_DATA.fleet);
  const routeResult = buildRoutes(allocResult, HFB_DATA.fleet, HFB_DATA.coldChainRules);
  const risks = computeRiskAssessment(allocResult, routeResult, HFB_DATA);

  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const pct = (n) => (n * 100).toFixed(1) + "%";

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
    document.getElementById("sidebar").classList.remove("open");
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      history.replaceState(null, "", "#" + link.dataset.section);
      showSection(link.dataset.section);
    });
  });

  document.getElementById("menu-btn").addEventListener("click", () => {
    const sb = document.getElementById("sidebar");
    const open = sb.classList.toggle("open");
    document.getElementById("menu-btn").setAttribute("aria-expanded", String(open));
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

  // ---------- Schedule table ----------
  const scheduleBody = document.querySelector("#schedule-table tbody");
  const sortedRoutes = routeResult.routes.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "cold" ? -1 : 1;
    return a.estMinutes - b.estMinutes;
  });
  let dispatchClock = 6 * 60 + 30; // 6:30 AM
  sortedRoutes.forEach((r) => {
    const h = Math.floor(dispatchClock / 60) % 24;
    const m = dispatchClock % 60;
    const timeStr = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${timeStr}</td>
      <td><strong>${r.truck.id}</strong></td>
      <td>${r.kind === "cold" ? "Refrigerated" : "Dry"}</td>
      <td>${r.stops.length ? r.stops.map((s) => s.zip).join(", ") : "—"}</td>
      <td>${r.stops.length ? r.estMinutes + " min" : "—"}</td>
      <td><span class="badge badge-green">Planned</span></td>`;
    scheduleBody.appendChild(tr);
    dispatchClock += r.kind === "cold" ? 20 : 35;
  });

  // ---------- Allocation table ----------
  const allocBody = document.querySelector("#alloc-table tbody");
  const sortedZones = allocResult.zones.slice().sort((a, b) => b.allocLbs - a.allocLbs);
  sortedZones.forEach((z) => {
    const capPct = z.allocLbs / z.agencyCapacityLbs;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${z.neighborhood}</strong><br><span class="mono small muted">${z.zip}</span></td>
      <td>${z.agencyName}</td>
      <td>${z.povertyRatePct.toFixed(1)}% <span class="src">${z.povertyRateSource}</span></td>
      <td>${fmt(z.fiPopulation)}</td>
      <td class="mono">${fmt(z.allocLbs)}</td>
      <td class="mono small">${fmt(z.coldLbs)} / ${fmt(z.dryLbs)}</td>
      <td>
        <div class="bar-cell">
          <div class="bar-track"><div class="bar-fill ${capPct > 0.95 ? "over" : ""}" style="width:${Math.min(100, capPct * 100)}%"></div></div>
          <span class="mono small">${pct(capPct)}</span>
        </div>
      </td>`;
    allocBody.appendChild(tr);
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
    warn.innerHTML = `<div class="route-head"><strong>⚠ Unrouted cold-chain risk</strong></div>
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
      html: '<div style="background:#14b8a6;width:16px;height:16px;border-radius:4px;border:2px solid #fbfcfd;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
      className: "", iconSize: [16, 16], iconAnchor: [8, 8],
    });
    L.marker([HFB_DATA.warehouse.lat, HFB_DATA.warehouse.lon], { icon: whIcon })
      .addTo(map)
      .bindPopup(`<strong>${HFB_DATA.warehouse.name}</strong><br>${HFB_DATA.warehouse.address}`);

    const colors = { "REEFER-1": "#38bdf8", "REEFER-2": "#0ea5e9", "BOX-1": "#14b8a6", "BOX-2": "#2dd4bf", "BOX-3": "#0d9488", "BOX-4": "#134e4a" };

    routeResult.routes.forEach((r) => {
      const color = colors[r.truck.id] || "#14b8a6";
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
  const fairnessLabels = allocResult.zones.map((z) => z.zip);
  const fairnessGaps = allocResult.zones.map((z) => +(z.equityGap * 100).toFixed(2));
  new Chart(document.getElementById("fairnessChart"), {
    type: "bar",
    data: {
      labels: fairnessLabels,
      datasets: [{
        label: "Equity gap (share of lbs − share of need), pct points",
        data: fairnessGaps,
        backgroundColor: fairnessGaps.map((g) => (g < -1 ? "#ef4444" : g > 1 ? "#f59e0b" : "#14b8a6")),
        borderRadius: 5,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { title: { display: true, text: "pct points" }, grid: { color: "rgba(148,163,184,.15)" } },
        x: { grid: { display: false } },
      },
    },
  });

  const equityNotes = document.getElementById("equity-notes");
  const underserved = allocResult.zones.filter((z) => z.equityGap < -0.01).sort((a, b) => a.equityGap - b.equityGap);
  const overCapped = allocResult.zones.filter((z) => z.cappedByAgency);
  equityNotes.innerHTML = `
    <p class="muted">${underserved.length} of 13 zones are receiving a smaller share of pounds than their
    share of measured need. ${overCapped.length} zone(s) hit their partner agency's intake capacity limit
    today, which is the primary driver of any negative gap — not an intentional deprioritization.</p>
    <ul class="scope-list">
      ${underserved.slice(0, 5).map((z) => `<li><strong>${z.neighborhood} (${z.zip})</strong> — ${pct(Math.abs(z.equityGap))} below proportional share${z.cappedByAgency ? " · capacity-constrained" : ""}</li>`).join("")}
    </ul>`;

  // ---------- Allocation chart ----------
  new Chart(document.getElementById("allocChart"), {
    type: "bar",
    data: {
      labels: sortedZones.map((z) => z.zip),
      datasets: [
        { label: "Cold (lbs)", data: sortedZones.map((z) => z.coldLbs), backgroundColor: "#38bdf8", stack: "s" },
        { label: "Dry (lbs)", data: sortedZones.map((z) => z.dryLbs), backgroundColor: "#14b8a6", stack: "s" },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: "rgba(148,163,184,.15)" } },
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
    document.querySelectorAll("#schedule-table .badge").forEach((b) => {
      b.textContent = "Approved";
      b.className = "badge badge-green";
    });
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
