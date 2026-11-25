/**
 * Gentle Procedural Web Audio Mediterranean Morning Soundscape:
 * - Subtle warm low-passed tire rumble rolling over cobblestones
 * - Soft mechanical bicycle freewheel / chain ratchet ticks
 * - Faint warm village morning breeze
 * - Cheerful distant Provençal songbird chirps
 * Starts cleanly on user gesture, with mute toggle and pause awareness.
 */
export function createSoundscape() {
  let ctx = null;
  let masterGain = null;
  let rumbleGain = null;
  let breezeGain = null;
  let isMuted = false;
  let isStarted = false;
  let isPlaying = true;
  let lastTickTime = 0;
  let nextBirdTime = 0;

  function makeNoiseBuffer(audioCtx, seconds = 3) {
    const len = audioCtx.sampleRate * seconds;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    // Pink-ish warm noise via Paul Kellet filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }
    return buf;
  }

  function start() {
    if (isStarted) {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = isMuted ? 0 : 0.72;
    masterGain.connect(ctx.destination);

    const noiseBuf = makeNoiseBuffer(ctx, 4);

    // 1. Subtle Cobblestone Tire Rumble (warm bandpass around 75-160 Hz + gentle rhythmic modulation)
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = noiseBuf;
    rumbleSrc.loop = true;

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'bandpass';
    rumbleFilter.frequency.value = 118;
    rumbleFilter.Q.value = 1.6;

    const rumbleMod = ctx.createOscillator();
    rumbleMod.frequency.value = 7.2; // cobblestone rolling cadence
    const rumbleModGain = ctx.createGain();
    rumbleModGain.gain.value = 26;
    rumbleMod.connect(rumbleModGain);
    rumbleModGain.connect(rumbleFilter.frequency);
    rumbleMod.start();

    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.22;
    rumbleSrc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleSrc.start();

    // 2. Faint Warm Morning Village Breeze (gentle high-shelved airy wash)
    const breezeSrc = ctx.createBufferSource();
    breezeSrc.buffer = noiseBuf;
    breezeSrc.loop = true;
    const breezeFilter = ctx.createBiquadFilter();
    breezeFilter.type = 'bandpass';
    breezeFilter.frequency.value = 620;
    breezeFilter.Q.value = 0.7;

    breezeGain = ctx.createGain();
    breezeGain.gain.value = 0.065;
    breezeSrc.connect(breezeFilter);
    breezeFilter.connect(breezeGain);
    breezeGain.connect(masterGain);
    breezeSrc.start();

    isStarted = true;
    lastTickTime = ctx.currentTime;
    nextBirdTime = ctx.currentTime + 1.1;
  }

  function triggerFreewheelTick(now) {
    if (!ctx || isMuted || !isPlaying) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 3400 + Math.random() * 500;
    filt.Q.value = 4.2;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2100 + Math.random() * 250, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.012);

    g.gain.setValueAtTime(0.022, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.014);

    osc.connect(filt);
    filt.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.016);
  }

  function triggerMorningBird(now) {
    if (!ctx || isMuted) return;
    // Soft distant Provençal swallow / blackbird 3-note melodic chirp
    const baseFreq = 2600 + Math.random() * 1100;
    const notes = Math.random() > 0.45 ? [0, 0.11, 0.23] : [0, 0.14];
    notes.forEach((off, idx) => {
      const t0 = now + off;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const fStart = baseFreq * (idx === 1 ? 1.18 : 1.0);
      const fEnd = fStart * (idx % 2 === 0 ? 1.24 : 0.86);
      osc.frequency.setValueAtTime(fStart, t0);
      osc.frequency.exponentialRampToValueAtTime(fEnd, t0 + 0.085);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.018, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.095);

      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.11);
    });
  }

  function update(playing) {
    isPlaying = playing;
    if (!isStarted || !ctx) return;

    const now = ctx.currentTime;
    const targetRumble = playing ? 0.22 : 0.0;
    rumbleGain.gain.setTargetAtTime(targetRumble, now, 0.08);
    breezeGain.gain.setTargetAtTime(0.065 + Math.sin(now * 0.45) * 0.02, now, 0.2);

    // Subtle soft freewheel pawl ticks while gliding/pedaling
    if (playing && now - lastTickTime > 0.095) {
      triggerFreewheelTick(now);
      lastTickTime = now;
    }

    // Occasional distant morning birdsong
    if (now >= nextBirdTime) {
      triggerMorningBird(now);
      nextBirdTime = now + 2.4 + Math.random() * 3.2;
    }
  }

  function setMuted(muted) {
    isMuted = muted;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.72, ctx.currentTime, 0.06);
    }
  }

  return {
    start,
    update,
    setMuted,
    get isMuted() { return isMuted; },
    get isStarted() { return isStarted; },
  };
}
