// Portuguese (pt-PT) number, money and date formats.

const LOCALE = 'pt-PT';
const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const dec = (v, digits) => v.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const int = (v) => intFmt.format(Math.round(v));
export const pct = (v, digits = 1) => `${dec(v * 100, digits)}%`;
export const euro = (v) => `${int(v)} €`;

// Millions of euros: 312 M€, 1,25 mil M€, −40 M€
export function millions(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1000) return `${sign}${dec(a / 1000, 2)} mil M€`;
  return `${sign}${dec(a, a < 10 ? 1 : 0)} M€`;
}

export function signedMillions(v) {
  return `${v >= 0 ? '+' : '−'}${millions(Math.abs(v))}`;
}

export function signedPct(v, digits = 1) {
  return `${v >= 0 ? '+' : '−'}${dec(Math.abs(v) * 100, digits)}%`;
}

export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
