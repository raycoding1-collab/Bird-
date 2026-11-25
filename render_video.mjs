import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const FPS = Number(args.fps || 60);
const OUT_FPS = Number(args['out-fps'] || FPS);
const DURATION = Number(args.duration || 12);
const TOTAL_FRAMES = Math.round(FPS * DURATION); // 720 exact frames at 60fps
const WIDTH = Number(args.width || 1920);
const HEIGHT = Number(args.height || 1080);
const SUBFRAMES = Math.max(1, Number(args.subframes || 1));
const SHUTTER_BLEND = args['no-shutter'] ? false : true;
const PRESET = String(args.preset || 'side');
const OUT_MP4 = path.resolve(String(args.out || 'pelican_bicycle_60fps.mp4'));
const TEMP_DIR = path.resolve('.frames');

/**
 * Generates a mathematically seamless 12.0s 48kHz stereo WAV ambient soundscape:
 * - Warm low-frequency cobblestone tire rumble
 * - Soft mechanical vintage bicycle freewheel pawl ticks
 * - Faint Mediterranean morning village breeze
 * - Gentle distant Provençal birdsong chirps
 * Crossfaded cyclically so t=12.0s loops back to t=0.0s with zero click!
 */
function synthesizeSeamlessAmbientWav(wavPath, durationSec = 12.0, sampleRate = 48000) {
  const numSamples = Math.round(durationSec * sampleRate);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  let seed = 20261125;
  function rand() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const extra = sampleRate;
  const rawL = new Float32Array(numSamples + extra);
  const rawR = new Float32Array(numSamples + extra);
  let lpL = 0, lpR = 0, bpL = 0, bpR = 0;
  let brL = 0, brR = 0;

  for (let i = 0; i < numSamples + extra; i++) {
    const t = i / sampleRate;
    const wL = rand() * 2 - 1;
    const wR = rand() * 2 - 1;

    const cobbleMod = 0.72 + 0.28 * Math.sin((t / durationSec) * Math.PI * 2 * 24);
    lpL += 0.016 * (wL - lpL);
    lpR += 0.016 * (wR - lpR);
    bpL += 0.004 * (lpL - bpL);
    bpR += 0.004 * (lpR - bpR);
    const rumbleL = (lpL - bpL) * 0.42 * cobbleMod;
    const rumbleR = (lpR - bpR) * 0.42 * cobbleMod;

    const breezeEnv = 0.75 + 0.25 * Math.sin((t / durationSec) * Math.PI * 2 * 2);
    brL += 0.065 * (wL - brL);
    brR += 0.065 * (wR - brR);
    const breezeL = (brL - lpL) * 0.08 * breezeEnv;
    const breezeR = (brR - lpR) * 0.08 * breezeEnv;

    rawL[i] = rumbleL + breezeL;
    rawR[i] = rumbleR + breezeR;
  }

  for (let i = 0; i < numSamples; i++) {
    left[i] = rawL[i];
    right[i] = rawR[i];
  }
  for (let i = 0; i < extra; i++) {
    const a = i / extra;
    const fadeIn = Math.sin(a * Math.PI * 0.5) ** 2;
    const fadeOut = 1 - fadeIn;
    left[i] = rawL[numSamples + i] * fadeOut + rawL[i] * fadeIn;
    right[i] = rawR[numSamples + i] * fadeOut + rawR[i] * fadeIn;
  }

  const tickCount = 96;
  for (let k = 0; k < tickCount; k++) {
    const t0 = (k / tickCount) * durationSec;
    const startIdx = Math.floor(t0 * sampleRate);
    const tickLen = Math.floor(0.014 * sampleRate);
    const baseF = 2400 + (k % 5) * 90;
    for (let j = 0; j < tickLen; j++) {
      const idx = (startIdx + j) % numSamples;
      const u = j / tickLen;
      const env = Math.exp(-u * 7.5) * Math.sin(u * Math.PI);
      const sig = Math.sin(2 * Math.PI * (baseF * (1 - 0.55 * u)) * (j / sampleRate)) * env * 0.022;
      left[idx] += sig * 0.9;
      right[idx] += sig * 1.1;
    }
  }

  const birdEvents = [
    { t: 1.35, pan: 0.25, f: 3150, notes: [0, 0.12, 0.25] },
    { t: 4.10, pan: 0.78, f: 2820, notes: [0, 0.14] },
    { t: 7.25, pan: 0.35, f: 3420, notes: [0, 0.11, 0.23, 0.36] },
    { t: 10.05, pan: 0.68, f: 2980, notes: [0, 0.13] },
  ];
  for (const ev of birdEvents) {
    ev.notes.forEach((off, ni) => {
      const nStart = Math.floor((ev.t + off) * sampleRate);
      const nLen = Math.floor(0.095 * sampleRate);
      const f0 = ev.f * (ni % 2 === 1 ? 1.18 : 1.0);
      const f1 = f0 * (ni % 2 === 0 ? 1.22 : 0.85);
      let phase = 0;
      for (let j = 0; j < nLen; j++) {
        const idx = (nStart + j) % numSamples;
        const u = j / nLen;
        const freq = f0 + (f1 - f0) * u;
        phase += (2 * Math.PI * freq) / sampleRate;
        const env = Math.sin(u * Math.PI) ** 1.4 * Math.exp(-u * 1.2);
        const s = Math.sin(phase) * env * 0.032;
        left[idx] += s * (1 - ev.pan * 0.6);
        right[idx] += s * (0.4 + ev.pan * 0.6);
      }
    });
  }

  const dataSize = numSamples * 2 * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE(Math.round(l * 32767), off);
    buf.writeInt16LE(Math.round(r * 32767), off + 2);
    off += 4;
  }
  fs.writeFileSync(wavPath, buf);
}

/**
 * Computes PSNR between two raw RGBA buffers of identical dimensions (verifies seamless loop continuity!).
 */
function computeRgbaPSNR(bufA, bufB) {
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < bufA.length; i += 4) {
    const dr = bufA[i] - bufB[i];
    const dg = bufA[i + 1] - bufB[i + 1];
    const db = bufA[i + 2] - bufB[i + 2];
    sumSq += dr * dr + dg * dg + db * db;
    count += 3;
  }
  const mse = sumSq / count;
  if (mse < 1e-9) return 99.99;
  return 10 * Math.log10((255 * 255) / mse);
}

async function renderMasterVideo() {
  const htmlPath = path.resolve('index.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error('index.html not found. Run `node build.mjs` first.');
  }

  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const wavPath = path.join(TEMP_DIR, 'ambient_12s.wav');
  console.log('Synthesizing seamless 12.0s 48kHz stereo ambient audio...');
  synthesizeSeamlessAmbientWav(wavPath, DURATION, 48000);

  const htmlBytes = fs.readFileSync(htmlPath);
  const frameByteLen = WIDTH * HEIGHT * 4;

  const rawMkvPath = path.join(TEMP_DIR, 'lossless_raw.mkv');

  // Stage 1: Zero-CPU-contention ultrafast capture while Chrome/SwiftShader renders frames!
  const capArgs = [
    '-y',
    '-f', 'rawvideo',
    '-pixel_format', 'rgba',
    '-video_size', `${WIDTH}x${HEIGHT}`,
    '-framerate', String(FPS),
    '-i', 'pipe:0',
    '-vf', 'vflip',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '6',
    '-pix_fmt', 'yuv420p',
    rawMkvPath,
  ];

  const useInterp = OUT_FPS > FPS;
  const useCyclicPreroll = !useInterp && SUBFRAMES === 1 && SHUTTER_BLEND;
  const prerollCount = useInterp ? 2 : (useCyclicPreroll ? 1 : 0);
  const postrollCount = useInterp ? 2 : 0;
  const totalStreamFrames = TOTAL_FRAMES + prerollCount + postrollCount;

  console.log(
    `Stage 1: Streaming ${TOTAL_FRAMES} exact ${WIDTH}x${HEIGHT} @ ${FPS}fps frames (output ${OUT_FPS}fps) via raw WebGL pipe...`
  );
  const ff = spawn('ffmpeg', capArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => {
    ffErr += d.toString();
  });

  const ffExitPromise = new Promise((resolve, reject) => {
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg stage 1 exited with code ${code}:\n${ffErr.slice(-1200)}`));
    });
    ff.on('error', reject);
  });

  let frame0Buf = null;
  let frameLastBuf = null;
  let receivedFrames = 0;
  let renderStartWall = 0;

  const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlBytes);
      return;
    }
    if (req.method === 'POST' && req.url.startsWith('/frame/')) {
      const fIdx = Number(req.url.split('/')[2]);
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks);
        if (raw.byteLength !== frameByteLen) {
          res.writeHead(400);
          res.end(`Expected ${frameByteLen} bytes, got ${raw.byteLength}`);
          return;
        }
        if (receivedFrames === 0) renderStartWall = Date.now();
        if (fIdx === 0) frame0Buf = Buffer.from(raw);
        if (fIdx === TOTAL_FRAMES - 1) frameLastBuf = Buffer.from(raw);

        const ok = ff.stdin.write(raw);
        receivedFrames++;
        if (receivedFrames % 24 === 0 || receivedFrames === totalStreamFrames || receivedFrames === 6) {
          const elapsed = Math.max(0.1, (Date.now() - renderStartWall) / 1000);
          const avgSec = elapsed / Math.max(1, receivedFrames - 1);
          const etaMin = ((totalStreamFrames - receivedFrames) * avgSec) / 60;
          console.log(
            `  Frame ${receivedFrames}/${totalStreamFrames} (${((receivedFrames / totalStreamFrames) * 100).toFixed(1)}%) | ${avgSec.toFixed(2)}s/frame | ETA ${etaMin.toFixed(1)}m`
          );
        }

        const finishResp = () => {
          res.writeHead(200);
          res.end('ok');
        };
        if (ok) finishResp();
        else ff.stdin.once('drain', finishResp);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
    ],
  });

  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.goto(`${url}/?capture=1&preset=${PRESET}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__PELICAN_READY__ === true, null, { timeout: 30000 });

    await page.evaluate(
      async ({ totalFrames, fps, subframes, w, h, baseUrl, preCount, postCount }) => {
        const canvas = document.getElementById('webgl-canvas');
        const gl = canvas.getContext('webgl2');
        const px = new Uint8Array(w * h * 4);
        const dt = 1 / fps;

        async function captureAndSend(frameIdx, tag) {
          const wrapped = ((frameIdx % totalFrames) + totalFrames) % totalFrames;
          const t = wrapped / fps;
          window.renderAt(t, { subframes, dt });
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const resp = await fetch(`${baseUrl}/frame/${tag}`, {
            method: 'POST',
            body: px,
          });
          if (!resp.ok) {
            throw new Error(`Frame ${tag} upload failed: ${resp.status}`);
          }
        }

        for (let p = preCount; p >= 1; p--) {
          await captureAndSend(totalFrames - p, -p);
        }
        for (let f = 0; f < totalFrames; f++) {
          await captureAndSend(f, f);
        }
        for (let q = 0; q < postCount; q++) {
          await captureAndSend(q, totalFrames + q);
        }
      },
      {
        totalFrames: TOTAL_FRAMES,
        fps: FPS,
        subframes: SUBFRAMES,
        w: WIDTH,
        h: HEIGHT,
        baseUrl: url,
        preCount: prerollCount,
        postCount: postrollCount,
      }
    );
  } finally {
    await browser.close();
    server.close();
  }

  ff.stdin.end();
  await ffExitPromise;

  // Stage 2: Dedicated ultra-high-quality master encode (libx264 slow CRF 15 + synced ambient stereo audio!)
  const outTotalFrames = Math.round(OUT_FPS * DURATION);
  let masterVf = 'null';
  if (useInterp) {
    // Motion-compensated bidirectional optical-flow interpolation to butter-smooth 60fps + exact cyclic trim!
    const trimStart = Math.round((prerollCount / FPS) * OUT_FPS);
    const trimEnd = trimStart + outTotalFrames - 1;
    masterVf = `minterpolate=fps=${OUT_FPS}:mi_mode=mci:mc_mode=obmc:me_mode=bidir:me=epzs:mb_size=16:search_param=16:vsbmc=1,select='between(n,${trimStart},${trimEnd})',setpts=PTS-STARTPTS`;
  } else if (useCyclicPreroll) {
    masterVf = "tmix=frames=2:weights='0.80 0.20',select='gte(n,1)',setpts=PTS-STARTPTS";
  }

  console.log(`Stage 2: Encoding master MP4 (libx264 -preset slow -crf 15 -pix_fmt yuv420p @ ${OUT_FPS}fps, vf="${masterVf}")...`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i', rawMkvPath,
      '-i', wavPath,
      '-vf', masterVf,
      '-fps_mode', 'cfr',
      '-r', String(OUT_FPS),
      '-frames:v', String(outTotalFrames),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '15',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      OUT_MP4,
    ],
    { stdio: 'inherit' }
  );

  // Verify output MP4 stream properties with ffprobe
  const probe = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration',
      '-of', 'json',
      OUT_MP4,
    ],
    { encoding: 'utf8' }
  );
  console.log('FFprobe video verification:', probe.trim());

  if (frame0Buf && frameLastBuf) {
    const psnr = computeRgbaPSNR(frame0Buf, frameLastBuf);
    console.log(`Seamless loop endpoint check (frame 0 vs frame ${TOTAL_FRAMES - 1}): PSNR = ${psnr.toFixed(2)} dB`);
  }

  const stat = fs.statSync(OUT_MP4);
  console.log(`Master video saved: ${OUT_MP4} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

renderMasterVideo().catch((err) => {
  console.error(err);
  process.exit(1);
});
