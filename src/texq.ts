// Mobile gets a half-resolution set of the procedural canvas textures (drawn at full size, then downsampled).
export const TEXQ = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches ? 0.5 : 1;
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
