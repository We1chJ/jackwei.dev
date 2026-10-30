// The reel ships as a raw H.264 stream (Annex B) so it can go straight to WebCodecs without
// an MP4 demuxer. It is encoded so that splitting it is trivial: every frame starts with an
// access-unit delimiter, there are no B-frames (decode order = display order), and every 8th
// frame is an IDR that repeats the SPS/PPS, so decoding can start at any group of 8 (small groups
// keep the decoded-frame cache small; see frames.ts).
//   ffmpeg -framerate 120 -i f%04d.jpg -vf scale=1920:1080 -c:v libx264 -crf 21 -bf 0 -g 8
//     -sc_threshold 0 -x264-params aud=1:repeat-headers=1 -f h264 reel-1080.h264
// (also 1280x720 and 2560x1440, in public/media/; reel.m4a there is the clip's sound)

export const FPS = 120;

export interface Unit { start: number; end: number; key: boolean }
export interface Stream { data: Uint8Array; units: Unit[]; codec: string }

export type Size = 720 | 1080 | 1440;
export const url = (size: Size) => `/media/reel-${size}.h264`;

/** Picks the rendition for this screen. Decoding 120 fps video is the expensive part, so it leans
 *  small: 1440p only on big 4K/5K displays, phones and slow connections get 720p. */
export function pickSize(): Size {
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const px = Math.max(innerWidth, innerHeight * 16 / 9) * Math.min(devicePixelRatio || 1, 2);
  if (conn?.saveData || /2g/.test(conn?.effectiveType ?? '')) return 720;
  if (navigator.maxTouchPoints > 1 && px < 2200) return 720; // phones; tablets at 2x are 1080p
  return px > 3400 ? 1440 : px > 1400 ? 1080 : 720;
}
/** The next cheaper rendition, for a machine whose decoder cannot keep up. */
export const smaller = (size: Size): Size | null => (size === 1440 ? 1080 : size === 1080 ? 720 : null);

export async function fetchStream(url: string): Promise<Stream> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`reel: ${res.status}`);
  return parse(new Uint8Array(await res.arrayBuffer()));
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
