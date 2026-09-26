#!/usr/bin/env node

/**
 * Generates a GitHub-style contribution graph (assets/contributions.svg)
 * from this repository's git history.
 *
 * Usage: npm run contrib-graph
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const WEEKS = 53;
const ROWS = 7;
const LABEL_H = 16;   // month labels on top
const LEFT_W = 26;    // weekday labels on left
const LEGEND_H = 30;  // legend at bottom
const COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function level(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function main() {
  const repoRoot = path.join(__dirname, '..');

  let log;
  try {
    log = execSync('git log --pretty=format:%ad --date=short', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    console.error('Could not read git history:', err.message);
    process.exit(1);
  }

  const counts = new Map();
  for (const line of log.split('\n')) {
    const date = line.trim();
    if (!date) continue;
    counts.set(date, (counts.get(date) || 0) + 1);
  }

  // Grid ends on today (local), starts on the Sunday of the week 52 weeks back
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endRow = end.getDay(); // 0 = Sunday
  const start = new Date(end);
  start.setDate(end.getDate() - (WEEKS - 1) * 7 - endRow);

  const weeks = [];
  const cur = new Date(start);
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let d = 0; d < ROWS; d++) {
      const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      const future = cur > end;
      col.push({ iso, count: future ? -1 : (counts.get(iso) || 0) });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(col);
  }

  const width = LEFT_W + WEEKS * STEP + 8;
  const height = LABEL_H + ROWS * STEP + LEGEND_H;
  const x = (w) => LEFT_W + w * STEP;
  const y = (r) => LABEL_H + r * STEP;

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const activeDays = counts.size;

  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="10">`);
  svg.push(`<rect width="${width}" height="${height}" fill="#ffffff" rx="6"/>`);

  // Month labels (when the 1st of a month falls in a week column)
  let lastMonth = -1;
  weeks.forEach((col, w) => {
    const day1 = new Date(col[0].iso + 'T00:00:00');
    if (day1.getDate() <= 7 && day1.getMonth() !== lastMonth) {
      lastMonth = day1.getMonth();
      svg.push(`<text x="${x(w)}" y="${LABEL_H - 5}" fill="#57606a">${MONTHS[lastMonth]}</text>`);
    }
  });

  // Weekday labels
  [['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([label, row]) => {
    svg.push(`<text x="0" y="${y(row) + CELL - 2}" fill="#57606a">${label}</text>`);
  });

  // Cells
  weeks.forEach((col, w) => {
    col.forEach((cell, r) => {
      if (cell.count < 0) return;
      const fill = COLORS[level(cell.count)];
      const title = cell.count === 0 ? 'No contributions' : `${cell.count} contribution${cell.count === 1 ? '' : 's'} on ${cell.iso}`;
      svg.push(`<rect x="${x(w)}" y="${y(r)}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}"><title>${title}</title></rect>`);
    });
  });

  // Legend
  const ly = LABEL_H + ROWS * STEP + 14;
  const lx = width - 8 - (4 * STEP + 12 + 60);
  svg.push(`<text x="${lx}" y="${ly + CELL - 2}" fill="#57606a">Less</text>`);
  COLORS.forEach((c, i) => {
    svg.push(`<rect x="${lx + 34 + i * STEP}" y="${ly}" width="${CELL}" height="${CELL}" rx="2" fill="${c}"/>`);
  });
  svg.push(`<text x="${lx + 34 + 5 * STEP + 6}" y="${ly + CELL - 2}" fill="#57606a">More</text>`);

  // Stats caption
  svg.push(`<text x="0" y="${ly + CELL - 2}" fill="#57606a">${total} commit${total === 1 ? '' : 's'} from ${activeDays} active day${activeDays === 1 ? '' : 's'}</text>`);

  svg.push('</svg>');

  const outDir = path.join(repoRoot, 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'contributions.svg');
  fs.writeFileSync(outPath, svg.join('\n'));
  console.log(`Wrote ${path.relative(repoRoot, outPath)} (${total} commits, ${activeDays} active days)`);
}

main();
