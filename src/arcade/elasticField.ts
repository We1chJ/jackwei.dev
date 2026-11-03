// The hero name's height field, from its rasterised shape: how far each point is from the edge, how high
// the inflated surface stands there, and which letter it belongs to. Pure maths over arrays, so it runs in a
// worker (elasticField.worker.ts) while the loading screen keeps moving; it is over half a second of work.
// Moved out of ElasticMesh.tsx unchanged.

export type FieldInput = { pixels: Uint8ClampedArray; faces: Uint8ClampedArray | null; fw: number; fh: number; scale: number };
export type FieldPart = { x: number; y: number; left: number; size: number };
export type FieldResult = { field: Float32Array<ArrayBuffer>; slopes: Float32Array<ArrayBuffer>; sdf: Float32Array<ArrayBuffer>; parts: FieldPart[] };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const distance1d = (f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) => {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
};

const distanceField = (grid: Float64Array, width: number, height: number) => {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    distance1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    distance1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[y * width + x] = Math.sqrt(d[x]);
  }
  return grid;
};

const nearestLabels = (labels: Int32Array, width: number, height: number) => {
  const far = 1e20;
  const column = new Float64Array(width * height);
  const site = new Int32Array(width * height);
  for (let x = 0; x < width; x++) {
    let last = -1;
    for (let y = 0; y < height; y++) {
      const i = y * width + x;
      if (labels[i]) last = y;
      site[i] = last;
      column[i] = last >= 0 ? (y - last) * (y - last) : far;
    }
    last = -1;
    for (let y = height - 1; y >= 0; y--) {
      const i = y * width + x;
      if (labels[i]) last = y;
      if (last >= 0 && (last - y) * (last - y) < column[i]) {
        column[i] = (last - y) * (last - y);
        site[i] = last;
      }
    }
  }
  const out = new Float32Array(width * height);
  const f = new Float64Array(width);
  const v = new Int32Array(width);
  const z = new Float64Array(width + 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = column[y * width + x];
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < width; q++) {
      let cut = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (cut <= z[k]) {
        k--;
        cut = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = cut;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let x = 0; x < width; x++) {
      while (z[k + 1] < x) k++;
      const sx = v[k];
      const sy = site[y * width + sx];
      out[y * width + x] = sy >= 0 ? labels[sy * width + sx] : 0;
    }
  }
  return out;
};

const inflateField = (mask: Float32Array, width: number, height: number) => {
  const levels = [{ width, height, mask }];
  while (Math.max(levels[levels.length - 1].width, levels[levels.length - 1].height) > 48) {
    const prev = levels[levels.length - 1];
    const w = Math.ceil(prev.width / 2);
    const h = Math.ceil(prev.height / 2);
    const next = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = x * 2 + dx;
            const sy = y * 2 + dy;
            if (sx < prev.width && sy < prev.height) {
              sum += prev.mask[sy * prev.width + sx];
              count++;
            }
          }
        }
        next[y * w + x] = sum / count;
      }
    }
    levels.push({ width: w, height: h, mask: next });
  }

  let solution: Float32Array | null = null;
  for (let level = levels.length - 1; level >= 0; level--) {
    const { width: w, height: h, mask: m } = levels[level];
    const current = new Float32Array(w * h);
    if (solution) {
      const pw = levels[level + 1].width;
      const ph = levels[level + 1].height;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const fx = clamp((x + 0.5) / 2 - 0.5, 0, pw - 1);
          const fy = clamp((y + 0.5) / 2 - 0.5, 0, ph - 1);
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const x1 = Math.min(pw - 1, x0 + 1);
          const y1 = Math.min(ph - 1, y0 + 1);
          const tx = fx - x0;
          const ty = fy - y0;
          const top = solution[y0 * pw + x0] * (1 - tx) + solution[y0 * pw + x1] * tx;
          const bottom = solution[y1 * pw + x0] * (1 - tx) + solution[y1 * pw + x1] * tx;
          current[y * w + x] = top * (1 - ty) + bottom * ty;
        }
      }
    }
    const source = 4 ** level;
    const iterations = level === levels.length - 1 ? 300 : 60;
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (m[i] < 0.5) {
            current[i] = 0;
            continue;
          }
          const l = x > 0 ? current[i - 1] : 0;
          const r = x < w - 1 ? current[i + 1] : 0;
          const u = y > 0 ? current[i - w] : 0;
          const d = y < h - 1 ? current[i + w] : 0;
          current[i] += ((l + r + u + d + source) * 0.25 - current[i]) * 1.85;
        }
      }
    }
    solution = current;
  }
  return solution as Float32Array;
};

const blurField = (source: ArrayLike<number>, width: number, height: number, radius: number) => {
  const r = Math.max(1, Math.round(radius));
  const sigma = r / 2.5;
  const kernel: number[] = [];
  let total = 0;
  for (let i = -r; i <= r; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(weight);
    total += weight;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= total;
  const temp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += source[y * width + clamp(x + i, 0, width - 1)] * kernel[i + r];
      temp[y * width + x] = sum;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += temp[clamp(y + i, 0, height - 1) * width + x] * kernel[i + r];
      out[y * width + x] = sum;
    }
  }
  return out;
};

export function solveField({ pixels, faces, fw, fh, scale }: FieldInput): FieldResult {
  const count = fw * fh;
  const mask = new Float32Array(count);
  const inside = new Float64Array(count);
  const outside = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = pixels[i * 4 + 3] / 255;
    mask[i] = a;
    inside[i] = a > 0.5 ? 1e10 : 0;
    outside[i] = a > 0.5 ? 0 : 1e10;
  }
  distanceField(inside, fw, fh);
  distanceField(outside, fw, fh);
  const binary = new Float32Array(count);
  const signed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    binary[i] = mask[i] > 0.5 ? 1 : 0;
    signed[i] =
      mask[i] > 0.02 && mask[i] < 0.98 ? mask[i] - 0.5 : inside[i] > 0 ? inside[i] - 0.5 : 0.5 - outside[i];
  }
  // Outlines may touch, so with `draw` the letters are told apart by their faces alone.
  let seed = binary;
  if (faces) {
    seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = faces[i * 4 + 3] > 127 ? 1 : 0;
  }
  const labels = new Int32Array(count);
  const parts: FieldPart[] = [];
  const queue = new Int32Array(count);
  for (let start = 0; start < count; start++) {
    if (!seed[start] || labels[start]) continue;
    const id = parts.length + 1;
    let head = 0;
    let tail = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = Infinity;
    queue[tail++] = start;
    labels[start] = id;
    while (head < tail) {
      const i = queue[head++];
      const x = i % fw;
      const y = (i - x) / fw;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > 0 && seed[i - 1] && !labels[i - 1]) {
        labels[i - 1] = id;
        queue[tail++] = i - 1;
      }
      if (x < fw - 1 && seed[i + 1] && !labels[i + 1]) {
        labels[i + 1] = id;
        queue[tail++] = i + 1;
      }
      if (y > 0 && seed[i - fw] && !labels[i - fw]) {
        labels[i - fw] = id;
        queue[tail++] = i - fw;
      }
      if (y < fh - 1 && seed[i + fw] && !labels[i + fw]) {
        labels[i + fw] = id;
        queue[tail++] = i + fw;
      }
    }
    parts.push({ x: sumX / tail / scale, y: sumY / tail / scale, left: minX, size: tail });
  }
  const owners = parts.length <= 64 ? nearestLabels(labels, fw, fh) : new Float32Array(count);
  const solution = blurField(inflateField(binary, fw, fh), fw, fh, 2);
  const edges = blurField(signed, fw, fh, 2);
  const shadowMask = blurField(binary, fw, fh, Math.max(4, Math.min(fw, fh) * 0.045));
  const field = new Float32Array(count * 4);
  const sdf = new Float32Array(count);
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const distance = edges[i] / scale;
    sdf[i] = distance;
    heights[i] = Math.sqrt(Math.max(0, 2 * solution[i])) / scale;
    field[i * 4] = heights[i];
    field[i * 4 + 1] = distance;
    field[i * 4 + 2] = shadowMask[i];
    field[i * 4 + 3] = owners[i];
  }
  const slopes = new Float32Array(count * 2);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const i = y * fw + x;
      let gx = (heights[y * fw + Math.min(fw - 1, x + 1)] - heights[y * fw + Math.max(0, x - 1)]) * 0.5 * scale;
      let gy = (heights[Math.min(fh - 1, y + 1) * fw + x] - heights[Math.max(0, y - 1) * fw + x]) * 0.5 * scale;
      const steep = Math.hypot(gx, gy);
      if (steep > 7) {
        gx *= 7 / steep;
        gy *= 7 / steep;
      }
      slopes[i * 2] = gx;
      slopes[i * 2 + 1] = gy;
    }
  }
  return { field, slopes, sdf, parts };
}

/** solveField in a worker, or right here if workers can't start. */
export function solveFieldAsync(input: FieldInput): Promise<FieldResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    try { worker = new Worker(new URL('./elasticField.worker.ts', import.meta.url), { type: 'module' }); }
    catch { resolve(solveField(input)); return; }
    worker.onmessage = (e: MessageEvent<FieldResult>) => { worker.terminate(); resolve(e.data); };
    worker.onerror = () => { worker.terminate(); resolve(solveField(input)); };
    worker.postMessage(input);
  });
}
