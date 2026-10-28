// HTML overlay: clock (top left), status (bottom left), region panels (right),
// news ticker, toast and dialogs. DOM is built once and updated in place.

import { CATEGORY_COLORS, HOUSE_TYPES, PEOPLE_COLORS, slotCounts } from './scenes/kit.js';
import * as fmt from './format.js';
import { escapeHtml } from './format.js';

function bind(root) {
  const map = {};
  root.querySelectorAll('[data-k]').forEach((el) => (map[el.dataset.k] = el));
  return map;
}

function sparkPath(values, w = 76, h = 28) {
  if (values.length < 2) return `M0 ${h / 2} L${w} ${h / 2}`;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }
  return values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - ((v - min) / (max - min)) * (h - 2) - 1).toFixed(1)}`)
    .join(' ');
}

// ---------------------------------------------------------------------------

export class Clock {
  constructor(root, { onSpeed }) {
    this.el = bind(root);
    this.onSpeed = onSpeed;
    this.built = false;
  }

  update(state) {
    const { date, clock } = state;
    this.el.date.textContent = date.label;
    const progress = ((date.day - 1 + clock.dayProgress) / date.daysInMonth) * 100;
    this.el.progress.style.width = `${progress}%`;
    if (!this.built) {
      this.el.speeds.innerHTML = clock.speeds
        .map((s) => `<button type="button" data-speed="${s}" title="${s ? `${s} ${s > 1 ? 'meses' : 'mês'} por minuto` : 'Pausa (espaço)'}">${s ? `${s}×` : '❚❚'}</button>`)
        .join('');
      this.el.speeds.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) this.onSpeed(Number(b.dataset.speed));
      });
      this.built = true;
    }
    for (const b of this.el.speeds.children) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === clock.speed));
    this.el.pace.textContent = clock.speed ? `1 min = ${clock.speed} ${clock.speed > 1 ? 'meses' : 'mês'}` : 'Em pausa';
    const sc = state.score;
    const year = Math.min(sc.maxMonths / 12, Math.floor(sc.months / 12) + 1);
    this.el.term.textContent = `Ano ${year} de ${sc.maxMonths / 12}`;
    this.el.score.textContent = `${fmt.int(sc.total)} pontos`;
  }
}

// ---------------------------------------------------------------------------

export class Status {
  constructor(root) {
    const metric = (k, name, extra = '') => `
      <div class="metric">
        <div>
          <div class="name">${name}</div>
          <div class="value" data-k="${k}">—</div>
          ${extra}
        </div>
        <svg viewBox="0 0 76 30" aria-hidden="true"><line x1="0" x2="76" y1="29" y2="29"></line><path data-k="${k}Spark"></path></svg>
      </div>`;
    // On phones the indicators collapse into a one-line header (see style.css)
    root.innerHTML = `
      <button class="status-toggle" type="button" aria-expanded="false" data-k="summary"></button>
      <div class="metrics">${[
        metric('money', 'Orçamento do Estado'),
        metric('services', 'Serviços públicos', '<div class="bar"><span data-k="servicesBar"></span></div>'),
        metric('homeless', 'Sem casa'),
        metric('toLive', 'Dinheiro para viver'),
        metric('inequality', 'Desigualdade de poupança'),
      ].join('')}</div>`;
    this.el = bind(root);
    this.el.summary.addEventListener('click', () => {
      const open = root.classList.toggle('open');
      this.el.summary.setAttribute('aria-expanded', String(open));
    });
  }

  update(state) {
    const ind = state.indicators;
    const hist = state.history;
    const last = state.government.lastMonth;
    this.el.summary.textContent = `Indicadores · ${fmt.millions(ind.money)} · ${fmt.pct(ind.homelessRate)} sem casa · serviços ${Math.round(ind.publicServices)}`;
    const balance = last ? last.balance : state.government.currentMonthBalance;
    this.el.money.innerHTML = `${fmt.millions(ind.money)}<small class="${balance >= 0 ? 'up-good' : 'up-bad'}">${fmt.signedMillions(balance)}/mês</small>`;
    this.el.moneySpark.setAttribute('d', sparkPath([...hist.map((h) => h.money), ind.money]));

    const q = ind.publicServices;
    this.el.services.innerHTML = `${Math.round(q)}<small>/ 100</small>`;
    this.el.servicesBar.style.width = `${q}%`;
    this.el.servicesBar.style.background = q < 45 ? 'var(--bad)' : q < 60 ? 'var(--warn)' : 'var(--good)';
    this.el.servicesSpark.setAttribute('d', sparkPath([...hist.map((h) => h.publicServices), q]));

    this.el.homeless.innerHTML = `${fmt.pct(ind.homelessRate)}<small>${fmt.int(ind.homeless)} agregados</small>`;
    this.el.homelessSpark.setAttribute('d', sparkPath([...hist.map((h) => h.homelessRate), ind.homelessRate]));

    this.el.toLive.innerHTML = `${fmt.euro(ind.moneyToLive)}<small>/ mês após a habitação (€ de 2027)</small>`;
    this.el.toLiveSpark.setAttribute('d', sparkPath([...hist.map((h) => h.moneyToLive), ind.moneyToLive]));

    const sv = ind.savings;
    this.el.inequality.innerHTML = `${Math.round(ind.inequality * 100)}<small>/ 100 · poupança: senhorio ${fmt.euro(sv.landlord)}, inquilino ${fmt.euro(sv.tenant)}</small>`;
    this.el.inequalitySpark.setAttribute('d', sparkPath([...hist.map((h) => h.inequality ?? ind.inequality), ind.inequality]));
  }
}

// ---------------------------------------------------------------------------

// Slot categories in the order shown, with their Portuguese labels
const HOUSE_ROWS = [
  ['owner', 'Habitadas pelos donos'],
  ['rented', 'De senhorios · arrendadas'],
  ['vacant', 'De senhorios · vazias'],
  ['fundRented', 'De fundos · arrendadas'],
  ['fundVacant', 'De fundos · vazias'],
  ['degraded', 'Privadas · degradadas'],
  ['publicRented', 'Públicas · arrendadas'],
  ['publicDegraded', 'Públicas · degradadas'],
  ['construction', 'Em construção'],
  ['land', 'Terrenos sem casas'],
];

const PEOPLE_LEGEND = [
  ['homeless', 'Sem casa'],
  ['owner', 'Proprietários'],
  ['tenant', 'Inquilinos'],
  ['landlord', 'Senhorios'],
  ['fund', 'Fundos de investimento'],
  ['builder', 'Construtores'],
];

const PROJECT_NAMES = { school: 'escola', hospital: { city: 'hospital', countryside: 'centro de saúde' } };

function dotStyle(cat) {
  const color = CATEGORY_COLORS[cat];
  return HOUSE_TYPES[cat]?.use === 'vacant'
    ? `background:transparent;box-shadow:inset 0 0 0 3px ${color}`
    : `background:${color}`;
}

export class RegionPanel {
  constructor(root, key, { title, kind, blurb }) {
    this.key = key;
    root.innerHTML = `
      <h2>${title} <span class="muted small">${kind}</span></h2>
      <p class="muted small">${blurb}</p>

      <h3>Casas <span data-k="homes" class="muted"></span></h3>
      <div class="stack">${HOUSE_ROWS.map(([c]) => `<span data-k="bar-${c}" style="background:${CATEGORY_COLORS[c]}${HOUSE_TYPES[c]?.use === 'vacant' ? ';opacity:.55' : ''}"></span>`).join('')}</div>
      <div class="rows">
        ${HOUSE_ROWS.map(
          ([c, label]) => `<i class="dot" style="${dotStyle(c)}"></i><span>${label}</span><span class="v" data-k="v-${c}"></span><span class="p" data-k="p-${c}"></span>`,
        ).join('')}
      </div>
      <p class="muted small">A cor mostra quem é o dono: amarelo quem lá vive, rosa senhorios, roxo fundos, verde-azulado o Estado. Persianas fechadas = casa vazia; cor escurecida, telhado e cantos estragados = casa degradada.</p>

      <h3>Pessoas <span data-k="households" class="muted"></span></h3>
      <dl class="kv">
        <dt>Sem casa</dt><dd data-k="homeless"></dd>
        <dt>Proprietários que lá vivem</dt><dd data-k="owners"></dd>
        <dt>Inquilinos · privados</dt><dd data-k="privateTenants"></dd>
        <dt>Inquilinos · habitação pública</dt><dd data-k="publicTenants"></dd>
        <dt>Senhorios</dt><dd data-k="landlords"></dd>
        <dt>Fundos de investimento</dt><dd data-k="funds"></dd>
        <dt>Construtores aqui</dt><dd data-k="builders"></dd>
      </dl>
      <div class="legend" style="margin-top:8px">
        ${PEOPLE_LEGEND.map(([t, l]) => `<span><i style="background:${PEOPLE_COLORS[t]}"></i>${l}</span>`).join('')}
      </div>
      <p class="muted small">Os moradores aparecem nas varandas e janelas das casas onde vivem; quem não tem casa fica na praça principal.</p>

      <h3>Poupança por mês <span class="muted">· nacional, € de 2027</span></h3>
      <dl class="kv">
        <dt>Proprietário que vive na sua casa</dt><dd data-k="saveOwner"></dd>
        <dt>Inquilino · privado</dt><dd data-k="saveTenant"></dd>
        <dt>Inquilino · habitação pública</dt><dd data-k="savePublic"></dd>
        <dt>Sem casa</dt><dd>0 €</dd>
        <dt>Senhorio (com as rendas)</dt><dd data-k="saveLandlord"></dd>
        <dt>Fundo de investimento (por fundo)</dt><dd data-k="saveFund"></dd>
        <dt>Desigualdade (Gini)</dt><dd data-k="gini"></dd>
      </dl>
      <p class="muted small">Quem não tem casa própria poupa menos: a renda come o que sobraria. Os senhorios e os fundos poupam também as rendas que recebem.</p>

      <h3>Mercado da habitação</h3>
      <dl class="kv">
        <dt>Renda, novos contratos</dt><dd data-k="rent"></dd>
        <dt>Renda média paga</dt><dd data-k="tenantRent"></dd>
        <dt>Renda de mercado sem teto</dt><dd data-k="shadowRent"></dd>
        <dt>Preço de uma casa</dt><dd data-k="price"></dd>
      </dl>

      <h3>Infraestruturas</h3>
      <dl class="kv">
        <dt>Escolas</dt><dd data-k="schools"></dd>
        <dt>${key === 'city' ? 'Hospitais' : 'Centros de saúde'}</dt><dd data-k="hospitals"></dd>
        <dt>Estradas e ferrovia</dt><dd data-k="transport"></dd>
      </dl>
      <p class="muted small" data-k="projects"></p>

      <h3>Último mês</h3>
      <dl class="kv">
        <dt>Agregados que encontraram casa</dt><dd data-k="housed"></dd>
        <dt>Agregados que perderam a casa</dt><dd data-k="evictions"></dd>
        <dt>Casas compradas por fundos</dt><dd data-k="fundPurchases"></dd>
        <dt>Casas concluídas · privadas</dt><dd data-k="completedPrivate"></dd>
        <dt>Casas concluídas · públicas</dt><dd data-k="completedPublic"></dd>
      </dl>`;
    this.el = bind(root);
  }

  update(state) {
    const r = state.regions[this.key];
    const counts = slotCounts(r);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    this.el.homes.textContent = `· ${fmt.int(total)} casas e terrenos`;
    for (const [c] of HOUSE_ROWS) {
      this.el[`v-${c}`].textContent = fmt.int(counts[c]);
      this.el[`p-${c}`].textContent = fmt.pct(counts[c] / total);
      this.el[`bar-${c}`].style.width = `${(counts[c] / total) * 100}%`;
    }

    const p = r.people;
    this.el.households.textContent = `· ${fmt.int(p.households)} agregados`;
    this.el.homeless.innerHTML = `${fmt.int(p.homeless)} <span class="delta muted">${fmt.pct(p.homeless / p.households)}</span>`;
    this.el.owners.textContent = fmt.int(p.owners);
    this.el.privateTenants.textContent = fmt.int(p.privateTenants);
    this.el.publicTenants.textContent = fmt.int(p.publicTenants);
    this.el.landlords.textContent = fmt.int(p.landlords);
    this.el.funds.innerHTML = `${fmt.int(p.funds)} <span class="delta muted">${fmt.int(p.fundHomes)} casas aqui</span>`;
    this.el.builders.innerHTML = `${fmt.int(p.builders)} <span class="delta muted">de ${fmt.int(state.national.builders)}</span>`;

    const sv = state.indicators.savings;
    this.el.saveOwner.textContent = fmt.euro(sv.owner);
    this.el.saveTenant.textContent = fmt.euro(sv.tenant);
    this.el.savePublic.textContent = fmt.euro(sv.publicTenant);
    this.el.saveLandlord.textContent = fmt.euro(sv.landlord);
    this.el.saveFund.textContent = fmt.euro(sv.fund);
    this.el.gini.textContent = `${Math.round(state.indicators.inequality * 100)} / 100`;

    const m = r.market;
    const delta = (v) => `<span class="delta ${v > 0.005 ? 'up-bad' : v < -0.005 ? 'up-good' : 'muted'}">${fmt.signedPct(v)}/ano</span>`;
    this.el.rent.innerHTML = `${fmt.euro(m.rent)}/mês ${delta(m.rentGrowthYear)}`;
    this.el.tenantRent.textContent = `${fmt.euro(m.tenantRent)}/mês`;
    const capGap = 1 - m.rent / m.shadowRent;
    this.el.shadowRent.innerHTML =
      capGap > 0.005 ? `${fmt.euro(m.shadowRent)}/mês <span class="delta up-bad">teto ${fmt.pct(capGap, 0)} abaixo</span>` : '<span class="muted">igual à renda</span>';
    this.el.price.innerHTML = `${fmt.euro(m.price)} ${delta(m.priceGrowthYear)}`;

    const inf = r.infra;
    this.el.schools.innerHTML = `${inf.schools} <span class="delta muted">${fmt.pct(inf.schoolCoverage, 0)} de cobertura</span>`;
    this.el.hospitals.innerHTML = `${inf.hospitals} <span class="delta muted">${fmt.pct(inf.hospitalCoverage, 0)} de cobertura</span>`;
    this.el.transport.textContent = `${Math.round(inf.transport)} / 100`;
    const projectName = (type) => (type === 'school' ? PROJECT_NAMES.school : PROJECT_NAMES.hospital[this.key]);
    this.el.projects.textContent = inf.projects.length
      ? `Em construção: ${inf.projects.map((pr) => `${projectName(pr.type)} (${pr.monthsLeft} ${pr.monthsLeft === 1 ? 'mês' : 'meses'} em falta)`).join(', ')}.`
      : 'Novas escolas e hospitais são construídos automaticamente quando a cobertura é baixa e o orçamento está acima de 300 M€.';

    const lm = r.lastMonth;
    for (const k of ['housed', 'evictions', 'fundPurchases', 'completedPrivate', 'completedPublic']) {
      this.el[k].textContent = lm[k] === undefined ? '—' : fmt.int(lm[k]);
    }
  }
}

// ---------------------------------------------------------------------------

const TONE = { good: 'var(--good)', bad: 'var(--bad)', law: 'var(--accent)', info: '#9aa5ae' };

export class Ticker {
  constructor(root) {
    this.root = root;
    this.key = '';
  }

  update(news) {
    const top = news.slice(0, 3);
    const key = top.map((n) => n.date + n.text).join('|');
    if (key === this.key) return;
    this.key = key;
    this.root.innerHTML = top
      .map((n) => `<div><i class="tone" style="background:${TONE[n.tone] ?? TONE.info}"></i><time>${fmt.shortDate(n.date)}</time><span>${escapeHtml(n.text)}</span></div>`)
      .join('');
  }
}

export class Toast {
  constructor(root) {
    this.root = root;
    this.timer = null;
  }

  show(text, ms = 4500) {
    this.root.textContent = text;
    this.root.classList.add('show');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.root.classList.remove('show'), ms);
  }
}

export class Overlay {
  constructor(root) {
    this.root = root;
  }

  intro({ resumed, onStart }) {
    this.root.innerHTML = `
      <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <h1 id="intro-title">Crise da Habitação</h1>
        <p class="muted">Lisboa e Interior · uma simulação</p>
        <p>Está a governar. As rendas sobem, os fundos de investimento compram casas e há demasiados agregados sem sítio para viver.</p>
        <ul>
          <li><b>Parlamento</b>: aprove leis sobre imigração, investimento estrangeiro, habitação pública e privada, inovação na construção e regras do arrendamento.</li>
          <li><b>Lisboa</b> e <b>Interior</b>: veja o que acontece às casas e às pessoas. Cada edifício representa milhares de casas.</li>
          <li>Acompanhe o <b>orçamento</b>, os <b>serviços públicos</b> e a percentagem de agregados <b>sem casa</b> (canto inferior esquerdo).</li>
        </ul>
        <p class="muted small">Um minuto real é um mês no jogo. As leis entram em vigor de imediato, mas os efeitos demoram meses ou anos. O mandato dura 20 anos; se a dívida passar os 800 M€ ou um quarto dos agregados ficar sem casa, o governo cai antes.</p>
        <p class="muted small">Pontuação: cada mês vale até 100 pontos, conforme os serviços públicos, o dinheiro para viver, o acesso à habitação e a igualdade de poupança. Ganha quem mantiver a melhor qualidade de vida durante mais tempo. <a href="/scores.html" target="_blank" rel="noopener">Ver pontuações</a></p>
        <button class="primary" type="button">${resumed ? 'Continuar' : 'Começar a governar'}</button>
      </div>`;
    this.root.hidden = false;
    this.root.querySelector('button').addEventListener('click', () => {
      this.hide();
      onStart();
    });
  }

  gameOver(state, { onRestart, onSave }) {
    const title = { finished: 'Fim do mandato', bankrupt: 'Fim do jogo', collapse: 'Fim do jogo' }[state.status];
    const reason = {
      finished: 'Governou durante 20 anos sem perder o poder. Parabéns!',
      bankrupt: 'O Estado ficou sem dinheiro. Os credores internacionais assumem o orçamento.',
      collapse: 'Um em cada quatro agregados não tem casa. O governo cai.',
    }[state.status];
    const sc = state.score;
    const a = sc.averages;
    const years = (sc.months / 12).toLocaleString('pt-PT', { maximumFractionDigits: 1 });
    this.root.innerHTML = `
      <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="over-title">
        <h1 id="over-title">${title}</h1>
        <p>${reason}</p>
        <div class="final-score"><span>${fmt.int(sc.total)}</span> pontos</div>
        <p class="muted small">${years} anos de governo, até ${state.date.label}. Cada mês vale até 100 pontos: a média de serviços públicos, dinheiro para viver, acesso à habitação e igualdade de poupança.</p>
        <dl class="kv score-parts">
          <dt>Serviços públicos</dt><dd>${Math.round(a.services)}</dd>
          <dt>Dinheiro para viver</dt><dd>${Math.round(a.money)}</dd>
          <dt>Acesso à habitação</dt><dd>${Math.round(a.housing)}</dd>
          <dt>Igualdade de poupança</dt><dd>${Math.round(a.equality)}</dd>
        </dl>
        <form class="save-score" ${state.scoreSaved ? 'hidden' : ''}>
          <label for="score-name">O seu nome</label>
          <div><input id="score-name" name="name" maxlength="40" autocomplete="nickname" required /><button type="submit">Guardar pontuação</button></div>
          <p class="small" data-msg></p>
        </form>
        <p class="small" data-saved ${state.scoreSaved ? '' : 'hidden'}>Pontuação guardada. <a href="/scores.html" target="_blank" rel="noopener">Ver as melhores pontuações</a></p>
        <button class="primary" type="button" data-restart>Novo jogo</button>
      </div>`;
    this.root.hidden = false;
    const form = this.root.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = form.querySelector('[data-msg]');
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const { rank } = await onSave(form.elements.name.value);
        form.hidden = true;
        const saved = this.root.querySelector('[data-saved]');
        saved.hidden = false;
        saved.firstChild.textContent = rank ? `Pontuação guardada: ${rank}.º lugar. ` : 'Pontuação guardada. ';
      } catch (err) {
        msg.textContent = err.message;
        button.disabled = false;
      }
    });
    this.root.querySelector('[data-restart]').addEventListener('click', () => {
      this.hide();
      onRestart();
    });
    if (!state.scoreSaved) form.elements.name.focus();
  }

  hide() {
    this.root.hidden = true;
    this.root.innerHTML = '';
  }

  get open() {
    return !this.root.hidden;
  }
}

export { escapeHtml } from './format.js';
