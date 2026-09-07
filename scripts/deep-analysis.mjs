// Deep project analysis, run by CI (.github/workflows/deep-analysis.yml).
//
// Given an analysis-requests/<folder>.json file ({ folder, repositoryUrl,
// pullRequestUrl?, requestedAt }), this:
//   1. clones the linked repository and reads it deeply (README + source),
//   2. boots the app (docker compose / Dockerfile / npm / python heuristics),
//   3. crawls it with a real browser, screenshotting every page and
//      inventorying every interactive control,
//   4. asks the model for a thorough per-page, per-CTA documentation,
//   5. renders a typeset PDF report (HTML printed via the browser engine),
//   6. commits the real screenshots + report into the project's artifacts and
//      removes the request file. The caller workflow pushes and redeploys.
//
// Env: ANTHROPIC_API_KEY (required), REQUEST_PATH (the request file),
// PROJECTS_ROOT (default src/content/projects; the vault workflow passes
// 'projects'), ANTHROPIC_BASE_URL (tests point this at a mock),
// APP_URL (skip booting and analyze an already-running app — tests).

import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { parse, stringify } from 'yaml';

const exec = promisify(execFile);

const REQUEST_PATH = process.env.REQUEST_PATH ?? '';
const PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? 'src/content/projects';
const MODEL = process.env.ANALYSIS_MODEL ?? 'claude-sonnet-5';
const WORKDIR = path.join(os.tmpdir(), 'workbench-deep-analysis');

const log = (...parts) => console.log('[deep-analysis]', ...parts);

function fail(message) {
  // leave the request file in place with the failure recorded, so the site
  // can show what happened and offer a retry
  try {
    const request = JSON.parse(readFileSync(REQUEST_PATH, 'utf8'));
    request.status = 'failed';
    request.error = String(message).slice(0, 500);
    request.failedAt = new Date().toISOString();
    writeFileSync(REQUEST_PATH, JSON.stringify(request, null, 2) + '\n');
  } catch { /* the workflow still commits whatever state exists */ }
  console.error('[deep-analysis] FAILED:', message);
  process.exit(0); // exit 0 so the workflow's commit step records the failure
}

// ---------------------------------------------------------------- evidence
const SOURCE_EXT = /\.(m?[jt]sx?|astro|vue|svelte|py|rb|go|rs|java|cs|php|html|css|scss|yml|yaml|toml|json|md)$/i;
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|coverage|__pycache__|\.venv|venv|vendor)(\/|$)/;

function collectSource(repoDir, budget = 160_000) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(repoDir, full).replaceAll('\\', '/');
      if (SKIP_DIR.test(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXT.test(entry.name) && statSync(full).size < 200_000) files.push(rel);
    }
  };
  walk(repoDir);

  const score = (p) => {
    const name = p.toLowerCase();
    let s = 0;
    if (/^readme/i.test(name)) s += 100;
    if (/(^|\/)(app|main|index|server|routes?|views?|pages?)\./.test(name)) s += 20;
    if (/(^|\/)(src|web|app|lib)\//.test(name)) s += 8;
    if (/\.(html|astro|vue|svelte|jsx|tsx)$/.test(name)) s += 10;
    if (/\.(py|js|ts|rb|go)$/.test(name)) s += 6;
    if (/\.(css|scss)$/.test(name)) s += 3;
    if (/package\.json|requirements\.txt|dockerfile|docker-compose/i.test(name)) s += 15;
    if (/\.(test|spec)\.|(^|\/)tests?\//.test(name)) s -= 10;
    if (/lock|\.map$/.test(name)) s -= 100;
    return s;
  };
  files.sort((a, b) => score(b) - score(a));

  const parts = [`## File tree\n${files.slice(0, 400).join('\n')}`];
  let used = parts[0].length;
  for (const rel of files) {
    if (used >= budget) break;
    const text = readFileSync(path.join(repoDir, rel), 'utf8');
    const cap = /^readme/i.test(rel) ? 20_000 : 6_000;
    const chunk = `## ${rel}\n${text.slice(0, Math.min(cap, budget - used))}`;
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------- app boot
async function waitForHttp(urls, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status < 500) return url;
      } catch { /* not up yet */ }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

const CANDIDATE_PORTS = [3000, 4321, 5000, 5173, 8000, 8080, 8501, 4000];

async function bootApp(repoDir) {
  if (process.env.APP_URL) return { url: process.env.APP_URL, how: 'preexisting' };
  const candidates = CANDIDATE_PORTS.map((p) => `http://localhost:${p}/`);

  if (existsSync(path.join(repoDir, 'docker-compose.yml')) || existsSync(path.join(repoDir, 'compose.yml'))) {
    log('booting via docker compose');
    await exec('docker', ['compose', 'up', '-d', '--build'], { cwd: repoDir, timeout: 600_000 });
    const url = await waitForHttp(candidates, 120_000);
    if (url) return { url, how: 'docker compose' };
  }
  if (existsSync(path.join(repoDir, 'Dockerfile'))) {
    log('booting via Dockerfile');
    const expose = /EXPOSE\s+(\d+)/i.exec(readFileSync(path.join(repoDir, 'Dockerfile'), 'utf8'))?.[1] ?? '8080';
    await exec('docker', ['build', '-t', 'analysis-target', '.'], { cwd: repoDir, timeout: 600_000 });
    await exec('docker', ['run', '-d', '--name', 'analysis-target', '-p', `${expose}:${expose}`, 'analysis-target'], { timeout: 120_000 });
    const url = await waitForHttp([`http://localhost:${expose}/`, ...candidates], 90_000);
    if (url) return { url, how: 'docker' };
  }
  if (existsSync(path.join(repoDir, 'package.json'))) {
    log('booting via npm');
    const pkg = JSON.parse(readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
    const script = ['dev', 'start', 'preview'].find((s) => pkg.scripts?.[s]);
    if (script) {
      await exec('npm', ['ci', '--no-audit', '--no-fund'], { cwd: repoDir, timeout: 600_000, shell: process.platform === 'win32' });
      spawn('npm', ['run', script], { cwd: repoDir, detached: true, stdio: 'ignore', shell: true }).unref();
      const url = await waitForHttp(candidates, 120_000);
      if (url) return { url, how: `npm run ${script}` };
    }
  }
  if (existsSync(path.join(repoDir, 'requirements.txt'))) {
    log('booting via python');
    await exec('pip', ['install', '-r', 'requirements.txt'], { cwd: repoDir, timeout: 600_000 });
    const entry = ['app.py', 'main.py', 'web/app.py', 'src/app.py'].find((f) => existsSync(path.join(repoDir, f)));
    if (entry) {
      spawn('python', [entry], { cwd: repoDir, detached: true, stdio: 'ignore' }).unref();
      const url = await waitForHttp(candidates, 90_000);
      if (url) return { url, how: `python ${entry}` };
    }
  }
  return null;
}

// ---------------------------------------------------------------- crawling
const launchBrowser = async () => {
  // CI uses the downloaded Chromium; local testing can point at a system browser
  const { chromium } = await import(process.env.PLAYWRIGHT_PKG ?? 'playwright');
  return chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
};

async function crawlApp(baseUrl, outDir) {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const origin = new URL(baseUrl).origin;
  const seen = new Set();
  const queue = [baseUrl];
  const pages = [];

  while (queue.length && pages.length < 8) {
    const url = queue.shift();
    const key = new URL(url).pathname.replace(/\/$/, '') || '/';
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch {
      continue;
    }
    await page.waitForTimeout(1200);
    const slug = key === '/' ? 'home' : key.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    const shot = `page-${slug}.png`;
    await page.screenshot({ path: path.join(outDir, shot), fullPage: true });

    const info = await page.evaluate(() => {
      const label = (el) =>
        (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '')
          .trim().replace(/\s+/g, ' ').slice(0, 90);
      const controls = [];
      document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], summary').forEach((el) => {
        if (!(el instanceof HTMLElement) || el.offsetParent === null) return;
        const text = label(el);
        if (!text && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
        controls.push(`${el.tagName.toLowerCase()}${el.getAttribute('type') ? `[${el.getAttribute('type')}]` : ''}: ${text || '(unlabeled field)'}`);
      });
      const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
      return { title: document.title, heading: document.querySelector('h1,h2')?.textContent?.trim() ?? '', controls: [...new Set(controls)].slice(0, 40), links };
    });

    for (const link of info.links) {
      try {
        const u = new URL(link);
        // only same-origin HTML pages — never raw assets (artifact images, PDFs, downloads)
        if (u.origin !== origin || u.hash) continue;
        if (/\.(png|jpe?g|gif|webp|svg|ico|pdf|mp4|webm|mov|zip|txt|csv|json|xml|css|js|mjs|map|woff2?)$/i.test(u.pathname)) continue;
        if (!seen.has(u.pathname.replace(/\/$/, '') || '/')) queue.push(u.href);
      } catch { /* not a URL */ }
    }
    pages.push({ path: key, screenshot: shot, title: info.title, heading: info.heading, controls: info.controls });
    log('crawled', key, `(${info.controls.length} controls)`);
  }
  await browser.close();
  return pages;
}

// ---------------------------------------------------------------- analysis
const ANALYSIS_SYSTEM = `You are a senior software engineer writing deep, accurate documentation of an application from its source code, README, and a live crawl of its pages.

Be thorough and specific. Trace behavior to the actual code (handlers, routes, functions) — never guess. When something cannot be determined from the evidence, say "not determinable from the source" instead of inventing.

Reply EXACTLY in this format (no markdown fences):

OVERVIEW:
<3-5 paragraphs: what the app is, who it is for, how it works end to end>
ARCHITECTURE:
<2-4 paragraphs: the stack, the main modules, how data flows>
=== PAGE: <page path exactly as given>
PURPOSE: <one or two sentences>
WALKTHROUGH:
<a paragraph walking a user through this page>
CTAS:
- <control label> :: <what it does, traced to the code — name the handler/route when identifiable>
- <one line per interactive control worth documenting>
=== END PAGE

Repeat the PAGE block for every crawled page, in the order given.`;

async function analyze(evidence, crawl, projectName) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  });
  const crawlText = crawl.length
    ? crawl.map((p) => `## PAGE ${p.path}\ntitle: ${p.title}\nheading: ${p.heading}\ncontrols:\n${p.controls.map((c) => `- ${c}`).join('\n')}`).join('\n\n')
    : '(the app could not be booted — document from the source alone, inferring the pages from the routes/templates; use route paths as PAGE names)';

  // streamed: a thorough reply can take several minutes
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 24_000,
    system: ANALYSIS_SYSTEM,
    messages: [{
      role: 'user',
      content: `Project: ${projectName}\n\nLive crawl of the running app:\n${crawlText}\n\nSource evidence:\n${evidence}`,
    }],
  });
  const response = await stream.finalMessage();
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

function parseAnalysis(text) {
  const overview = /OVERVIEW:\s*\n([\s\S]*?)(?=\nARCHITECTURE:|\n=== PAGE:|$)/.exec(text)?.[1]?.trim() ?? '';
  const architecture = /ARCHITECTURE:\s*\n([\s\S]*?)(?=\n=== PAGE:|$)/.exec(text)?.[1]?.trim() ?? '';
  const pages = [];
  for (const block of text.split(/^=== PAGE:/m).slice(1)) {
    const pagePath = block.split('\n')[0]?.trim() ?? '';
    const purpose = /PURPOSE:\s*([\s\S]*?)(?=\nWALKTHROUGH:|\nCTAS:|\n=== END PAGE|$)/.exec(block)?.[1]?.trim() ?? '';
    const walkthrough = /WALKTHROUGH:\s*\n([\s\S]*?)(?=\nCTAS:|\n=== END PAGE|$)/.exec(block)?.[1]?.trim() ?? '';
    const ctas = (/CTAS:\s*\n([\s\S]*?)(?=\n=== END PAGE|$)/.exec(block)?.[1] ?? '')
      .split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
      .map((l) => { const [label, ...rest] = l.split('::'); return { label: label.trim(), behavior: rest.join('::').trim() }; });
    pages.push({ path: pagePath, purpose, walkthrough, ctas });
  }
  return { overview, architecture, pages };
}

// ---------------------------------------------------------------- report
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const paras = (t) => t.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('');

async function buildPdf(projectName, analysis, crawl, boot, outDir, pdfName) {
  const shotFor = (p) => crawl.find((c) => c.path === p.path)?.screenshot;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font: 11px/1.65 'Segoe UI', system-ui, sans-serif; color: #1c2b24; }
    h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 26px 0 8px; color: #244c3b; border-bottom: 2px solid #cfdccf; padding-bottom: 4px; }
    h3 { font-size: 13px; margin: 18px 0 6px; }
    .sub { color: #6b7a72; margin: 0 0 18px; font-size: 10px; }
    .page-block { page-break-before: always; }
    img.shot { width: 100%; border: 1px solid #cdd1c6; border-radius: 6px; margin: 8px 0 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e5dc; vertical-align: top; }
    th { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #6b7a72; }
    td.label { white-space: nowrap; font-weight: 600; max-width: 150px; overflow-wrap: anywhere; white-space: normal; }
    .footer { color: #9aa69e; font-size: 8.5px; margin-top: 26px; }
  </style></head><body>
    <h1>How ${esc(projectName)} works</h1>
    <p class="sub">Deep analysis generated ${new Date().toISOString().slice(0, 10)} · app ${boot ? `booted via ${esc(boot.how)}; screenshots are real captures` : 'could not be booted; documentation is source-derived'} · model ${esc(MODEL)}</p>
    <h2>Overview</h2>${paras(analysis.overview)}
    <h2>Architecture</h2>${paras(analysis.architecture)}
    ${analysis.pages.map((p) => `
      <div class="page-block">
        <h2>Page: ${esc(p.path)}</h2>
        <p><em>${esc(p.purpose)}</em></p>
        ${shotFor(p) ? `<img class="shot" src="${shotFor(p)}" />` : ''}
        ${p.walkthrough ? `<h3>Walkthrough</h3>${paras(p.walkthrough)}` : ''}
        ${p.ctas.length ? `<h3>Controls</h3><table><tr><th>Control</th><th>What it does</th></tr>${p.ctas.map((c) => `<tr><td class="label">${esc(c.label)}</td><td>${esc(c.behavior)}</td></tr>`).join('')}</table>` : ''}
      </div>`).join('')}
    <p class="footer">Generated by the workbench deep-analysis pipeline from the repository source and a live crawl.</p>
  </body></html>`;
  const htmlPath = path.join(outDir, 'report.html');
  writeFileSync(htmlPath, html);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath.replaceAll('\\', '/')}`, { waitUntil: 'networkidle' });
  await page.pdf({ path: path.join(outDir, pdfName), format: 'A4', printBackground: true });
  await browser.close();
}

// ---------------------------------------------------------------- main
try {
  const request = JSON.parse(readFileSync(REQUEST_PATH, 'utf8'));
  if (request.status === 'failed') { log('request already marked failed — nothing to do'); process.exit(0); }
  const { folder, repositoryUrl } = request;
  const projectDir = path.join(PROJECTS_ROOT, folder);
  if (!existsSync(projectDir)) fail(`project folder ${projectDir} not found`);
  const indexPath = path.join(projectDir, 'index.md');
  const metadata = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(indexPath, 'utf8'))[1]);
  const projectName = metadata.name ?? folder;

  rmSync(WORKDIR, { recursive: true, force: true });
  mkdirSync(WORKDIR, { recursive: true });
  const repoDir = path.join(WORKDIR, 'repo');
  const outDir = path.join(WORKDIR, 'out');
  mkdirSync(outDir, { recursive: true });

  log('cloning', repositoryUrl);
  execFileSync('git', ['clone', '--depth', '50', repositoryUrl, repoDir], { stdio: 'inherit', timeout: 300_000 });

  log('collecting source evidence');
  const evidence = collectSource(repoDir);

  log('booting the app');
  let boot = null;
  let crawl = [];
  try {
    boot = await bootApp(repoDir);
    if (boot) {
      log('app is up at', boot.url, 'via', boot.how);
      crawl = await crawlApp(boot.url, outDir);
    } else {
      log('the app could not be booted — continuing with source-only analysis');
    }
  } catch (error) {
    log('boot/crawl error (continuing source-only):', error.message);
  }

  log('running the deep analysis on', MODEL);
  const raw = await analyze(evidence, crawl, projectName);
  const analysis = parseAnalysis(raw);
  if (!analysis.overview || !analysis.pages.length) fail('the model reply could not be parsed into a report');

  const pdfName = 'how-it-works.pdf';
  log('building the PDF report');
  await buildPdf(projectName, analysis, crawl, boot, outDir, pdfName);

  // ---- write results into the project ----
  const artifactsDir = path.join(projectDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });
  // stale generated files from previous runs are replaced wholesale
  for (const old of readdirSync(artifactsDir)) {
    if (/^page-.*\.png$/.test(old) || /^how-.*\.pdf$/.test(old) || /^ui-.*\.png$/.test(old)) rmSync(path.join(artifactsDir, old));
  }
  const added = [];
  for (const shot of crawl.map((c) => c.screenshot)) {
    copyFileSync(path.join(outDir, shot), path.join(artifactsDir, shot));
    added.push(shot);
  }
  copyFileSync(path.join(outDir, pdfName), path.join(artifactsDir, pdfName));
  added.push(pdfName);

  const source = readFileSync(indexPath, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  const meta = parse(match[1]);
  const survivors = readdirSync(artifactsDir).filter((f) => !f.startsWith('.'));
  const oldOrder = Array.isArray(meta.artifactOrder) ? meta.artifactOrder.filter((n) => survivors.includes(n) && !added.includes(n)) : [];
  meta.artifactOrder = [...oldOrder, ...added];
  if (!meta.featuredArtifact || !survivors.includes(meta.featuredArtifact)) {
    meta.featuredArtifact = added.find((n) => n.endsWith('.png')) ?? meta.artifactOrder[0];
  }
  meta.updatedDate = new Date().toISOString().slice(0, 10);
  const body = source.slice(match[0].length).replace(/^\r?\n/, '');
  writeFileSync(indexPath, `---\n${stringify(meta, { lineWidth: 0 }).trimEnd()}\n---\n${body ? `\n${body}` : ''}`);

  // leave a done marker so a reopened page can announce the finished run;
  // the site clears it once the owner has seen it
  const doneRecord = { ...request, status: 'done', finishedAt: new Date().toISOString(), artifacts: added.length, booted: Boolean(boot) };
  writeFileSync(REQUEST_PATH, JSON.stringify(doneRecord, null, 2) + '\n');
  log(`done: ${added.length} artifacts (${crawl.length} screenshots + report)`);
  try {
    rmSync(WORKDIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
  } catch (error) {
    // the booted app may still hold files open; the runner VM is discarded anyway
    log('workdir cleanup skipped:', error.message);
  }
} catch (error) {
  fail(error.stack ?? error.message);
}
