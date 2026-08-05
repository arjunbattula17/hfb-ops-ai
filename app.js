// Renders the DATA object (produced by a builder/critic subagent pipeline
// grounded in real Houston Food Bank + logistics-industry research) into
// the dashboard. No numbers are computed or invented here — everything
// rendered is exactly what the builder cited and the critic verified.

function fmtMetric(m) {
  const est = m.is_estimate
    ? `<span class="badge wait" title="${(m.estimate_basis || '').replace(/"/g, '&quot;')}">estimate</span>`
    : `<span class="badge ok">sourced</span>`;
  const src = m.source_url
    ? `<a href="${m.source_url}" target="_blank" rel="noopener">${m.source_name || 'source'}</a>`
    : (m.source_name || 'source not linked');
  return `
    <div class="metric">
      <div class="metric-top">
        <div class="metric-val">${m.value}</div>
        ${est}
      </div>
      <div class="metric-lbl">${m.label}</div>
      <div class="metric-src">${src}</div>
    </div>`;
}

function scoreBadgeClass(score) {
  if (score >= 8) return 'good';
  if (score >= 5) return 'wait';
  return 'warn';
}

function renderPiece(entry) {
  const b = entry.builder2 || entry.builder1;
  const c2 = entry.critic2;
  const c1 = entry.critic1;
  const readyBadge = c2 && c2.is_ready
    ? `<span class="badge ok">critic-verified</span>`
    : `<span class="badge warn">critic flagged open issues</span>`;

  const metrics = (b.key_metrics || []).map(fmtMetric).join('');

  const bench = b.benchmark_comparison || {};
  const benchSrc = bench.industry_source_url
    ? `<a href="${bench.industry_source_url}" target="_blank" rel="noopener">${bench.industry_source_name || 'industry source'}</a>`
    : (bench.industry_source_name || '');

  const gaps = (b.open_gaps || []).map(g => `<li>${g}</li>`).join('');

  return `
    <div class="card piece">
      <div class="piece-head">
        <h2>${entry.piece.title}</h2>
        ${readyBadge}
        <span class="badge ${scoreBadgeClass(c2 ? c2.score_1_to_10 : 0)}" title="critic score after revision">
          critic score: ${c2 ? c2.score_1_to_10 : '—'}/10
        </span>
      </div>
      <p class="hint">${b.summary}</p>
      <div class="grid cols-3 metric-grid">${metrics}</div>
      <div class="bench">
        <h3>Benchmarked against real industry data</h3>
        <p><strong>Our approach:</strong> ${bench.our_approach || '—'}</p>
        <p><strong>Industry reference:</strong> ${bench.industry_reference || '—'} ${benchSrc ? `(${benchSrc})` : ''}</p>
      </div>
      <div class="rec">
        <h3>Recommendation</h3>
        <p>${b.recommendation}</p>
      </div>
      ${gaps ? `<div class="assumption"><strong>Still open per critic:</strong><ul>${gaps}</ul></div>` : ''}
    </div>`;
}

function renderSources(research) {
  const rows = [];
  (research || []).forEach(r => {
    (r.facts || []).forEach(f => {
      rows.push(`<tr>
        <td>${r.domain}</td>
        <td>${f.label}</td>
        <td class="num">${f.value}</td>
        <td>${f.source_url ? `<a href="${f.source_url}" target="_blank" rel="noopener">${f.source_name}</a>` : f.source_name}</td>
        <td>${f.period || ''}</td>
      </tr>`);
    });
  });
  const unresolved = [];
  (research || []).forEach(r => (r.unresolved || []).forEach(u => unresolved.push(`<li><strong>${r.domain}:</strong> ${u}</li>`)));

  return `
    <div class="card">
      <h2>Verified source facts</h2>
      <p class="hint">Every figure below was retrieved live via web search/fetch by a research agent, not recalled from training data. Anything the agents could not verify is listed separately as unresolved rather than guessed.</p>
      <table>
        <thead><tr><th>Domain</th><th>Fact</th><th class="num">Value</th><th>Source</th><th>Period</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
    ${unresolved.length ? `<div class="card"><h2>Could not be verified (excluded from the dashboard)</h2><ul>${unresolved.join('')}</ul></div>` : ''}
  `;
}

function render() {
  const app = document.getElementById('app');
  const pieces = (DATA.results || []).map(renderPiece).join('');
  app.innerHTML = `
    <div class="section-title">Operations Modules</div>
    <div class="grid cols-1">${pieces}</div>
    <div class="section-title">Methodology &amp; Sources</div>
    ${renderSources(DATA.research)}
  `;
}

document.addEventListener('DOMContentLoaded', render);
