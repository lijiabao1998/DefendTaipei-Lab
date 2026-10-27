// v19.2 road-marking glyph atlas: 2:1 elongated characters and arrows/icons (§150), with slight paint wear.
import * as THREE from 'three';

export const GLYPHS = [
  '慢',
  '停',
  '禁',
  '行',
  '機',
  '車',
  '優',
  '先',
  '公',
  '專',
  '用',
  '待',
  '轉',
  '區',
  'SCOOT',
  'UP',
  'LEFT',
  'RIGHT',
  'UPR',
  'UPL',
  'BIKE',
  '越',
  '線',
  '受',
  '罰',
];
let ATLAS: THREE.CanvasTexture | null = null;
export const GMAT: Record<string, THREE.MeshStandardMaterial> = {};
export function atlas() {
  if (ATLAS) return ATLAS;
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 1024;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  GLYPHS.forEach((ch, i) => {
    const cx = (i % 8) * 128,
      cy = Math.floor(i / 8) * 256;
    g.save();
    g.translate(cx + 64, cy + 128);
    if (ch.length === 1) {
      g.scale(1, 2);
      g.font = 'bold 118px "Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, 0, 4);
    } // 2:1 elongated 變體字 (§150)
    else if (ch === 'SCOOT') {
      g.lineWidth = 9;
      g.beginPath();
      g.arc(0, -78, 26, 0, 7);
      g.stroke();
      g.beginPath();
      g.arc(0, 82, 26, 0, 7);
      g.stroke();
      g.fillRect(-14, -50, 28, 108);
      g.fillRect(-34, -96, 68, 10);
      g.fillRect(-20, 10, 40, 34);
    } else if (ch === 'BIKE') {
      g.lineWidth = 8;
      g.beginPath();
      g.arc(0, -70, 30, 0, 7);
      g.stroke();
      g.beginPath();
      g.arc(0, 70, 30, 0, 7);
      g.stroke();
      g.fillRect(-5, -70, 10, 140);
    } else {
      const shaft = () => g.fillRect(-11, -20, 22, 130);
      const head = (ax: number, ay: number, rot: number) => {
        g.save();
        g.translate(ax, ay);
        g.rotate(rot);
        g.beginPath();
        g.moveTo(0, -48);
        g.lineTo(34, 8);
        g.lineTo(-34, 8);
        g.closePath();
        g.fill();
        g.restore();
      };
      if (ch === 'UP' || ch === 'UPR' || ch === 'UPL') {
        shaft();
        g.fillRect(-11, -70, 22, 60);
        head(0, -76, 0);
      }
      if (ch === 'LEFT' || ch === 'UPL') {
        if (ch === 'LEFT') shaft();
        g.lineWidth = 22;
        g.beginPath();
        g.arc(-44, 10, 44, 0, -Math.PI / 2, true);
        g.stroke();
        head(-50, -34, -Math.PI / 2);
      }
      if (ch === 'RIGHT' || ch === 'UPR') {
        if (ch === 'RIGHT') shaft();
        g.lineWidth = 22;
        g.beginPath();
        g.arc(44, 10, 44, Math.PI, -Math.PI / 2);
        g.stroke();
        head(50, -34, Math.PI / 2);
      }
    }
    g.restore();
  });
  // slight wear: knock small holes out of the paint
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.7})`;
    const r = 1 + Math.random() * 3;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, r, r);
  }
  ATLAS = new THREE.CanvasTexture(cv);
  ATLAS.anisotropy = 4;
  ATLAS.colorSpace = THREE.SRGBColorSpace;
  for (const [k, c] of [
    ['W', 0xe9e7df],
    ['Y', 0xe2b228],
    ['R', 0xc0302a],
  ] as const)
    GMAT[k] = new THREE.MeshStandardMaterial({
      map: ATLAS,
      color: c,
      roughness: 0.8,
      alphaTest: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
  return ATLAS;
}
