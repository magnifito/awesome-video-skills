import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HyperFramesAdapter } from '../../../../adapters/hyperframes/index.js';
import { escapeHtml } from './_shared.js';
import { ProjectBriefSchema, BrandProfileSchema, ClaimsRegisterSchema, AssetManifestSchema, ScenePlanSchema } from '../../../contracts/src/index.js';

export interface PreviewServerInstance {
  port: number;
  url: string;
  close: () => Promise<void>;
}

export async function startPreviewServer(
  projectDir: string,
  port = 3456,
  host = '127.0.0.1'
): Promise<PreviewServerInstance> {
  const brief = ProjectBriefSchema.parse(JSON.parse(await fs.readFile(path.join(projectDir, 'brief.json'), 'utf-8')));
  const brand = BrandProfileSchema.parse(JSON.parse(await fs.readFile(path.join(projectDir, 'brand.json'), 'utf-8')));
  const claims = ClaimsRegisterSchema.parse(JSON.parse(await fs.readFile(path.join(projectDir, 'claims.json'), 'utf-8')));
  const assets = AssetManifestSchema.parse(JSON.parse(await fs.readFile(path.join(projectDir, 'assets.json'), 'utf-8')));
  const scenePlan = ScenePlanSchema.parse(JSON.parse(await fs.readFile(path.join(projectDir, 'scene-plan.json'), 'utf-8')));

  const adapter = new HyperFramesAdapter();
  const width = brief.formats[0] === '9:16' ? 1080 : 1920;
  const height = brief.formats[0] === '9:16' ? 1920 : 1080;
  const compositionHtml = adapter.generateCompositionHtml(
    { projectDir, brief, brand, claims, assets, scenePlan },
    width,
    height
  );

  const previewUiHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Magnifito Studio Live Preview: ${escapeHtml(brief.project_id)}</title>
  <style>
    body { margin: 0; background: #020617; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; height: 100vh; }
    header { padding: 16px 24px; background: #0f172a; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .badge { background: #38bdf8; color: #020617; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .viewport { flex: 1; display: flex; justify-content: center; align-items: center; padding: 20px; overflow: hidden; }
    iframe { border: 1px solid #334155; border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    footer { padding: 16px 24px; background: #0f172a; border-top: 1px solid #1e293b; display: flex; flex-direction: column; gap: 10px; }
    .controls { display: flex; align-items: center; gap: 16px; }
    input[type=range] { flex: 1; accent-color: #38bdf8; }
    .time-display { font-family: monospace; font-size: 14px; min-width: 80px; }
  </style>
</head>
<body>
  <header>
    <h1>🎬 ${escapeHtml(brief.project_id)} <span class="badge">${escapeHtml(brief.workflow)}</span></h1>
    <div>Renderer: ${escapeHtml(brief.engine)} | Locale: ${escapeHtml(brief.language.toUpperCase())}</div>
  </header>
  <div class="viewport">
    <iframe id="preview-frame" src="/composition" width="${width > height ? 960 : 405}" height="${width > height ? 540 : 720}"></iframe>
  </div>
  <footer>
    <div class="controls">
      <button id="play-btn" style="padding: 6px 16px; border-radius: 6px; background: #38bdf8; border: none; font-weight: bold; cursor: pointer;">Play</button>
      <input id="scrubber" type="range" min="0" max="${brief.duration_seconds}" step="0.1" value="0">
      <span id="time" class="time-display">0.0s / ${brief.duration_seconds}s</span>
    </div>
  </footer>
  <script>
    const scrubber = document.getElementById('scrubber');
    const timeDisplay = document.getElementById('time');
    const iframe = document.getElementById('preview-frame');
    const playBtn = document.getElementById('play-btn');

    let playing = false;
    let timer = null;

    function seek(t) {
      if (iframe.contentWindow && iframe.contentWindow.seek) {
        iframe.contentWindow.seek(t);
      }
      scrubber.value = t;
      timeDisplay.innerText = t.toFixed(1) + 's / ${brief.duration_seconds}s';
    }

    scrubber.addEventListener('input', (e) => {
      seek(parseFloat(e.target.value));
    });

    playBtn.addEventListener('click', () => {
      playing = !playing;
      playBtn.innerText = playing ? 'Pause' : 'Play';
      if (playing) {
        timer = setInterval(() => {
          let cur = parseFloat(scrubber.value) + 0.1;
          if (cur >= ${brief.duration_seconds}) cur = 0;
          seek(cur);
        }, 100);
      } else {
        clearInterval(timer);
      }
    });
  </script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
    if (req.url === '/composition') {
      res.writeHead(200, headers);
      res.end(compositionHtml);
    } else if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, headers);
      res.end(previewUiHtml);
    } else {
      res.writeHead(404, headers);
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    // Bind to loopback only so unreleased client work is not exposed on the local network.
    server.listen(port, host, () => {
      const url = `http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`;
      resolve({
        port,
        url,
        close: () => new Promise<void>(resClose => server.close(() => resClose()))
      });
    });
    server.on('error', reject);
  });
}

