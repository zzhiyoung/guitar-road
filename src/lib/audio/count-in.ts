/** One measure scheduled on the WebAudio clock, with cancellation of queued beats. */
export class CountIn {
  private context: AudioContext | null = null;
  private nodes: OscillatorNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private epoch = 0;

  async start(options: { bpm: number; numerator: number; denominator: number; volume: number }, done: () => void) {
    this.cancel();
    const epoch = this.epoch;
    const ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctor) { done(); return; }
    try {
      const context = this.context ??= new ctor();
      if (context.state === "suspended") await context.resume();
      if (epoch !== this.epoch) return;
      const beatSeconds = 60 / Math.max(1, options.bpm) * 4 / Math.max(1, options.denominator);
      const start = context.currentTime + 0.06;
      for (let beat = 0; beat < options.numerator; beat++) {
        const time = start + beat * beatSeconds;
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.frequency.setValueAtTime(beat === 0 ? 1760 : 1174.7, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.volume * (beat === 0 ? 0.4 : 0.25)), time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        this.nodes.push(oscillator); oscillator.start(time); oscillator.stop(time + 0.07);
      }
      const end = start + options.numerator * beatSeconds;
      this.timer = setInterval(() => {
        if (epoch !== this.epoch) return;
        if (context.currentTime >= end) { this.cancel(); done(); }
      }, 10);
    } catch {
      if (epoch === this.epoch) { this.cancel(); done(); }
    }
  }

  cancel() {
    this.epoch++;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const node of this.nodes) { try { node.stop(); node.disconnect(); } catch {} }
    this.nodes = [];
  }

  dispose() { this.cancel(); void this.context?.close().catch(() => {}); this.context = null; }
}
