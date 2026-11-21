// audio.js — every sound is a few oscillators through one WebAudio graph:
// footsteps that tell you where a warden is, a chime for a stolen lantern,
// a sting when the alarm rises, and a short tune for a clean escape.
// No audio files, no network — the graph is built on the first key press.

export class SoundBank {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.lastStepSide = 1;
  }

  /** Create the context on a user gesture; browsers block it before that. */
  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.context.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** A short tone: oscillator type, frequency slide, length, volume. */
  tone(type, from, to, seconds, volume, delay = 0) {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  /** A soft alternating footstep; pitch tells the listener who is walking. */
  footstep(isGuard, distance) {
    if (!this.context) return;
    // Quieter with distance, so footsteps really do tell where a guard is.
    const volume = Math.max(0.02, 0.16 * (1 - distance / 320));
    this.lastStepSide *= -1;
    this.tone('triangle', isGuard ? 150 : 210, isGuard ? 110 : 170, 0.07, volume);
  }

  pebble() {
    this.tone('square', 1400, 900, 0.08, 0.12);
    this.tone('square', 900, 620, 0.1, 0.08, 0.09);
  }

  lantern() {
    this.tone('sine', 660, 660, 0.16, 0.18);
    this.tone('sine', 880, 880, 0.22, 0.18, 0.1);
    this.tone('sine', 1320, 1320, 0.3, 0.1, 0.2);
  }

  alert() {
    this.tone('sawtooth', 220, 440, 0.35, 0.14);
    this.tone('sawtooth', 330, 660, 0.3, 0.1, 0.12);
  }

  caught() {
    this.tone('sawtooth', 320, 90, 0.7, 0.16);
  }

  levelClear() {
    [523, 659, 784, 1047].forEach((note, i) => this.tone('sine', note, note, 0.28, 0.16, i * 0.11));
  }

  click() {
    this.tone('sine', 520, 520, 0.06, 0.1);
  }
}
