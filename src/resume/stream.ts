// The reel ships as a raw H.264 stream (Annex B) so it can go straight to WebCodecs without
// an MP4 demuxer. It is encoded so that splitting it is trivial: every frame starts with an
// access-unit delimiter, there are no B-frames (decode order = display order), and every 16th
// frame is an IDR that repeats the SPS/PPS, so decoding can start at any group of 16.
//   ffmpeg -framerate 120 -i f%04d.jpg -vf scale=1920:1080 -c:v libx264 -crf 21 -bf 0 -g 16
//     -sc_threshold 0 -x264-params aud=1:repeat-headers=1 -f h264 reel-1080.h264
// (also 1280x720 and 2560x1440; the files live in public/media/ and are not committed)

export const FPS = 120;

export interface Unit { start: number; end: number; key: boolean }
export interface Stream { data: Uint8Array; units: Unit[]; codec: string }

/** Picks the smallest rendition that still covers the screen at full sharpness. */
export function pickUrl() {
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const px = Math.max(innerWidth, innerHeight * 16 / 9) * Math.min(devicePixelRatio || 1, 2);
  const size = conn?.saveData || /2g/.test(conn?.effectiveType ?? '') ? 720 : px > 2200 ? 1440 : px > 1400 ? 1080 : 720;
  return `/media/reel-${size}.h264`;
}

export async function fetchStream(url: string, onProgress: (f: number) => void): Promise<Stream> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`reel: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress(got / total);
  }
  const data = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { data.set(p, o); o += p.length; }
  return parse(data);
}

function parse(data: Uint8Array): Stream {
  const units: Unit[] = [];
  let codec = '';
  for (let i = 0; i + 3 < data.length; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 1) continue;
    const at = i > 0 && data[i - 1] === 0 ? i - 1 : i; // include the 4th zero of a 4-byte start code
    const type = data[i + 3] & 0x1f;
    if (type === 9) {
      if (units.length) units[units.length - 1].end = at;
      units.push({ start: at, end: data.length, key: false });
    } else if (type === 5 && units.length) {
      units[units.length - 1].key = true;
    } else if (type === 7 && !codec) {
      // avc1.PPCCLL from the SPS: profile, constraint flags, level
      codec = 'avc1.' + [1, 2, 3].map((k) => data[i + 3 + k].toString(16).padStart(2, '0')).join('');
    }
    i += 3;
  }
  return { data, units, codec };
}
