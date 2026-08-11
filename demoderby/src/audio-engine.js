export class AudioEngine {
  constructor() { this.ctx = null; this.master = null; }
  async unlock() {
    if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.42; this.master.connect(this.ctx.destination); }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }
  hit(power = 0.5) { if (!this.ctx) return; this.noise(0.12 + power * 0.17, 95 + power * 85, 0.42 + power * 0.7); this.tone(48 + power * 34, 0.24, "triangle", 0.18 + power * 0.17, 0.025); this.tone(83 + power * 25, 0.12, "square", 0.07 + power * 0.08, 0.012); }
  wall(power = 0.4) { if (!this.ctx) return; this.tone(55, 0.16, "triangle", 0.12 + power * 0.12, 0.25); }
  wreck() { if (!this.ctx) return; this.noise(0.65, 90, 0.85); this.tone(48, 0.75, "sawtooth", 0.28, 0.4); }
  countdown(number) { if (!this.ctx) return; this.tone(number ? 420 : 760, number ? 0.11 : 0.28, "square", 0.13, 0.15); }
  startRace() { if (!this.ctx) return; this.tone(122, .42, "sawtooth", .2, .025); this.tone(183, .38, "square", .12, .03); this.noise(.18, 240, .18); }
  disappear() { if (!this.ctx) return; const at=this.ctx.currentTime,osc=this.ctx.createOscillator(),amp=this.ctx.createGain();osc.type="sine";osc.frequency.setValueAtTime(420,at);osc.frequency.exponentialRampToValueAtTime(72,at+.48);amp.gain.setValueAtTime(.16,at);amp.gain.exponentialRampToValueAtTime(.0001,at+.5);osc.connect(amp).connect(this.master);osc.start(at);osc.stop(at+.52); }
  fanfare() { if (!this.ctx) return; [0, 0.13, 0.26].forEach((delay, i) => setTimeout(() => this.tone([392, 523, 659][i], 0.32, "square", 0.12, 0.18), delay * 1000)); }
  tone(frequency, duration, type, gain, attack = 0.01) { const at = this.ctx.currentTime, osc = this.ctx.createOscillator(), amp = this.ctx.createGain(); osc.type = type; osc.frequency.value = frequency; amp.gain.setValueAtTime(0.0001, at); amp.gain.exponentialRampToValueAtTime(gain, at + attack); amp.gain.exponentialRampToValueAtTime(0.0001, at + duration); osc.connect(amp).connect(this.master); osc.start(at); osc.stop(at + duration + 0.03); }
  noise(duration, cutoff, gain) { const frames = Math.ceil(this.ctx.sampleRate * duration), buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate), data = buffer.getChannelData(0); for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames); const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), amp = this.ctx.createGain(); filter.type = "lowpass"; filter.frequency.value = cutoff; amp.gain.value = gain; source.buffer = buffer; source.connect(filter).connect(amp).connect(this.master); source.start(); }
}
