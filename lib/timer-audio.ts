// Synthesised beeps via the Web Audio API — no audio files needed.
// This is a faithful port of the prototype's audio system, which went
// through extensive debugging to get right. Do not simplify any of
// this without understanding why each piece exists:
//
// - unlockAudio() must be called synchronously inside a real user
//   click/tap handler, never inside setInterval/setTimeout — browsers
//   require a direct user gesture to allow audio playback.
// - The keep-alive oscillator (startKeepAlive) is necessary because
//   iOS/Safari silently re-suspends the AudioContext during idle gaps
//   between sounds; a persistent near-silent (20Hz, sub-audible) tone
//   keeps the context "running" continuously from Start to Stop.
// - Volumes were deliberately raised from their original values after
//   testing showed the original levels were too quiet on phone
//   speakers in a noisy gym environment.

let _audioCtx: AudioContext | null = null;
let _audioUnlocked = false;

function getAudioCtx(): AudioContext | null {
  if (!_audioCtx) {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      _audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return _audioCtx;
}

let _keepAliveOsc: OscillatorNode | null = null;

function startKeepAlive() {
  const ctx = getAudioCtx();
  if (!ctx || _keepAliveOsc) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001; // effectively silent, keeps context "running"
    osc.frequency.value = 20; // sub-audible
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    _keepAliveOsc = osc;
  } catch {
    // ignore
  }
}

export function stopKeepAlive() {
  if (_keepAliveOsc) {
    try {
      _keepAliveOsc.stop();
    } catch {
      // ignore
    }
    _keepAliveOsc = null;
  }
}

// Must be called directly inside a click handler, not inside
// setInterval/setTimeout.
export function unlockAudio() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const finishUnlock = () => {
    _audioUnlocked = true;
    startKeepAlive();
  };
  if (ctx.state === "suspended") {
    ctx.resume().then(finishUnlock).catch(() => {});
  } else {
    finishUnlock();
  }
}

let _soundMuted = false;
export function setSoundMuted(muted: boolean) {
  _soundMuted = muted;
}

function doPlayBeep(ctx: AudioContext, freq: number, durationMs: number, volume: number, type: OscillatorType) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  } catch {
    // ignore
  }
}

function playBeep(freq = 880, durationMs = 120, volume = 0.25, type: OscillatorType = "sine") {
  if (_soundMuted) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "running") {
    doPlayBeep(ctx, freq, durationMs, volume, type);
  } else {
    // Context not running yet (shouldn't happen once keep-alive is
    // active, but covers the case where a beep fires before unlock
    // completes).
    ctx.resume().then(() => doPlayBeep(ctx, freq, durationMs, volume, type)).catch(() => {});
  }
}

// Short tick beep for 3-2-1 countdown
export function playCountdownBeep() {
  playBeep(660, 110, 0.55, "sine");
}

// Single clear "ding" when a phase changes (work starts or rest starts)
export function playDing() {
  playBeep(988, 320, 0.7, "triangle");
}

// Triple rising beep for session complete
export function playDoneBeep() {
  playBeep(880, 180, 0.65, "sine");
  setTimeout(() => playBeep(1100, 180, 0.65, "sine"), 180);
  setTimeout(() => playBeep(1320, 280, 0.7, "sine"), 360);
}
