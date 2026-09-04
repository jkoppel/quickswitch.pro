// Records one demo video of a simulated user running the Benchmark routine, an adaptive Flick drill,
// the Bullet-leads drill with the fading lead marker, then the Chase and Dodge drills.
// Usage: node demo/record.mjs [url]   (STEP_SECONDS shortens benchmark steps; default 15)
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { installProbe, readState, playStep, waitScreen } from './bot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:8765/';
const STEP_SECONDS = Number(process.env.STEP_SECONDS || 15);

function loadChromium() {
  try { return createRequire(import.meta.url)('playwright').chromium; } catch (e) { /* fall through */ }
  const base = join(homedir(), '.vscode/extensions');
  const dirs = readdirSync(base).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
  return createRequire(join(base, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}
const chromium = loadChromium();
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await installProbe(page);
// Shorten steps for the demo.
await page.evaluate((sec) => {
  const s = document.createElement('script');
  s.textContent = `for (const sc of Object.values(ST.SCENARIOS)) sc.settings.duration = ${sec}; for (const r of ST.ROUTINES) { r.rest = 4; for (const st of r.steps) if (typeof st === 'object' && st.settings) st.settings.duration = ${sec}; }`;
  document.body.appendChild(s);
}, STEP_SECONDS);

// Browse the menu a little.
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /^Daily 15/ }).click(); await page.waitForTimeout(900);
await page.getByRole('button', { name: /^Benchmark/ }).click(); await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Start' }).click();
for (let i = 0; i < 12; i++) {
  await waitScreen(page, 'game', 10000);
  await playStep(page, { movement: 'auto', ...(i >= 4 && i <= 5 ? { trackLag: 0.5 } : {}) });
  if ((await readState(page)).screen === 'results') break;
}
await waitScreen(page, 'results', 15000);
await page.waitForTimeout(1500);
// Hover the direction rose and the table.
const rose = await page.locator('#rose').boundingBox();
if (rose) { for (const [fx, fy] of [[0.5, 0.25], [0.75, 0.5], [0.5, 0.78], [0.25, 0.5]]) { await page.mouse.move(rose.x + rose.width * fx, rose.y + rose.height * fy); await page.waitForTimeout(700); } }
await page.waitForTimeout(1500);

// Adaptive Flick drill.
await page.getByRole('button', { name: 'Menu' }).click(); await page.waitForTimeout(1200);
await page.getByRole('button', { name: /^Flick/ }).click(); await page.waitForTimeout(800);
await page.locator('#f-duration').fill(String(STEP_SECONDS + 10));
await page.getByRole('button', { name: 'Start' }).click();
await waitScreen(page, 'game'); await playStep(page, { noise: 0.45 });
await waitScreen(page, 'results'); await page.waitForTimeout(3000);

// Bullet leads with the fading lead marker (Sniper drill, 4x).
await page.getByRole('button', { name: 'Menu' }).click(); await page.waitForTimeout(800);
await page.getByRole('button', { name: /^Sniper Leads/ }).click(); await page.waitForTimeout(800);
await page.locator('#f-duration').fill(String(STEP_SECONDS + 10));
await page.locator('#f-scope').selectOption('4x');
if (!(await page.locator('#advanced').evaluate(d => d.open))) await page.locator('#advanced summary').click();
await page.waitForTimeout(300);
await page.locator('#f-mind').fill('18'); await page.locator('#f-maxd').fill('32');
await page.getByRole('button', { name: 'Start' }).click();
await waitScreen(page, 'game'); await playStep(page, { leadSkill: 0.7, reaction: [0.25, 0.4] });
await waitScreen(page, 'results'); await page.waitForTimeout(3000);

// Chase: run after a fleeing enemy while shooting; Dodge: juke a hard bot that shoots back.
for (const name of [/^Chase/, /^Dodge/]) {
  await page.getByRole('button', { name: 'Menu' }).click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name }).click(); await page.waitForTimeout(1000);
  await page.locator('#f-duration').fill(String(STEP_SECONDS + 15));
  await page.getByRole('button', { name: 'Start' }).click();
  await waitScreen(page, 'game'); await playStep(page, { movement: 'auto' });
  await waitScreen(page, 'results'); await page.waitForTimeout(3500);
}

// Back to the menu to show the trend chart with the runs just recorded, and hover it.
await page.getByRole('button', { name: 'Menu' }).click(); await page.waitForTimeout(600);
await page.getByRole('button', { name: /^Benchmark/ }).click(); await page.waitForTimeout(800);
const trend = await page.locator('#trend').boundingBox();
if (trend) { await page.mouse.move(trend.x + trend.width * 0.5, trend.y + trend.height * 0.5); await page.waitForTimeout(1500); }
await page.waitForTimeout(1000);

const video = page.video();
await ctx.close();
const webm = await video.path();
await browser.close();
const mp4 = join(here, 'surviv-trainer-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', mp4]);
renameSync(webm, join(here, 'surviv-trainer-demo.webm'));
console.log(JSON.stringify({ mp4, errors }, null, 2));
