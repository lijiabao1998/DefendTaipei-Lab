// Mobile gets a half-resolution set of the procedural canvas textures (drawn at full size, then downsampled).
import { SET, QSCALE } from '../ui/settings';
// v22.4: scale follows the 畫質 setting (low 0.5 / med 0.75 / high 1; mobile defaults to low)
export const TEXQ = QSCALE[SET.quality] ?? 1;
export function shrink(cv: HTMLCanvasElement): HTMLCanvasElement {
  if (TEXQ >= 1 || cv.width < 256 || cv.height < 128) return cv;
  const o = document.createElement('canvas');
  o.width = Math.round(cv.width * TEXQ);
  o.height = Math.round(cv.height * TEXQ);
  const c = o.getContext('2d')!;
  c.imageSmoothingQuality = 'high';
  c.drawImage(cv, 0, 0, o.width, o.height);
  return o;
}
