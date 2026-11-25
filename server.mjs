import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8765);
const ROOT = process.cwd();

function streamFile(req, res, filePath, contentType, downloadName = null) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File is still rendering — please check back shortly.');
    return;
  }
  const stat = fs.statSync(filePath);
  const headers = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  if (downloadName) {
    headers['Content-Disposition'] = `attachment; filename="${downloadName}"`;
  }

  const range = req.headers.range;
  if (range && !downloadName) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': chunkSize,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  }
}

function readLastLine(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  return lines[lines.length - 1] || '';
}

function getStatusJson() {
  const f720 = path.join(ROOT, 'pelican_bicycle_720p_60fps.mp4');
  const f1080 = path.join(ROOT, 'pelican_bicycle_60fps.mp4');
  return {
    ready720: fs.existsSync(f720),
    size720MB: fs.existsSync(f720) ? (fs.statSync(f720).size / (1024 * 1024)).toFixed(2) : null,
    ready1080: fs.existsSync(f1080),
    size1080MB: fs.existsSync(f1080) ? (fs.statSync(f1080).size / (1024 * 1024)).toFixed(2) : null,
    progress720: readLastLine(path.join(ROOT, '.verify', 'render_720p.log')),
    progress1080: readLastLine(path.join(ROOT, '.verify', 'render_1080p.log')),
  };
}

function renderPlayerHubHtml() {
  const st = getStatusJson();
  const hasAnyVideo = st.ready1080 || st.ready720;
  const activeVideo = st.ready1080 ? '/video/1080p' : '/video/720p';
  const activeLabel = st.ready1080
    ? 'Native 1920×1080 · 60fps Master'
    : st.ready720
      ? '1280×720 HD · 60fps Master'
      : 'Rendering 720p60 Master…';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>A Pelican Riding a Bicycle — 60fps Video Download &amp; Interactive 3D</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100dvh;
    background: radial-gradient(circle at 50% 0%, #241d17 0%, #12100e 70%);
    color: #fbf7f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    gap: 20px;
  }
  .shell {
    width: min(980px, 100%);
    background: rgba(25, 21, 18, 0.72);
    border: 1px solid rgba(255, 244, 224, 0.14);
    border-radius: 22px;
    padding: 20px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }
  h1 {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #fff6e8;
  }
  .badge {
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(255, 240, 216, 0.10);
    border: 1px solid rgba(255, 240, 216, 0.16);
    color: #f4dcc0;
  }
  video, .rendering-box {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 14px;
    background: #0a0908;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
  }
  .rendering-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 24px;
    text-align: center;
    border: 1px solid rgba(255, 244, 224, 0.12);
  }
  .rendering-box p { font-size: 14px; color: rgba(255, 246, 232, 0.85); max-width: 520px; line-height: 1.5; }
  .rendering-box code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: #f4ba76;
    background: rgba(255, 255, 255, 0.06);
    padding: 6px 12px;
    border-radius: 8px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }
  .btn-group { display: flex; flex-wrap: wrap; gap: 10px; }
  a.btn {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 18px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    transition: transform 0.15s ease, filter 0.15s ease;
  }
  a.btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
  a.btn.primary {
    background: linear-gradient(135deg, #c7202a, #e24738);
    color: #fffdf9;
    box-shadow: 0 8px 24px rgba(199, 32, 42, 0.35);
  }
  a.btn.secondary {
    background: rgba(255, 246, 232, 0.12);
    border: 1px solid rgba(255, 246, 232, 0.22);
    color: #fff9f0;
  }
  a.btn.disabled { opacity: 0.55; pointer-events: none; }
  .status { font-size: 12px; color: rgba(255, 243, 224, 0.72); }
</style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <h1>A Pelican Riding a Bicycle</h1>
      <span class="badge">${activeLabel} · Seamless 12s Loop</span>
    </div>
    ${hasAnyVideo
      ? `<video controls autoplay loop playsinline src="${activeVideo}"></video>`
      : `<div class="rendering-box">
          <p>Rendering the fast high-quality <strong>1280×720 60fps MP4</strong> right now. This page updates automatically and unlocks the 1-click download button the moment encoding finishes.</p>
          <code id="render-log">${st.progress720 || 'Initializing WebGL pipeline…'}</code>
          <a class="btn primary" href="/">✦ Launch Interactive 3D Fullscreen Scene Now</a>
        </div>`}
    <div class="actions">
      <div class="btn-group">
        ${st.ready720
          ? `<a class="btn primary" href="/download/720p" download="pelican_bicycle_720p_60fps.mp4">⬇ 1-Click Download 720p 60fps MP4 (${st.size720MB} MB)</a>`
          : `<a class="btn secondary disabled" href="#">⏳ Rendering 720p 60fps MP4…</a>`}
        ${st.ready1080
          ? `<a class="btn primary" href="/download/1080p" download="pelican_bicycle_60fps.mp4">⬇ 1-Click Download Native 1080p 60fps MP4 (${st.size1080MB} MB)</a>`
          : `<a class="btn secondary disabled" href="#">⏳ Native 1080p 60fps Master Queued…</a>`}
        <a class="btn secondary" href="/">✦ Interactive 3D Fullscreen Website</a>
      </div>
      <div class="status" id="live-status">${
        st.ready1080
          ? 'Both 720p60 & Native 1080p60 masters ready!'
          : st.ready720
            ? (st.progress1080 ? '1080p Master: ' + st.progress1080 : 'Starting native 1080p60 master…')
            : (st.progress720 || 'Rendering 720p60…')
      }</div>
    </div>
  </div>
  <script>
    const was720 = ${st.ready720};
    const was1080 = ${st.ready1080};
    if (!was1080) {
      setInterval(async () => {
        try {
          const r = await fetch('/api/status');
          const j = await r.json();
          if ((j.ready720 && !was720) || (j.ready1080 && !was1080)) {
            location.reload();
            return;
          }
          const logEl = document.getElementById('render-log');
          if (logEl && j.progress720) logEl.textContent = j.progress720;
          const stEl = document.getElementById('live-status');
          if (stEl) {
            stEl.textContent = j.ready720
              ? (j.progress1080 ? '1080p Master: ' + j.progress1080 : 'Starting native 1080p60 master…')
              : (j.progress720 || 'Rendering 720p60…');
          }
        } catch {}
      }, 4000);
    }
  </script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/' || urlPath === '/index.html') {
    streamFile(req, res, path.join(ROOT, 'index.html'), 'text/html; charset=utf-8');
  } else if (urlPath === '/player') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderPlayerHubHtml());
  } else if (urlPath === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getStatusJson()));
  } else if (urlPath === '/video/720p') {
    streamFile(req, res, path.join(ROOT, 'pelican_bicycle_720p_60fps.mp4'), 'video/mp4');
  } else if (urlPath === '/video/1080p') {
    streamFile(req, res, path.join(ROOT, 'pelican_bicycle_60fps.mp4'), 'video/mp4');
  } else if (urlPath === '/download/720p') {
    streamFile(req, res, path.join(ROOT, 'pelican_bicycle_720p_60fps.mp4'), 'video/mp4', 'pelican_bicycle_720p_60fps.mp4');
  } else if (urlPath === '/download/1080p') {
    streamFile(req, res, path.join(ROOT, 'pelican_bicycle_60fps.mp4'), 'video/mp4', 'pelican_bicycle_60fps.mp4');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pelican Cinema Server running at http://localhost:${PORT}`);
});
