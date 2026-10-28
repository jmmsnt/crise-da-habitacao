// Leaderboard page: top scores and the laws each player changed.

import * as api from './api.js';
import * as fmt from './format.js';
import { escapeHtml } from './format.js';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const RESULT = { finished: 'Mandato completo', bankrupt: 'Falência do Estado', collapse: 'Governo caiu' };

const monthLabel = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

function decisions(entry, laws) {
  if (!entry.decisions.length) return '<p class="muted small">Não mudou nenhuma lei.</p>';
  const byId = Object.fromEntries(laws.map((l) => [l.id, l]));
  return `<ol class="decisions">${entry.decisions
    .map((d) => {
      const law = byId[d.law];
      if (!law) return '';
      return `<li><time>${monthLabel(d.date)}</time> <b>${escapeHtml(law.name)}</b>: ${escapeHtml(law.levels[d.from].label)} → ${escapeHtml(law.levels[d.to].label)}</li>`;
    })
    .join('')}</ol>`;
}

function finalLaws(entry, laws) {
  return laws.map((l) => `<span class="pill">${escapeHtml(l.name)}: ${escapeHtml(l.levels[entry.laws[l.id]].label)}</span>`).join('');
}

const [meta, entries] = await Promise.all([api.meta(), api.scores()]);
const list = document.getElementById('list');

if (!entries.length) {
  list.innerHTML = '<p class="muted">Ainda não há pontuações. Seja o primeiro!</p>';
} else {
  list.innerHTML = entries
    .map((e, i) => {
      const a = e.averages;
      const years = (e.months / 12).toLocaleString('pt-PT', { maximumFractionDigits: 1 });
      return `
        <details class="score-row">
          <summary>
            <span class="rank">${i + 1}</span>
            <span class="who"><b>${escapeHtml(e.name)}</b><small class="muted">${RESULT[e.status] ?? e.status} · ${years} anos · até ${monthLabel(e.endDate)}</small></span>
            <span class="pts">${fmt.int(e.score)}<small> pontos</small></span>
          </summary>
          <div class="score-detail">
            <dl class="kv">
              <dt>Serviços públicos (média)</dt><dd>${Math.round(a.services)}</dd>
              <dt>Dinheiro para viver (média)</dt><dd>${Math.round(a.money)}</dd>
              <dt>Acesso à habitação (média)</dt><dd>${Math.round(a.housing)}</dd>
              <dt>Igualdade de poupança (média)</dt><dd>${Math.round(a.equality)}</dd>
            </dl>
            <h3>Decisões</h3>
            ${decisions(e, meta.laws)}
            <h3>Leis no fim</h3>
            <div class="pills">${finalLaws(e, meta.laws)}</div>
          </div>
        </details>`;
    })
    .join('');
}
