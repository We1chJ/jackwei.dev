// The résumé reel's open state, shared with the 3D stage (which stops rendering while the reel
// covers the screen) and the download it starts early when the button is hovered.
import { createStore } from '../arcade/store';
import { fetchStream, pickUrl, type Stream } from './stream';

export const [reel, useReel] = createStore({ open: false, covered: false });

let download: Promise<Stream> | null = null;

/** Starts (once) the reel download; hovering or focusing the button calls this ahead of the click. */
export function loadReel() {
  download ??= fetchStream(pickUrl());
  download.catch(() => { download = null; }); // a later open retries
  return download;
}
