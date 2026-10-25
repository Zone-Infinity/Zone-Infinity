// Renders the profile's two images:
//   assets/card-{dark,light}.svg     neofetch-style: my infinity mark in ASCII, beside the rows in card.txt
//   assets/lattice-{dark,light}.svg  12 months of contributions as the Unbounded lattice, with the rows in lattice.txt
// Text comes from card.txt and lattice.txt; numbers from data.json.
// `node scripts/build.mjs --fetch` refreshes data.json from GitHub first (needs GH_TOKEN). No dependencies.
import { readFileSync, writeFileSync } from 'node:fs';

const LOGIN = 'Zone-Infinity';
const ROOT = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const write = (p, s) => writeFileSync(new URL(p, ROOT), s);

// ---------------------------------------------------------------- data
async function gql(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function fetchData() {
  const u = (await gql(`query($l:String!){ user(login:$l){
      followers{totalCount}
      repositories(ownerAffiliations:OWNER, privacy:PUBLIC, isFork:false, first:100){ totalCount nodes{ stargazerCount primaryLanguage{name} } }
      repositoriesContributedTo(contributionTypes:[COMMIT, PULL_REQUEST]){ totalCount }
      pullRequests(states:MERGED){ totalCount }
      contributionsCollection{ contributionYears } } }`, { l: LOGIN })).user;
  const days = {};
  let commits = 0;
  // One query per year: contributionsCollection spans at most a year. With a token that can see
  // private contributions, restrictedContributionsCount adds them as counts only, never names.
  for (const y of u.contributionsCollection.contributionYears) {
    const c = (await gql(`query($l:String!,$f:DateTime!,$t:DateTime!){ user(login:$l){ contributionsCollection(from:$f,to:$t){
        totalCommitContributions restrictedContributionsCount
        contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`,
      { l: LOGIN, f: `${y}-01-01T00:00:00Z`, t: `${y}-12-31T23:59:59Z` })).user.contributionsCollection;
    commits += c.totalCommitContributions + c.restrictedContributionsCount;
    for (const w of c.contributionCalendar.weeks) for (const d of w.contributionDays) if (d.contributionCount) days[d.date] = d.contributionCount;
  }
  const langs = {};
  for (const r of u.repositories.nodes) if (r.primaryLanguage) langs[r.primaryLanguage.name] = (langs[r.primaryLanguage.name] || 0) + 1;
  const data = {
    generated: new Date().toISOString().slice(0, 10),
    first: Object.keys(days).sort()[0],
    repos: u.repositories.totalCount,
    stars: u.repositories.nodes.reduce((s, n) => s + n.stargazerCount, 0),
    followers: u.followers.totalCount,
    contributed: u.repositoriesContributedTo.totalCount,
    prs: u.pullRequests.totalCount,
    topLanguage: Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    commits,
    days,
  };
  write('data.json', JSON.stringify(data));
  return data;
}

// ---------------------------------------------------------------- palette (from the brand tokens, never hard-coded)
const tokens = JSON.parse(read('tokens.json')).color.tokens;
const palette = (theme) => Object.fromEntries(tokens.filter((t) => typeof t.value === 'object').map((t) => [t.name, t.value[theme]]));
const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// Seeded RNG so the art is stable between nightly runs.
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// brand/gen.py escape_line: lateral freedom grows as t^1.6, so a strand leaves its node straight and ends loose.
const strandX = (x0, t, s) => x0 + s.amp * t ** 1.6 * Math.sin(s.ph + s.wig * 2 * Math.PI * t) + s.drift * t * t;

// ---------------------------------------------------------------- facts → placeholders
const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const prevDay = (d) => iso(Date.parse(d + 'T00:00:00Z') - DAY);
const fmtMonth = (d) => new Date(d + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const n = (x) => (x == null ? '…' : x.toLocaleString('en-US'));
const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;

function since(first, today) {
  const a = new Date(first + 'T00:00:00Z'), b = new Date(today + 'T00:00:00Z');
  let y = b.getUTCFullYear() - a.getUTCFullYear(), m = b.getUTCMonth() - a.getUTCMonth(), d = b.getUTCDate() - a.getUTCDate();
  if (d < 0) { m -= 1; d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); }
  if (m < 0) { y -= 1; m += 12; }
  return `${plural(y, 'year')}, ${plural(m, 'month')}, ${plural(d, 'day')}`;
}

// The 53 Sunday-first week columns GitHub's calendar shows, ending this week.
function lastYear(data) {
  const today = Date.parse(data.generated + 'T00:00:00Z');
  const start = today - (52 * 7 + new Date(today).getUTCDay()) * DAY;
  return Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const t = start + (w * 7 + d) * DAY;
    return { key: iso(t), n: t > today ? null : data.days[iso(t)] || 0 };
  }));
}

function facts(data) {
  const on = (d) => (data.days[d] || 0) > 0;
  // A streak is still alive if today has nothing yet but yesterday does.
  let cur = 0, d = on(data.generated) ? data.generated : prevDay(data.generated);
  while (on(d)) { cur++; d = prevDay(d); }
  let best = 0, run = 0, last = null;
  const active = Object.keys(data.days).filter(on).sort();
  for (const k of active) { run = last && prevDay(k) === last ? run + 1 : 1; best = Math.max(best, run); last = k; }
  const bestDay = active.reduce((b, k) => (data.days[k] > (data.days[b] ?? -1) ? k : b), active[0]);
  const weeks = lastYear(data);
  const year = weeks.flat().reduce((s, x) => s + (x.n || 0), 0);
  const busiestWeek = weeks.map((c) => ({ key: c[0].key, n: c.reduce((s, x) => s + (x.n || 0), 0) })).sort((a, b) => b.n - a.n)[0];
  // Every placeholder works in card.txt and lattice.txt.
  return {
    '{uptime}': since(data.first, data.generated),
    '{since}': fmtMonth(data.first),
    '{repos}': n(data.repos),
    '{stars}': n(data.stars),
    '{followers}': n(data.followers),
    '{contributed}': n(data.contributed),
    '{prs}': n(data.prs),
    '{commits}': n(data.commits),
    '{year}': n(year),
    '{active_days}': n(active.length),
    '{streak}': plural(cur, 'day'),
    '{longest}': plural(best, 'day'),
    '{best_day}': bestDay ? `${data.days[bestDay]} on ${fmtDate(bestDay)}` : '…',
    '{busiest}': busiestWeek?.n ? fmtMonth(busiestWeek.key) : '…',
    '{top_language}': data.topLanguage ?? '…',
    '{updated}': fmtDate(data.generated),
  };
}

// ---------------------------------------------------------------- rows files (card.txt, lattice.txt)
//   ## Title                 section header
//   > text                   a caption line
//   Key: value               a row; Key.Sub works (Languages.Backend)
//   A: x | B: y | C: z       several pairs sharing one row, split evenly
//   (blank line)             a gap
//   # comment                ignored
//   {placeholders} anywhere in a value or caption; they render in aqua because they update.
function segments(text, vars) {
  const out = [];
  for (const part of text.split(/(\{[a-z_]+\})/)) {
    if (!part) continue;
    if (/^\{[a-z_]+\}$/.test(part)) {
      if (!(part in vars)) throw new Error(`unknown placeholder ${part}. Known: ${Object.keys(vars).join(' ')}`);
      out.push({ t: vars[part], live: true });
    } else out.push({ t: part, live: false });
  }
  return out;
}
const len = (segs) => segs.reduce((s, x) => s + x.t.length, 0);

function readRows(file, vars, width) {
  const rows = [];
  read(file).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trimEnd();
    const where = `${file} line ${i + 1}`;
    if (line.startsWith('#') && !line.startsWith('## ')) return;
    if (!line.trim()) { if (rows.length && rows.at(-1).type !== 'gap') rows.push({ type: 'gap' }); return; }
    if (line.startsWith('## ')) { rows.push({ type: 'head', text: line.slice(3).trim() }); return; }
    if (line.startsWith('> ')) { rows.push({ type: 'cap', segs: segments(line.slice(2), vars) }); return; }
    const pairs = line.split(' | ').map((chunk) => {
      const m = chunk.match(/^([^:]+):\s*(.+)$/);
      if (!m) throw new Error(`${where}: expected "Key: value", got "${chunk}"`);
      return { k: m[1].trim(), segs: segments(m[2], vars) };
    });
    const each = pairWidth(width, pairs.length);
    for (const pr of pairs) if (pr.k.length + len(pr.segs) + 5 > each) throw new Error(`${where}: "${pr.k}" is too long for its space (${each - 5} characters for key + value)`);
    rows.push({ type: 'kv', pairs });
  });
  while (rows.at(-1)?.type === 'gap') rows.pop();
  return rows;
}

const pairWidth = (width, count) => Math.floor((width - 3 * (count - 1)) / count);

// ---------------------------------------------------------------- row rendering
const span = (s, fill) => `<tspan fill="${fill}">${esc(s)}</tspan>`;
const keyOf = (p, k) => k.split('.').map((part) => span(part, p.orchid)).join(span('.', p.fog));
const dots = (p, k) => span(' ' + '.'.repeat(Math.max(1, k - 2)) + ' ', p.rule);
const segSpans = (p, segs, base) => segs.map((s) => span(s.t, s.live ? p.aqua : base)).join('');

function rowSpans(p, row, width) {
  if (row.type === 'head') return span(row.text, p.fog) + span(' ' + '─'.repeat(Math.max(1, width - row.text.length - 1)), p.rule);
  if (row.type === 'cap') return segSpans(p, row.segs, p.haze);
  // ". Key: ....... value", each pair padded to its share of the row so the values line up.
  const each = pairWidth(width, row.pairs.length);
  return row.pairs.map((pr, i) => {
    const w = i === row.pairs.length - 1 ? width - (each + 3) * i : each;
    return span(i === 0 ? '. ' : '  ', p.rule) + keyOf(p, pr.k) + span(':', p.fog) + dots(p, w - 3 - pr.k.length - len(pr.segs)) + segSpans(p, pr.segs, p.fog);
  }).join(span(' | ', p.rule));
}

function rowsSvg(p, rows, x, y0, width) {
  return rows.map((r, i) => (r.type === 'gap' ? '' :
    `<text x="${x}" y="${(y0 + (i + 0.78) * LH).toFixed(1)}" xml:space="preserve">${rowSpans(p, r, width)}</text>`)).join('\n');
}
const plainText = (rows) => rows.map((r) => (r.type === 'head' ? r.text : r.type === 'cap' ? r.segs.map((s) => s.t).join('')
  : r.type === 'kv' ? r.pairs.map((pr) => `${pr.k}: ${pr.segs.map((s) => s.t).join('')}`).join('; ') : '')).filter(Boolean).join('. ');

// ---------------------------------------------------------------- shared layout
// Both images share one width so they stack as a pair. CW is a 0.6em mono advance: anything
// placed per character (the ASCII mark) uses it; running text just flows in the viewer's mono font.
const FS = 15, CW = 9, LH = 21, PAD = 30;
const ART = 34, GAP = 3, INFO = 58;
const COLS = ART + GAP + INFO;               // characters across the whole width
const W = PAD * 2 + COLS * CW;

// ---------------------------------------------------------------- the mark, as ASCII
// brand/gen.py lemniscate_mark: an infinity (form) whose right loop opens into a rising strand (signal).
function markGeometry() {
  const S = 256, cx = S * 0.44, cy = S * 0.64, a = S * 0.3;
  const pt = (t) => { const s = Math.sin(t), c = Math.cos(t), k = a / (1 + s * s); return [cx + k * c, cy + k * s * c]; };
  const loop = Array.from({ length: 181 }, (_, i) => pt((2 * Math.PI * i) / 180));
  const [rx, ry] = pt(0), top = S * 0.12;
  const strand = Array.from({ length: 61 }, (_, i) => { const t = i / 60; return [rx + S * 0.06 * Math.sin(t * Math.PI * 1.6) * t ** 1.4, ry - (ry - top) * t]; });
  return { loop, strand, tip: strand[60], cy, top, sw: S * 0.072 };
}

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function asciiMark(p, rows) {
  const g = markGeometry();
  // Fit the mark's box (with stroke) into the art column, centred, keeping its true aspect.
  const bx0 = 26, bx1 = 200, by0 = 20, by1 = 202;
  const boxW = ART * CW, boxH = rows * LH;
  const sc = Math.min((boxW - 10) / (bx1 - bx0), (boxH - 20) / (by1 - by0));
  const ox = PAD + (boxW - (bx1 - bx0) * sc) / 2 - bx0 * sc, oy = PAD + (boxH - (by1 - by0) * sc) / 2 - by0 * sc;
  const RAMP = ' .:-=+*#%@';
  const r = g.sw / 2;
  const out = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < ART; col++) {
    // Supersample the cell in mark coordinates; coverage picks the character's density.
    let hit = 0, onStrand = 0, ys = 0, tip = 0;
    const N = 4, M = 8;
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const X = (PAD + (col + (i + 0.5) / N) * CW - ox) / sc, Y = (PAD + (row + (j + 0.5) / M) * LH - oy) / sc;
      if (Math.hypot(X - g.tip[0], Y - g.tip[1]) < g.sw * 0.8) { hit++; tip++; continue; }
      let dl = Infinity, ds = Infinity;
      for (let k = 1; k < g.loop.length; k++) dl = Math.min(dl, segDist(X, Y, g.loop[k - 1], g.loop[k]));
      for (let k = 1; k < g.strand.length; k++) ds = Math.min(ds, segDist(X, Y, g.strand[k - 1], g.strand[k]));
      if (Math.min(dl, ds) < r) { hit++; if (ds < dl) { onStrand++; ys += Y; } }
    }
    if (!hit) continue;
    const cov = hit / (N * M);
    const ch = RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(cov * (RAMP.length - 1))))];
    let fill = p.orchid, cls = '', delay = 0;
    if (tip > hit / 2) { fill = p.aqua; cls = 'tip'; }
    else if (onStrand > hit / 2) {
      // Same gradient as the mark: orchid at the loop, aqua by 70% of the way up.
      const t = Math.min(1, ((g.cy - ys / onStrand) / (g.cy - g.top)) / 0.7);
      fill = mix(p.orchid, p.aqua, Math.max(0, t));
      cls = 'sig'; delay = (1 - t) * 1.2;  // the pulse climbs the strand, root first
    }
    const x = PAD + col * CW, y = PAD + (row + 0.78) * LH;
    out.push(`<text x="${x}" y="${y.toFixed(1)}" fill="${fill}"${cls ? ` class="${cls}" style="animation-delay:${delay.toFixed(2)}s"` : ''}>${esc(ch)}</text>`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- card
function card(theme, data, vars) {
  const p = palette(theme);
  const rows = readRows('card.txt', vars, INFO);
  const H = PAD * 2 + Math.max(rows.length, 12) * LH;
  const css = `text{font-family:${MONO};font-size:${FS}px}
.sig{animation:pulse 3.6s ease-in-out infinite}.tip{animation:blink 3.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.55}25%{opacity:1}50%{opacity:.55}}
@keyframes blink{0%,100%{opacity:1}55%{opacity:.4}}
@media (prefers-reduced-motion:reduce){.sig,.tip{animation:none}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(plainText(rows))}">
<style>${css}</style>
<rect width="${W}" height="${H}" rx="16" fill="${p.abyss}"/>
${asciiMark(p, Math.max(rows.length, 12))}
${rowsSvg(p, rows, PAD + (ART + GAP) * CW, PAD, INFO)}
</svg>`;
}

// ---------------------------------------------------------------- lattice
function lattice(theme, data, vars) {
  const p = palette(theme);
  const rows = readRows('lattice.txt', vars, COLS);
  // A caption row, if it comes first, sits above the strands; everything else goes under the grid.
  const cap = rows[0]?.type === 'cap' ? rows.shift() : null;
  while (rows[0]?.type === 'gap') rows.shift();
  const STEP = 16, X0 = PAD + 8, CAPY = cap ? PAD + 14 : PAD, Y0 = CAPY + 156;
  const GRID_END = Y0 + 6 * STEP;
  const ROWS_Y = GRID_END + 60;
  const H = ROWS_Y + rows.length * LH + PAD - 6;
  const weeks = lastYear(data);
  const max = Math.max(1, ...weeks.flat().map((d) => d.n || 0));
  const out = [];
  // The form: faint rules, nodes sized by that day's contributions.
  for (let w = 0; w < 53; w++) out.push(`<line x1="${X0 + w * STEP}" y1="${Y0}" x2="${X0 + w * STEP}" y2="${GRID_END}" stroke="${p.orchid}" stroke-width="1" opacity=".08"/>`);
  for (let d = 0; d < 7; d++) out.push(`<line x1="${X0}" y1="${Y0 + d * STEP}" x2="${X0 + 52 * STEP}" y2="${Y0 + d * STEP}" stroke="${p.orchid}" stroke-width="1" opacity="${(0.1 + d * 0.02).toFixed(2)}"/>`);
  weeks.forEach((col, w) => col.forEach((d, i) => {
    if (d.n == null) return;
    const k = Math.sqrt(d.n / max);
    out.push(`<circle cx="${X0 + w * STEP}" cy="${Y0 + i * STEP}" r="${(1.4 + 3 * k).toFixed(2)}" fill="${d.n ? p.orchid : p.rule}" opacity="${(d.n ? 0.45 + 0.55 * k : 0.9).toFixed(2)}"/>`);
  }));
  // The signal: the busiest weeks escape upward, height by weekly total. Each strand bends from
  // its root node (a transform, so it stays cheap); different periods keep them out of step.
  // Each strand grows out of its week's biggest node, so the signal visibly comes from the busiest day.
  const totals = weeks.map((col, w) => ({ w, n: col.reduce((s, d) => s + (d.n || 0), 0), peak: col.reduce((b, d, i) => ((d.n || 0) > (col[b].n || 0) ? i : b), 0) }));
  const tmax = Math.max(1, ...totals.map((t) => t.n));
  const top = totals.filter((t) => t.n > 0).sort((a, b) => b.n - a.n).slice(0, 9);
  const rand = rng(1927);
  const defs = [];
  top.forEach((t, j) => {
    const x0 = X0 + t.w * STEP, y0 = Y0 + t.peak * STEP;
    const h = 40 + 96 * Math.sqrt(t.n / tmax);   // tip height above the grid's top row
    const s = { amp: 6 + rand() * 14, drift: -10 + rand() * 30, ph: rand() * 6.28, wig: 0.6 + rand() * 0.7 };
    const pts = Array.from({ length: 41 }, (_, i) => [strandX(x0, i / 40, s), y0 - (y0 - Y0 + h) * (i / 40)]);
    const [ex, ey] = pts[40];
    defs.push(`<linearGradient id="${theme}-s${j}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${ey.toFixed(1)}"><stop offset="0" stop-color="${p.orchid}" stop-opacity=".9"/><stop offset=".55" stop-color="${p.orchid}" stop-opacity=".75"/><stop offset="1" stop-color="${p.aqua}"/></linearGradient>`);
    // Three joints, each swaying on its own clock inside the one below it, so the strand bends
    // instead of pivoting stiffly. Still only rotations (transform), and the root never moves.
    const line = (a, z) => `<path d="M${pts.slice(a, z + 1).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}" fill="none" stroke="url(#${theme}-s${j})" stroke-width="1.8" stroke-linecap="round"/>`;
    const joint = ([x, y], deg, inner) => {
      const dur = (2.6 + rand() * 2.2).toFixed(2), delay = (-rand() * 4).toFixed(2);
      return `<g class="sway" style="transform-origin:${x.toFixed(1)}px ${y.toFixed(1)}px;animation-duration:${dur}s;animation-delay:${delay}s;--a:${deg.toFixed(1)}deg">${inner}</g>`;
    };
    const tip = `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="2.6" fill="${p.aqua}"/>`;
    // Freedom grows with distance from the form: the upper joints swing further.
    out.push(joint(pts[0], 3 + rand() * 3, line(0, 14) + joint(pts[14], 6 + rand() * 5, line(14, 28) + joint(pts[28], 9 + rand() * 7, line(28, 40) + tip)))
      + `<circle cx="${x0}" cy="${y0}" r="${(1.4 + 3 * Math.sqrt((weeks[t.w][t.peak].n || 0) / max)).toFixed(2)}" fill="${p.orchid}"/>`);
  });
  let lastM = -1;
  weeks.forEach((col, w) => {
    const m = new Date(col[0].key + 'T00:00:00Z').getUTCMonth();
    if (m !== lastM && w > 1 && w < 52) out.push(`<text x="${X0 + w * STEP}" y="${GRID_END + 24}" fill="${p.haze}" font-size="11">${new Date(col[0].key + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase()}</text>`);
    lastM = m;
  });
  if (cap) out.push(`<text x="${X0}" y="${CAPY}" font-size="12" xml:space="preserve">${rowSpans(p, cap, COLS)}</text>`);
  out.push(`<g font-size="${FS}">${rowsSvg(p, rows, PAD, ROWS_Y - LH * 0.78 + 4, COLS)}</g>`);

  const css = `text{font-family:${MONO}}
.sway{transform-box:view-box;animation:sway 4s ease-in-out infinite alternate}
@keyframes sway{from{transform:rotate(calc(var(--a) * -1))}to{transform:rotate(var(--a))}}
@media (prefers-reduced-motion:reduce){.sway{animation:none}}`;
  const label = `My contributions over the last year as a lattice; the busiest weeks rise as strands. ${plainText([cap, ...rows].filter(Boolean))}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
<style>${css}</style><defs>${defs.join('')}</defs>
<rect width="${W}" height="${H}" rx="16" fill="${p.abyss}"/>
${out.join('\n')}
</svg>`;
}

// ---------------------------------------------------------------- main
const data = process.argv.includes('--fetch') ? await fetchData() : JSON.parse(read('data.json'));
const vars = facts(data);
if (process.argv.includes('--placeholders')) { for (const [k, v] of Object.entries(vars)) console.log(k.padEnd(16), v); process.exit(0); }
for (const theme of ['dark', 'light']) {
  write(`assets/card-${theme}.svg`, card(theme, data, vars));
  write(`assets/lattice-${theme}.svg`, lattice(theme, data, vars));
}
console.log(`rendered for ${data.generated}: ${data.commits} commits, ${Object.keys(data.days).length} active days`);
