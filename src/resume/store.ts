// The résumé reel's open state, shared with the 3D stage (which stops rendering while the reel
// covers the screen) and the download it starts early when the button is hovered.
import { createStore } from '../arcade/store';
import { fetchStream, pickSize, url, type Size, type Stream } from './stream';

/** open: the reel is up. dimmed: the arcade sits behind the loading dots. covered: it is hidden. */
export const [reel, useReel] = createStore({ open: false, dimmed: false, covered: false });

const downloads = new Map<Size, Promise<Stream>>();

/** Starts (once) the reel download; hovering or focusing the button calls this ahead of the click. */
export function loadReel(size: Size = pickSize()) {
  if (!downloads.size) new Audio('/media/reel.m4a').preload = 'auto'; // warm the sound's cache alongside the clip
  let d = downloads.get(size);
  if (!d) {
    d = fetchStream(url(size));
    downloads.set(size, d);
    d.catch(() => downloads.delete(size)); // a later open retries
  }
  return d;
}
