// Parliament panel: one card per law with its five levels, plus last month's
// state budget so the player can see what each policy costs.

import * as fmt from './format.js';
import { escapeHtml } from './format.js';

const REVENUE = {
  incomeTax: 'Imposto sobre o rendimento (IRS)',
  propertyTax: 'Imposto municipal sobre imóveis (IMI)',
  transactionTax: 'Imposto sobre transmissões (IMT)',
  publicRents: 'Rendas da habitação pública',
  investmentFees: 'Taxas de investimento e vistos',
};

const EXPENSES = {
  publicServices: 'Serviços públicos',
  infrastructure: 'Escolas, hospitais e transportes',
  homelessSupport: 'Apoio a pessoas sem casa',
  publicHousing: 'Habitação pública',
  innovation: 'Inovação na construção',
  developerIncentives: 'Benefícios fiscais a promotores',
  integration: 'Integração de imigrantes',
  debtInterest: 'Juros da dívida',
};

export class LawsPanel {
  constructor(root, laws, { onVote }) {
    this.laws = laws;
    this.onVote = onVote;
    this.selected = {};
    this.enacted = {};
    this.busy = false;
    root.innerHTML = `
      <h2>Assembleia da República</h2>
      <p class="muted small">Escolha um nível para cada lei e ponha-a a votação. As leis entram em vigor de imediato; as consequências demoram meses ou anos a ver-se.</p>
      ${laws.map((law) => this.card(law)).join('')}
      <h3>Orçamento do Estado · último mês</h3>
      <div data-budget class="small"></div>`;
    this.root = root;
    root.addEventListener('click', (e) => this.click(e));
  }

  card(law) {
    return `
      <article class="law" data-law="${law.id}">
        <header><h4>${escapeHtml(law.name)}</h4><div class="in-force" data-in-force></div></header>
        <p class="summary">${escapeHtml(law.summary)}</p>
        <div class="levels" role="group" aria-label="Nível: ${escapeHtml(law.name)}">
          ${law.levels.map((lv, i) => `<button type="button" data-level="${i}" title="${escapeHtml(lv.label)}">${i + 1}</button>`).join('')}
        </div>
        <div class="level-name" data-level-name></div>
        <div class="effect" data-effect></div>
        <div class="actions">
          <span class="small muted" data-hint></span>
          <button class="vote" type="button" data-vote disabled>Votar</button>
        </div>
      </article>`;
  }

  click(e) {
    const card = e.target.closest('[data-law]');
    if (!card) return;
    const id = card.dataset.law;
    const levelBtn = e.target.closest('[data-level]');
    if (levelBtn) {
      this.selected[id] = Number(levelBtn.dataset.level);
      this.renderCard(id);
      return;
    }
    if (e.target.closest('[data-vote]') && !this.busy && this.selected[id] !== this.enacted[id]) {
      this.busy = true;
      Promise.resolve(this.onVote(id, this.selected[id])).finally(() => {
        this.busy = false;
        this.renderCard(id);
      });
      this.renderCard(id);
    }
  }

  update(state) {
    for (const law of this.laws) {
      const level = state.laws[law.id];
      if (this.enacted[law.id] !== level) {
        this.enacted[law.id] = level;
        this.selected[law.id] = level;
      }
      this.renderCard(law.id);
    }
    this.renderBudget(state);
  }

  renderCard(id) {
    const law = this.laws.find((l) => l.id === id);
    const card = this.root.querySelector(`[data-law="${id}"]`);
    const current = this.enacted[id];
    const sel = this.selected[id] ?? current;
    card.querySelector('[data-in-force]').textContent = `Em vigor: ${law.levels[current].label}`;
    card.querySelectorAll('[data-level]').forEach((b) => {
      const i = Number(b.dataset.level);
      b.setAttribute('aria-pressed', String(i === sel));
      b.classList.toggle('current', i === current);
    });
    card.querySelector('[data-level-name]').textContent = law.levels[sel].label;
    card.querySelector('[data-effect]').textContent = law.levels[sel].effect;
    const changed = sel !== current;
    const vote = card.querySelector('[data-vote]');
    vote.disabled = !changed || this.busy;
    vote.textContent = this.busy && changed ? 'A votar…' : 'Votar';
    card.querySelector('[data-hint]').textContent = changed ? `${law.levels[current].label} → ${law.levels[sel].label}` : 'Lei em vigor';
  }

  renderBudget(state) {
    const last = state.government.lastMonth;
    const el = this.root.querySelector('[data-budget]');
    if (!last) {
      el.innerHTML = '<p class="muted">Disponível depois do primeiro mês.</p>';
      return;
    }
    const rows = (dict, labels) =>
      Object.entries(labels)
        .filter(([k]) => Math.abs(dict[k] ?? 0) > 0.005)
        .map(([k, label]) => `<dt>${label}</dt><dd>${fmt.millions(dict[k])}</dd>`)
        .join('');
    el.innerHTML = `
      <dl class="kv">
        <dt><b>Receitas</b></dt><dd><b>${fmt.millions(last.totalRevenue)}</b></dd>
        ${rows(last.revenue, REVENUE)}
      </dl>
      <dl class="kv" style="margin-top:8px">
        <dt><b>Despesas</b></dt><dd><b>${fmt.millions(last.totalExpenses)}</b></dd>
        ${rows(last.expenses, EXPENSES)}
      </dl>
      <dl class="kv" style="margin-top:8px">
        <dt><b>Saldo</b></dt><dd class="${last.balance >= 0 ? 'up-good' : 'up-bad'}"><b>${fmt.signedMillions(last.balance)}</b></dd>
      </dl>`;
  }
}
