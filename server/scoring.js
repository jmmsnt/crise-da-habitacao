// Score entries and player names — shared by the Express server and the Cloudflare Worker.

// What we keep about a finished game: the score, how it ended and the decisions taken.
export function scoreEntry(session, name) {
  const s = session.state;
  const sc = s.score;
  const n = Math.max(1, sc.months);
  const round1 = (v) => Math.round(v * 10) / 10;
  return {
    id: session.id,
    name,
    score: Math.round(sc.total),
    months: sc.months,
    status: s.status,
    endDate: `${s.date.year}-${String(s.date.month + 1).padStart(2, '0')}`,
    savedAt: new Date().toISOString(),
    averages: Object.fromEntries(Object.entries(sc.sums).map(([k, v]) => [k, round1(v / n)])),
    laws: { ...s.laws },
    decisions: s.lawLog.map((d) => ({ ...d })),
  };
}

export function cleanName(raw) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 1 || name.length > 40) throw new RangeError('O nome deve ter entre 1 e 40 caracteres.');
  return name;
}
