// Renders the builder -> critic -> revise -> critic evolution for each
// module, straight from DATA.results (same object index.html uses).
// This is the literal transcript of the fresh-context critic loop, not a
// marketing summary of it.

function scoreClass(s) {
  if (s >= 8) return 'good';
  if (s >= 5) return 'wait';
  return 'warn';
}

function readyPill(ready) {
  return ready
    ? '<span class="badge ok">critic convinced</span>'
    : '<span class="badge warn">critic still not convinced</span>';
}

function renderEntry(entry) {
  const c1 = entry.critic1, c2 = entry.critic2;
  const flags = (c1.fabrication_flags || []).filter(f => f && !/^no fabrication/i.test(f));
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="piece-head">
        <h2>${entry.piece.title}</h2>
        ${readyPill(c2 ? c2.is_ready : false)}
      </div>
      <div class="evo-row" style="border-bottom:none;padding-top:4px">
        <div><strong>Round 1</strong><div class="timestamp">builder drafts, fresh-context critic checks it against real sources</div></div>
        <div class="score ${scoreClass(c1.score_1_to_10)}">${c1.score_1_to_10}/10</div>
        <div>${c1.verdict}</div>
        <div class="evo-arrow">→</div>
        <div class="score ${scoreClass(c2 ? c2.score_1_to_10 : 0)}">${c2 ? c2.score_1_to_10 : '—'}/10</div>
      </div>
      ${flags.length ? `<div class="assumption"><strong>What the critic caught in round 1:</strong><ul>${flags.map(f => `<li>${f}</li>`).join('')}</ul></div>` : ''}
      <div class="assumption"><strong>Biggest gap sent back to the builder:</strong> ${c1.biggest_gap}</div>
      <div class="assumption"><strong>Round 2 (after revision) — independent re-verification:</strong> ${c2 ? c2.comparison_to_real_data : 'not run'}</div>
      ${c2 && !c2.is_ready ? `<div class="callout">Critic is still not fully convinced after one revision round: <em>${c2.biggest_gap}</em> This module ships with that caveat visible rather than being rubber-stamped.</div>` : ''}
    </div>`;
}

function renderResearchLog(research) {
  const rows = (research || []).map(r => `
    <div class="evo-row" style="grid-template-columns:1fr 90px 90px">
      <div><strong>${r.domain}</strong></div>
      <div class="score good">${(r.facts || []).length} facts</div>
      <div class="score warn">${(r.unresolved || []).length} unresolved</div>
    </div>`).join('');
  return `<div class="card"><h2>Research phase</h2><p class="hint">5 parallel research agents, each instructed to use live web search/fetch only — no training-data recall — and to list anything unverifiable as "unresolved" rather than guess.</p>${rows}</div>`;
}

function render() {
  const app = document.getElementById('app');
  const entries = (DATA.results || []).map(renderEntry).join('');
  app.innerHTML = `
    ${renderResearchLog(DATA.research)}
    <div class="section-title">Module-by-module evolution</div>
    ${entries}
  `;
}

document.addEventListener('DOMContentLoaded', render);
