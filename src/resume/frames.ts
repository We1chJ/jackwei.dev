// Decodes the reel a group (key frame to key frame) at a time with the hardware video decoder and
// keeps the results as GPU images, decoding ahead in the direction of travel and dropping the
// groups furthest away once a memory budget is reached. Drawing a cached frame is then nearly free.
import { FPS, type Stream } from './stream';

// Decoded frames are big (1080p is 8 MB each), so the cache is sized from the machine's memory
// and the look-ahead is cut to fit: it must never want more groups than it may keep, or it would
// evict groups it is about to need and decode them again.
const memoryGB = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
const BUDGET = memoryGB >= 8 ? 700e6 : memoryGB >= 4 ? 450e6 : 250e6;
const MAX_AHEAD = 6, BEHIND = 1;
const BENCH_FRAMES = 16; // frames timed to judge the decoder's speed, after the first one (warm-up)

export class Frames {
  readonly count: number;
  /** decoded frames per second over the first BENCH_FRAMES, once known */
  decodeFps = 0;
  private readonly keys: number[] = []; // first frame of each group
  private readonly cache = new Map<number, ImageBitmap>();
  private readonly done = new Set<number>(); // groups fully decoded
  private maxGroups = 0; // set from the frame size once the first frame is out
  private ahead = MAX_AHEAD;
  private busy = false;
  private wanted: number[] = [];
  private decoder!: VideoDecoder;
  private closed = false;
  private benchStart = 0;
  private benched = 0;

  constructor(private readonly stream: Stream, private readonly onFrame: (k: number) => void) {
    this.count = stream.units.length;
    stream.units.forEach((u, i) => { if (u.key) this.keys.push(i); });
    this.open();
  }

  static async supported(codec: string) {
    if (typeof VideoDecoder === 'undefined' || !codec) return false;
    try { return !!(await VideoDecoder.isConfigSupported({ codec })).supported; } catch { return false; }
  }

  private open() {
    this.decoder = new VideoDecoder({
      output: (frame) => {
        const k = Math.round((frame.timestamp * FPS) / 1e6);
        if (!this.maxGroups) {
          const perGroup = this.count / this.keys.length;
          const fits = Math.floor(BUDGET / (frame.displayWidth * frame.displayHeight * 4 * perGroup));
          this.maxGroups = Math.max(3, fits);
          this.ahead = Math.max(1, Math.min(MAX_AHEAD, this.maxGroups - BEHIND - 1));
        }
        createImageBitmap(frame).then((bm) => {
          if (this.closed) { bm.close(); return; }
          this.cache.get(k)?.close();
          this.cache.set(k, bm);
          if (!this.decodeFps) {
            if (!this.benchStart) this.benchStart = performance.now(); // the clock starts on the first frame out
            else if (++this.benched === BENCH_FRAMES) this.decodeFps = (BENCH_FRAMES * 1000) / (performance.now() - this.benchStart);
          }
          this.onFrame(k);
        }).finally(() => frame.close());
      },
      error: () => { if (!this.closed) this.open(); }, // reconfigure; the next group starts on a key frame
    });
    this.decoder.configure({ codec: this.stream.codec, hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true });
  }

  private group(k: number) {
    let lo = 0, hi = this.keys.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.keys[m] <= k) lo = m; else hi = m - 1; }
    return lo;
  }

  /** The frame if it is decoded, else the nearest decoded one in the same group. */
  get(k: number): ImageBitmap | undefined {
    const hit = this.cache.get(k);
    if (hit) return hit;
    const g = this.group(k), a = this.keys[g], b = this.keys[g + 1] ?? this.count;
    for (let d = 1; d < b - a; d++) {
      if (k - d >= a && this.cache.has(k - d)) return this.cache.get(k - d);
      if (k + d < b && this.cache.has(k + d)) return this.cache.get(k + d);
    }
    return undefined;
  }

  /** Asks for the groups around frame `k`, ahead in the direction of travel first. */
  want(k: number, dir: number) {
    const g = this.group(k), s = dir < 0 ? -1 : 1;
    const list = [g];
    for (let d = 1; d <= this.ahead; d++) list.push(g + s * d);
    for (let d = 1; d <= BEHIND; d++) list.push(g - s * d);
    this.wanted = list.filter((x) => x >= 0 && x < this.keys.length);
    this.evict(g);
    this.pump();
  }

  private evict(g: number) {
    if (!this.maxGroups) return;
    const groups = [...this.done].sort((a, b) => Math.abs(b - g) - Math.abs(a - g));
    while (groups.length > this.maxGroups) {
      const x = groups.shift()!;
      this.done.delete(x);
      const a = this.keys[x], b = this.keys[x + 1] ?? this.count;
      for (let i = a; i < b; i++) { this.cache.get(i)?.close(); this.cache.delete(i); }
    }
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (;;) {
        const g = this.wanted.find((x) => !this.done.has(x));
        if (g === undefined || this.closed) break;
        const a = this.keys[g], b = this.keys[g + 1] ?? this.count;
        for (let i = a; i < b; i++) {
          const u = this.stream.units[i];
          this.decoder.decode(new EncodedVideoChunk({
            type: i === a ? 'key' : 'delta', timestamp: (i * 1e6) / FPS, data: this.stream.data.subarray(u.start, u.end),
          }));
        }
        this.done.add(g);
        await this.decoder.flush().catch(() => this.done.delete(g));
      }
    } finally {
      this.busy = false;
    }
  }

  close() {
    this.closed = true;
    try { this.decoder.close(); } catch { /* already closed */ }
    this.cache.forEach((bm) => bm.close());
    this.cache.clear();
  }
}
