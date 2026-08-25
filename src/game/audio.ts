/* Tiny procedural WebAudio kit — every SFX is synthesized, no assets. */

export class SoundKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.45;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 1);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.45, this.ctx.currentTime, 0.02);
    }
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number) {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(Math.max(60, f0), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.03);
  }

  private tone(
    type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0,
  ) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  thwip() { this.noise(0.14, 'bandpass', 3400, 900, 0.5); this.tone('square', 1500, 320, 0.08, 0.1); }
  pfft() { this.noise(0.09, 'highpass', 1400, 700, 0.14); }
  whoosh() { this.noise(0.26, 'lowpass', 1000, 240, 0.32); }
  swingTick() { this.noise(0.12, 'bandpass', 700, 1700, 0.16); }
  ding(step: number) {
    const f = 620 * Math.pow(1.0594631, Math.min(step, 14));
    this.tone('triangle', f, f, 0.16, 0.26);
    this.tone('triangle', f * 1.5, f * 1.5, 0.2, 0.12, 0.035);
  }
  gold() { [880, 1108, 1318, 1760].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.22, i * 0.06)); }
  thud() { this.tone('sine', 150, 55, 0.15, 0.42); this.noise(0.07, 'lowpass', 500, 180, 0.2); }
  hurt() { this.tone('sawtooth', 240, 70, 0.28, 0.3); this.noise(0.2, 'lowpass', 1300, 300, 0.26); }
  boom() { this.tone('sine', 170, 28, 0.6, 0.65); this.noise(0.5, 'lowpass', 900, 110, 0.45); }
  fanfare() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.24, i * 0.1)); }
  sadTune() { [392, 311, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.3, 0.16, i * 0.15)); }
  click() { this.tone('square', 900, 620, 0.05, 0.12); }
  count() { this.tone('square', 440, 440, 0.09, 0.16); }
  go() { this.tone('square', 880, 882, 0.22, 0.2); }
}
