/**
 * Builds the static GitHub Pages site into `_site/` from the showcase recipes and the
 * committed videos. Nothing on the page is written by hand per example: titles, captions,
 * prompts and commands all come from `showcase/NN-<slug>/showcase.json`.
 *
 * Usage: tsx site/build.ts [outDir]   (default: _site)
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, SECTIONS, VIDEOS_DIR, listProjects, loadMeta, sectionOf, type Section, type ShowcaseMeta } from '../showcase/lib.js';

const REPO_URL = 'https://github.com/magnifito/awesome-video-skills';
const outDir = path.resolve(REPO_ROOT, process.argv[2] ?? '_site');

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function card(meta: ShowcaseMeta, index: number): string {
  const { width, height, duration_seconds, audio } = meta.expect;
  const folder = `${REPO_URL}/tree/main/showcase/${meta.id}`;
  return `
  <article class="card" id="${esc(meta.id)}">
    <div class="frame" style="aspect-ratio:${width}/${height}">
      <video controls ${audio ? '' : 'muted '}playsinline preload="none" poster="videos/${esc(meta.id)}.jpg">
        <source src="videos/${esc(meta.id)}.mp4" type="video/mp4">
      </video>
    </div>
    <div class="body">
      <p class="eyebrow"><span class="num">${String(index + 1).padStart(2, '0')}</span>${esc(meta.type)}</p>
      <h3>${esc(meta.title)}</h3>
      <p class="caption">${esc(meta.caption)}</p>
      <ul class="facts">
        <li><code>${esc(meta.skill)}</code></li>
        <li>engine <code>${esc(meta.engine)}</code></li>
        <li>${width}×${height} · ${duration_seconds} s · ${audio ? 'sound' : 'silent'}</li>
        ${meta.synthetic_footage ? '<li class="note">synthetic footage</li>' : ''}
      </ul>
      <details>
        <summary>Recreate it</summary>
        <p class="label">Prompt for Claude Code</p>
        <blockquote>${esc(meta.prompt).replace(/\n/g, '<br>')}</blockquote>
        <p class="label">Or one command from the repo root</p>
        <pre><code>npm run showcase -- ${esc(meta.id)}</code></pre>
        <p class="label">The steps it runs, from <a href="${folder}">showcase/${esc(meta.id)}/</a></p>
        <pre><code>${meta.commands.map(esc).join('\n')}</code></pre>
      </details>
    </div>
  </article>`;
}

function section(key: Section, items: ShowcaseMeta[]): string {
  if (!items.length) return '';
  return `<section class="group" id="${key}">
  <h2 class="group-title">${esc(SECTIONS[key].title)} <span>${items.length}</span></h2>
  <p class="group-blurb">${esc(SECTIONS[key].blurb)}</p>
  <main>
${items.map(card).join('\n')}
  </main>
</section>`;
}

function page(metas: ShowcaseMeta[]): string {
  const count = (key: Section) => metas.filter(m => sectionOf(m.id) === key).length;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Magnifito Video Skills</title>
<meta name="description" content="${metas.length} example videos made with the Magnifito video skills for Claude Code, each with the prompt and commands that recreate it.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #f6f3ee; --surface: #ffffff; --ink: #1b1a17; --muted: #615d55; --line: #e3ddd2;
  --accent: #d2452f; --code-bg: #f1ece4;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #121110; --surface: #1c1a18; --ink: #f2eee8; --muted: #a7a196; --line: #2e2b27;
    --accent: #ff7a5c; --code-bg: #26231f; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 Inter, system-ui, sans-serif; }
a { color: var(--accent); }
code, pre { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.86em; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 0 16px; }
header { padding: 72px 0 40px; border-bottom: 1px solid var(--line); }
header .kicker { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; color: var(--muted); margin: 0 0 16px; }
h1 { font-family: Fraunces, Georgia, serif; font-weight: 700; font-size: clamp(40px, 7vw, 84px); line-height: 1; margin: 0 0 20px; letter-spacing: -.02em; }
h1 em { font-style: normal; color: var(--accent); }
.lede { max-width: 640px; font-size: 19px; color: var(--muted); margin: 0 0 28px; }
.install { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.install pre { margin: 0; padding: 12px 16px; background: var(--code-bg); border-radius: 10px; overflow-x: auto; max-width: 100%; }
.install a.btn { display: inline-block; padding: 12px 18px; border-radius: 10px; background: var(--ink); color: var(--bg); text-decoration: none; font-weight: 600; }
.group { padding-top: 48px; }
.group-title { font-family: Fraunces, Georgia, serif; font-size: 36px; margin: 0 0 6px; }
.group-title span { font-size: 18px; color: var(--muted); font-family: Inter, sans-serif; vertical-align: middle; }
.group-blurb { color: var(--muted); margin: 0 0 20px; }
main { padding: 8px 0 40px; display: grid; gap: 28px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
.frame { background: #000; display: flex; justify-content: center; max-height: 520px; }
.frame video { width: 100%; height: 100%; object-fit: contain; display: block; }
.body { padding: 20px 22px 22px; }
.eyebrow { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: .08em; }
.eyebrow .num { color: var(--muted); margin-right: 10px; font-family: "JetBrains Mono", monospace; }
.card h3 { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: 26px; line-height: 1.2; margin: 0 0 8px; }
.caption { margin: 0 0 14px; color: var(--muted); }
.facts { list-style: none; padding: 0; margin: 0 0 14px; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; color: var(--muted); }
.facts code { background: var(--code-bg); padding: 1px 6px; border-radius: 5px; color: var(--ink); }
.facts .note { color: var(--accent); }
details { border-top: 1px solid var(--line); padding-top: 12px; }
summary { cursor: pointer; font-weight: 600; }
.label { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
blockquote { margin: 0; padding: 10px 14px; border-left: 3px solid var(--accent); background: var(--code-bg); border-radius: 0 8px 8px 0; }
pre { margin: 0; padding: 12px 14px; background: var(--code-bg); border-radius: 8px; overflow-x: auto; white-space: pre; }
footer { border-top: 1px solid var(--line); padding: 28px 0 48px; color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <p class="kicker">Claude Code plugin · open source</p>
    <h1>Magnifito <em>Video</em> Skills</h1>
    <p class="lede">${count('main')} video types${count('styles') ? `, ${count('styles')} visual styles` : ''}, one toolkit. Every example below was rendered by the skills from a prompt and a few config files, and each one shows exactly how to recreate it.</p>
    <div class="install">
      <pre><code>/plugin install magnifito-video-skills --marketplace magnifito/awesome-video-skills</code></pre>
      <a class="btn" href="${REPO_URL}">View on GitHub</a>
    </div>
  </div>
</header>
<div class="wrap">
${(Object.keys(SECTIONS) as Section[]).map(key => section(key, metas.filter(m => sectionOf(m.id) === key))).join('\n')}
</div>
<footer>
  <div class="wrap">
    Magnifito is the demo client in these examples. Footage marked synthetic is generated by the recipe; no camera footage is used.
    Third-party fonts, icons and sounds are credited in each example's README. Source: <a href="${REPO_URL}">${REPO_URL.replace('https://', '')}</a>.
  </div>
</footer>
</body>
</html>
`;
}

const metas = listProjects().map(loadMeta);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'videos'), { recursive: true });
for (const meta of metas) {
  for (const ext of ['mp4', 'jpg']) {
    const src = path.join(VIDEOS_DIR, `${meta.id}.${ext}`);
    if (!fs.existsSync(src)) throw new Error(`Missing ${path.relative(REPO_ROOT, src)}; run: npm run showcase -- ${meta.id}`);
    fs.copyFileSync(src, path.join(outDir, 'videos', `${meta.id}.${ext}`));
  }
}
fs.writeFileSync(path.join(outDir, 'index.html'), page(metas));
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
console.log(`site: ${metas.length} examples written to ${path.relative(REPO_ROOT, outDir) || '.'}`);
