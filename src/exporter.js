/**
 * Frame-Locked Deterministic 1920x1080 60fps In-Browser Video Exporter.
 * Steps the scene deterministically at exact dt = 1/60s for all 720 frames of the 12.0s loop:
 * - Primary: Zero-dependency WebCodecs H.264 VideoEncoder + built-in ISO BMFF MP4 muxer (zero dropped frames!)
 * - Fallback: Frame-locked captureStream(0) + manual track.requestFrame() pacing into high-bitrate MediaRecorder
 */

// --- Lightweight Zero-Dependency ISO BMFF (MP4) Muxer for Annex-B / AVCC H.264 ---
function writeU32(arr, off, val) {
  arr[off] = (val >>> 24) & 0xff;
  arr[off + 1] = (val >>> 16) & 0xff;
  arr[off + 2] = (val >>> 8) & 0xff;
  arr[off + 3] = val & 0xff;
}

function writeU16(arr, off, val) {
  arr[off] = (val >>> 8) & 0xff;
  arr[off + 1] = val & 0xff;
}

function concatBytes(chunks) {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function box(type, ...payloads) {
  const body = concatBytes(payloads);
  const out = new Uint8Array(8 + body.byteLength);
  writeU32(out, 0, out.byteLength);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out;
}

function fullBox(type, version, flags, ...payloads) {
  const hdr = new Uint8Array(4);
  hdr[0] = version & 0xff;
  hdr[1] = (flags >>> 16) & 0xff;
  hdr[2] = (flags >>> 8) & 0xff;
  hdr[3] = flags & 0xff;
  return box(type, hdr, ...payloads);
}

function buildMp4FromH264Samples(samples, avcCBytes, width, height, fps) {
  const timescale = fps * 1000; // 60000
  const sampleDur = 1000;       // exact 1/60s per frame
  const totalDur = samples.length * sampleDur;

  const ftyp = box(
    'ftyp',
    new Uint8Array([
      0x69, 0x73, 0x6f, 0x6d, // isom
      0x00, 0x00, 0x02, 0x00, // minor_version
      0x69, 0x73, 0x6f, 0x6d, // isom
      0x69, 0x73, 0x6f, 0x32, // iso2
      0x61, 0x76, 0x63, 0x31, // avc1
      0x6d, 0x70, 0x34, 0x31, // mp41
    ])
  );

  // Build mdat payload
  const mdatPayload = concatBytes(samples.map((s) => s.data));
  const mdat = box('mdat', mdatPayload);

  // Build stbl entries
  const sttsBody = new Uint8Array(12);
  writeU32(sttsBody, 0, 1);
  writeU32(sttsBody, 4, samples.length);
  writeU32(sttsBody, 8, sampleDur);
  const stts = fullBox('stts', 0, 0, sttsBody);

  // Sync samples (keyframes)
  const keyIndices = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].isKey) keyIndices.push(i + 1);
  }
  const stssBody = new Uint8Array(4 + keyIndices.length * 4);
  writeU32(stssBody, 0, keyIndices.length);
  for (let i = 0; i < keyIndices.length; i++) writeU32(stssBody, 4 + i * 4, keyIndices[i]);
  const stss = fullBox('stss', 0, 0, stssBody);

  // Sample-to-chunk (1 chunk holds all samples)
  const stscBody = new Uint8Array(16);
  writeU32(stscBody, 0, 1);
  writeU32(stscBody, 4, 1);
  writeU32(stscBody, 8, samples.length);
  writeU32(stscBody, 12, 1);
  const stsc = fullBox('stsc', 0, 0, stscBody);

  // Sample sizes
  const stszBody = new Uint8Array(8 + samples.length * 4);
  writeU32(stszBody, 0, 0);
  writeU32(stszBody, 4, samples.length);
  for (let i = 0; i < samples.length; i++) writeU32(stszBody, 8 + i * 4, samples[i].data.byteLength);
  const stsz = fullBox('stsz', 0, 0, stszBody);

  // Chunk offset (mdat payload starts immediately after ftyp + 8-byte mdat header)
  const mdatDataOffset = ftyp.byteLength + 8;
  const stcoBody = new Uint8Array(8);
  writeU32(stcoBody, 0, 1);
  writeU32(stcoBody, 4, mdatDataOffset);
  const stco = fullBox('stco', 0, 0, stcoBody);

  // avc1 visual sample entry
  const avc1Pre = new Uint8Array(78);
  writeU16(avc1Pre, 6, 1);         // data_reference_index
  writeU16(avc1Pre, 24, width);
  writeU16(avc1Pre, 26, height);
  writeU32(avc1Pre, 28, 0x00480000); // horizresolution 72 dpi
  writeU32(avc1Pre, 32, 0x00480000); // vertresolution 72 dpi
  writeU16(avc1Pre, 40, 1);          // frame_count
  writeU16(avc1Pre, 74, 0x0018);     // depth = 24
  writeU16(avc1Pre, 76, 0xffff);     // pre_defined = -1

  const avcCBox = box('avcC', avcCBytes);
  const avc1 = box('avc1', avc1Pre, avcCBox);
  const stsdCount = new Uint8Array(4);
  writeU32(stsdCount, 0, 1);
  const stsd = fullBox('stsd', 0, 0, stsdCount, avc1);

  const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);

  // dinf -> dref -> url
  const urlBox = fullBox('url ', 0, 1);
  const drefCnt = new Uint8Array(4);
  writeU32(drefCnt, 0, 1);
  const dref = fullBox('dref', 0, 0, drefCnt, urlBox);
  const dinf = box('dinf', dref);

  const vmhd = fullBox('vmhd', 0, 1, new Uint8Array(8));
  const minf = box('minf', vmhd, dinf, stbl);

  // mdhd
  const mdhdBody = new Uint8Array(20);
  writeU32(mdhdBody, 8, timescale);
  writeU32(mdhdBody, 12, totalDur);
  writeU16(mdhdBody, 16, 0x55c4); // und language
  const mdhd = fullBox('mdhd', 0, 0, mdhdBody);

  // hdlr (vide)
  const hdlrBody = new Uint8Array(21);
  hdlrBody[4] = 0x76; hdlrBody[5] = 0x69; hdlrBody[6] = 0x64; hdlrBody[7] = 0x65; // vide
  const hdlr = fullBox('hdlr', 0, 0, hdlrBody);

  const mdia = box('mdia', mdhd, hdlr, minf);

  // tkhd
  const tkhdBody = new Uint8Array(80);
  writeU32(tkhdBody, 8, 1); // track_id
  writeU32(tkhdBody, 16, totalDur);
  // Unity matrix
  writeU32(tkhdBody, 36, 0x00010000);
  writeU32(tkhdBody, 52, 0x00010000);
  writeU32(tkhdBody, 68, 0x40000000);
  writeU32(tkhdBody, 72, width << 16);
  writeU32(tkhdBody, 76, height << 16);
  const tkhd = fullBox('tkhd', 0, 3, tkhdBody);

  const trak = box('trak', tkhd, mdia);

  // mvhd
  const mvhdBody = new Uint8Array(96);
  writeU32(mvhdBody, 8, timescale);
  writeU32(mvhdBody, 12, totalDur);
  writeU32(mvhdBody, 16, 0x00010000); // rate 1.0
  writeU16(mvhdBody, 20, 0x0100);     // volume 1.0
  writeU32(mvhdBody, 32, 0x00010000);
  writeU32(mvhdBody, 48, 0x00010000);
  writeU32(mvhdBody, 64, 0x40000000);
  writeU32(mvhdBody, 92, 2); // next_track_ID
  const mvhd = fullBox('mvhd', 0, 0, mvhdBody);

  const moov = box('moov', mvhd, trak);
  return new Blob([ftyp, mdat, moov], { type: 'video/mp4' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * Deterministic 1920x1080 60fps Video Export over exact 12.0s loop (720 frames).
 */
export async function exportSmooth60fpsVideo({
  canvas,
  renderFrameAt,
  beginExportResolution,
  endExportResolution,
  onProgress,
  durationSec = 12.0,
  fps = 60,
  width = 1920,
  height = 1080,
}) {
  const totalFrames = Math.round(durationSec * fps); // 720 exact frames
  beginExportResolution(width, height);

  try {
    // Path A: Try WebCodecs H.264 VideoEncoder -> pure-JS MP4 muxer (zero frame drops!)
    if (typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function') {
      const codecConfigs = [
        { codec: 'avc1.640028', avc: { format: 'avc' } }, // High Profile Level 4.0 (1080p60)
        { codec: 'avc1.4d002a', avc: { format: 'avc' } }, // Main Profile Level 4.2
        { codec: 'avc1.42002a', avc: { format: 'avc' } }, // Baseline fallback
      ];

      let chosenConfig = null;
      for (const cc of codecConfigs) {
        const cfg = {
          codec: cc.codec,
          width,
          height,
          bitrate: 22_000_000,
          framerate: fps,
          avc: cc.avc,
        };
        try {
          const sup = await VideoEncoder.isConfigSupported(cfg);
          if (sup && sup.supported) {
            chosenConfig = cfg;
            break;
          }
        } catch {
          // Try next profile
        }
      }

      if (chosenConfig) {
        const encodedSamples = [];
        let avcCBytes = null;
        let encodeErr = null;

        const encoder = new VideoEncoder({
          output(chunk, meta) {
            if (!avcCBytes && meta && meta.decoderConfig && meta.decoderConfig.description) {
              const desc = meta.decoderConfig.description;
              avcCBytes = desc instanceof Uint8Array ? new Uint8Array(desc) : new Uint8Array(desc);
            }
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            encodedSamples.push({
              data,
              isKey: chunk.type === 'key',
            });
          },
          error(e) {
            encodeErr = e;
          },
        });
        encoder.configure(chosenConfig);

        for (let f = 0; f < totalFrames; f++) {
          if (encodeErr) throw encodeErr;
          const t = f / fps;
          renderFrameAt(t);

          const timestampUs = Math.round((f * 1_000_000) / fps);
          const durationUs = Math.round(1_000_000 / fps);
          const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs });
          encoder.encode(frame, { keyFrame: f % 60 === 0 });
          frame.close();

          // Prevent encoder queue saturation & keep progress UI responsive
          while (encoder.encodeQueueSize > 8) {
            await new Promise((r) => setTimeout(r, 4));
          }
          if (f % 3 === 0 || f === totalFrames - 1) {
            onProgress(f + 1, totalFrames);
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        await encoder.flush();
        encoder.close();

        if (avcCBytes && encodedSamples.length === totalFrames) {
          const mp4Blob = buildMp4FromH264Samples(encodedSamples, avcCBytes, width, height, fps);
          downloadBlob(mp4Blob, 'pelican_bicycle_60fps.mp4');
          return { format: 'mp4', frames: totalFrames };
        }
      }
    }

    // Path B: Frame-Locked captureStream(0) + manual track.requestFrame() pacing (NEVER real-time screen grab!)
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const mimeCandidates = [
      'video/mp4;codecs=avc1.640028',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 20_000_000,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const donePromise = new Promise((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();
    const frameIntervalMs = 1000 / fps;
    for (let f = 0; f < totalFrames; f++) {
      renderFrameAt(f / fps);
      if (track && typeof track.requestFrame === 'function') {
        track.requestFrame();
      }
      onProgress(f + 1, totalFrames);
      await new Promise((r) => setTimeout(r, frameIntervalMs));
    }

    recorder.stop();
    await donePromise;
    const isMp4 = mimeType.startsWith('video/mp4');
    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
    downloadBlob(blob, isMp4 ? 'pelican_bicycle_60fps.mp4' : 'pelican_bicycle_60fps.webm');
    return { format: isMp4 ? 'mp4' : 'webm', frames: totalFrames };
  } finally {
    endExportResolution();
  }
}
