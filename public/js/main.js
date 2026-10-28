import * as THREE from 'three';
import * as api from './api.js';
import { Clock, Status, RegionPanel, Ticker, Toast, Overlay } from './hud.js';
import { LawsPanel } from './laws.js';
import { ParliamentScene } from './scenes/parliament.js';
import { CityScene } from './scenes/city.js';
import { CountrysideScene } from './scenes/countryside.js';

const POLL_MS = 1000;
const VIEWS = ['parliament', 'city', 'countryside'];

// --- Rendering -------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const labelsHost = document.getElementById('labels');
const scenes = {
  parliament: new ParliamentScene(renderer, labelsHost),
  city: new CityScene(renderer, labelsHost),
  countryside: new CountrysideScene(renderer, labelsHost),
};

// --- HUD -------------------------------------------------------------------
const panelEl = document.getElementById('panel');
const clock = new Clock(document.getElementById('clock'), { onSpeed: changeSpeed });
const status = new Status(document.getElementById('status'));
const ticker = new Ticker(document.getElementById('ticker'));
const toast = new Toast(document.getElementById('toast'));
const overlay = new Overlay(document.getElementById('overlay'));

const meta = await api.meta();
const section = (v) => panelEl.querySelector(`[data-panel="${v}"]`);
const panels = {
  parliament: new LawsPanel(section('parliament'), meta.laws, { onVote: vote }),
  city: new RegionPanel(section('city'), 'city', {
    title: 'Lisboa',
    kind: 'cidade',
    blurb: 'Cada edifício representa milhares de casas e cada figura muitos agregados. Inspirado nas colinas, nas fachadas coloridas e nos jacarandás de Lisboa.',
  }),
  countryside: new RegionPanel(section('countryside'), 'countryside', {
    title: 'Interior',
    kind: 'campo',
    blurb: 'Uma vila à volta da câmara municipal, montes e campos junto ao rio. Mais terrenos e casas vazias, menos empregos e serviços.',
  }),
};

let { state, resumed } = await api.resumeOrCreate();
let view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'city';
let lastSpeed = state.clock.speed || 1;

function apply(next) {
  state = next;
  clock.update(state);
  status.update(state);
  ticker.update(state.news);
  panels[view].update(state);
  for (const s of Object.values(scenes)) s.update(state);
  if (state.status !== 'running' && !overlay.open) overlay.gameOver(state, { onRestart: restart, onSave: saveScore });
}

function setView(next) {
  view = next;
  history.replaceState(null, '', `#${view}`);
  document.querySelectorAll('[role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === view)));
  for (const v of VIEWS) {
    section(v).hidden = v !== view;
    scenes[v].setActive(v === view);
  }
  panels[view].update(state);
  panelEl.scrollTop = 0;
  resize();
}

// --- Actions ---------------------------------------------------------------
async function changeSpeed(speed) {
  if (speed > 0) lastSpeed = speed;
  apply(await api.setSpeed(state.id, speed));
}

async function vote(law, level) {
  try {
    const { result, state: next } = await api.vote(state.id, law, level);
    apply(next);
    scenes.parliament.showVote(result.vote);
    const def = meta.laws.find((l) => l.id === law);
    toast.show(
      `Aprovado: «${def.levels[level].label}» — ${result.vote.yes} a favor, ${result.vote.against} contra, ${result.vote.abstain} abstenções`,
    );
  } catch (err) {
    toast.show(`A votação falhou: ${err.message}`);
  }
}

async function saveScore(name) {
  return api.saveScore(state.id, name);
}

async function restart() {
  apply(await api.createGame());
  showIntro(false);
}

function showIntro(isResumed) {
  overlay.intro({ resumed: isResumed, onStart: () => changeSpeed(isResumed ? lastSpeed : 1) });
}

async function poll() {
  try {
    apply(await api.getGame(state.id));
  } catch (err) {
    if (err instanceof api.NotFound) {
      toast.show('O servidor reiniciou, por isso começou um novo jogo.');
      await restart();
    }
  } finally {
    setTimeout(poll, POLL_MS);
  }
}

// --- Events ----------------------------------------------------------------
document.querySelectorAll('[role="tab"]').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (VIEWS.includes(v) && v !== view) setView(v);
});

window.addEventListener('keydown', (e) => {
  if (overlay.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key >= '1' && e.key <= '3') setView(VIEWS[Number(e.key) - 1]);
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    changeSpeed(state.clock.speed ? 0 : lastSpeed);
  }
});

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  const side = w > 760 ? panelEl.offsetWidth + 16 : 0;
  for (const s of Object.values(scenes)) s.resize(w, h, side);
}
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  scenes[view].tick(dt);
  scenes[view].render(renderer);
  requestAnimationFrame(frame);
}

// --- Start -----------------------------------------------------------------
if (resumed && state.clock.speed > 0) state = await api.setSpeed(state.id, 0);
apply(state);
setView(view);
if (state.status === 'running') showIntro(resumed && state.date.year * 12 + state.date.month > 2027 * 12);
requestAnimationFrame(frame);
setTimeout(poll, POLL_MS);
