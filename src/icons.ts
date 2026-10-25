// Procedurally drawn item icons (original art, parody brands). Each icon is a 128x128 canvas.
import * as THREE from 'three';
type C = CanvasRenderingContext2D;
const S = 128;
function rr(c: C, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function txt(c: C, t: string, x: number, y: number, size: number, col: string, stroke?: string, rot = 0) { c.save(); c.translate(x, y); c.rotate(rot); c.font = `900 ${size}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; if (stroke) { c.lineWidth = 4; c.strokeStyle = stroke; c.strokeText(t, 0, 0); } c.fillStyle = col; c.fillText(t, 0, 0); c.restore(); }
function grad(c: C, x0: number, x1: number, a: string, b: string) { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, a); g.addColorStop(0.45, b); g.addColorStop(1, a); return g; }
function shine(c: C, x: number, y: number, w: number, h: number) { c.fillStyle = 'rgba(255,255,255,.35)'; rr(c, x, y, w, h, w / 2); c.fill(); }
function bottle(c: C, cap: string, liquid: string, band: string, label: string, sub: string, tcol = '#fff') {
  c.fillStyle = cap; rr(c, 54, 6, 20, 14, 3); c.fill();
  c.fillStyle = grad(c, 36, 92, liquid, '#ffffffcc'); c.beginPath(); c.moveTo(56, 20); c.lineTo(72, 20); c.quadraticCurveTo(92, 34, 92, 52); c.lineTo(92, 112); c.quadraticCurveTo(92, 122, 82, 122); c.lineTo(46, 122); c.quadraticCurveTo(36, 122, 36, 112); c.lineTo(36, 52); c.quadraticCurveTo(36, 34, 56, 20); c.fill();
  c.fillStyle = band; c.fillRect(36, 60, 56, 36); txt(c, label, 64, 74, label.length > 2 ? 15 : 20, tcol); txt(c, sub, 64, 90, 9, tcol);
  shine(c, 41, 40, 6, 70);
}
function can(c: C, body: string, top: string, label: string, sub: string, tcol = '#fff') {
  c.fillStyle = grad(c, 34, 94, top, '#eee'); c.beginPath(); c.ellipse(64, 24, 30, 8, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = grad(c, 34, 94, body, '#ffffff55'); c.fillRect(34, 24, 60, 88); c.fillStyle = body; c.globalAlpha = 0.85; c.fillRect(34, 24, 60, 88); c.globalAlpha = 1;
  c.fillStyle = top; c.beginPath(); c.ellipse(64, 112, 30, 8, 0, 0, Math.PI); c.fill();
  txt(c, label, 64, 62, label.length > 2 ? 16 : 22, tcol, 'rgba(0,0,0,.35)'); txt(c, sub, 64, 86, 10, tcol); shine(c, 40, 30, 6, 76);
}
function bag(c: C, col: string, label: string, sub: string, tcol = '#fff', deco?: (c: C) => void) {
  c.fillStyle = col; c.beginPath(); c.moveTo(24, 22); for (let x = 24; x <= 104; x += 8) c.lineTo(x, x % 16 ? 18 : 24); c.lineTo(108, 106); for (let x = 104; x >= 24; x -= 8) c.lineTo(x, x % 16 ? 112 : 106); c.lineTo(20, 106); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(26, 28, 12, 76); deco?.(c); txt(c, label, 64, 62, label.length > 2 ? 20 : 28, tcol, 'rgba(0,0,0,.45)'); txt(c, sub, 64, 92, 11, tcol);
}
function box(c: C, col: string, label: string, sub: string, tcol = '#fff') { c.fillStyle = col; rr(c, 20, 30, 88, 72, 6); c.fill(); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(20, 84, 88, 18); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(20, 30, 88, 8); txt(c, label, 64, 60, label.length > 3 ? 15 : 20, tcol, 'rgba(0,0,0,.35)'); txt(c, sub, 64, 93, 10, tcol); }

// generic PLA small-arms silhouettes (original drawings, not traced)
function gunIco(c: C, o: { bull?: boolean; len?: number; mag?: 'box' | 'curve' | 'none' | 'tube' | 'belt'; scope?: boolean; supp?: boolean; bipod?: boolean; col?: string; label: string; pistol?: boolean }) {
  const col = o.col || '#2c3128', L = o.len || 1; c.save(); c.translate(64, 64); c.rotate(-0.12);
  if (o.pistol) { c.fillStyle = col; rr(c, -40, -18, 80, 18, 3); c.fill(); c.beginPath(); c.moveTo(10, 0); c.lineTo(34, 0); c.lineTo(40, 40); c.lineTo(18, 40); c.closePath(); c.fill(); c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(4, 6, 8, 0, Math.PI); c.stroke(); }
  else { const x0 = -58 * L, x1 = 58 * L; c.fillStyle = col; c.fillRect(x0 + 14, -10, x1 - x0 - 30, 14); c.fillRect(x1 - 18, -6, o.supp ? 20 : 16, o.supp ? 10 : 5); if (o.supp) { c.fillStyle = '#1e211c'; c.fillRect(x1 - 30, -9, 30, 14); c.fillStyle = col; }
    c.beginPath(); if (o.bull) { c.moveTo(x0, -10); c.lineTo(x0 + 18, -10); c.lineTo(x0 + 18, 12); c.lineTo(x0, 16); } else { c.moveTo(x0, -8); c.lineTo(x0 + 18, -6); c.lineTo(x0 + 18, 6); c.lineTo(x0, 16); } c.closePath(); c.fill();
    const gx = o.bull ? 8 : -14; c.beginPath(); c.moveTo(gx, 4); c.lineTo(gx + 10, 4); c.lineTo(gx + 6, 28); c.lineTo(gx - 4, 28); c.closePath(); c.fill(); c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(gx - 6, 8, 6, 0, Math.PI); c.stroke();
    const mx = o.bull ? gx - 26 : gx + 14; c.fillStyle = '#3a3e34';
    if (o.mag === 'curve') { c.beginPath(); c.moveTo(mx, 4); c.lineTo(mx + 12, 4); c.quadraticCurveTo(mx + 16, 22, mx + 22, 36); c.lineTo(mx + 10, 38); c.quadraticCurveTo(mx + 4, 22, mx, 4); c.fill(); }
    if (o.mag === 'box') { c.fillRect(mx, 4, 11, 20); } if (o.mag === 'tube') { c.fillRect(x0 + 40, 4, x1 - x0 - 70, 6); }
    if (o.mag === 'belt') { c.fillStyle = '#7a6a3a'; c.fillRect(mx - 4, 4, 26, 22); c.fillStyle = '#c9a23a'; for (let i = 0; i < 6; i++) c.fillRect(mx - 30 + i * 5, 26 + i * 2, 3, 8); }
    if (o.scope) { c.fillStyle = '#1a1a1a'; rr(c, -24, -24, 46, 10, 4); c.fill(); c.fillRect(-6, -16, 6, 7); }
    else { c.fillStyle = '#1a1a1a'; c.fillRect(-14, -16, 22, 6); }
    if (o.bipod) { c.strokeStyle = '#1a1a1a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x1 - 34, 2); c.lineTo(x1 - 44, 30); c.moveTo(x1 - 34, 2); c.lineTo(x1 - 24, 30); c.stroke(); } }
  c.restore(); c.fillStyle = '#f2d27a'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.fillText(o.label, 64, 118); }
function magIco(c: C, label: string, n: string, col = '#3a3e34', curve = true) { c.fillStyle = col; c.save(); c.translate(64, 56); c.rotate(curve ? 0.25 : 0); rr(c, -14, -40, 28, 78, 4); c.fill(); c.fillStyle = '#c9a23a'; rr(c, -9, -46, 18, 10, 3); c.fill(); c.restore(); c.fillStyle = '#fff'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.fillText(n, 64, 62); c.fillStyle = '#f2d27a'; c.font = 'bold 14px sans-serif'; c.fillText(label, 64, 120); }
const DRAW: Record<string, (c: C) => void> = {
  water: c => bottle(c, '#2a6fd6', '#9fd2ff', '#1f5fbf', '水源山', '天然礦泉水'),
  tea: c => bottle(c, '#1d7a3a', '#c9c25a', '#226b34', '茶裡旺', '日式綠茶 無糖'),
  sport: c => bottle(c, '#e8e8e8', '#e3f3ff', '#1d58b8', '舒跳', '運動飲料 SUPAO'),
  soymilk: c => bottle(c, '#f2d38b', '#fff6e0', '#c78a2b', '豆漿', '古早味 冰的', '#fff'),
  milktea: c => { c.fillStyle = '#c69a6b'; c.beginPath(); c.moveTo(34, 34); c.lineTo(94, 34); c.lineTo(86, 120); c.lineTo(42, 120); c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(64, 34, 32, 10, 0, Math.PI, 0); c.fill(); c.fillStyle = '#1a120c'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(46 + (i % 5) * 9, 106 - Math.floor(i / 5) * 8, 4, 0, 7); c.fill(); } c.fillStyle = '#e94b8a'; c.save(); c.translate(70, 20); c.rotate(0.25); c.fillRect(-4, -16, 8, 52); c.restore(); c.fillStyle = '#fff'; rr(c, 44, 56, 40, 22, 4); c.fill(); txt(c, '珍奶', 64, 67, 15, '#7a4a20'); },
  coffee: c => can(c, '#1b2b5c', '#c6c6c6', '藍山', '罐裝咖啡 微糖'),
  noodle: c => bag(c, '#c8231c', '牛肉麵', '紅燒 泡麵', '#ffe27a', c => { c.fillStyle = '#ffcf4a'; c.beginPath(); c.ellipse(64, 38, 26, 10, 0, 0, 7); c.fill(); c.strokeStyle = '#d39a2a'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(44 + i * 9, 34); c.quadraticCurveTo(48 + i * 9, 44, 44 + i * 9, 42); c.stroke(); } }),
  cupnoodle: c => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(28, 30); c.lineTo(100, 30); c.lineTo(90, 118); c.lineTo(38, 118); c.fill(); c.fillStyle = '#e0602a'; c.fillRect(32, 56, 64, 34); c.fillStyle = '#f2f2f2'; c.beginPath(); c.ellipse(64, 30, 36, 8, 0, 0, 7); c.fill(); txt(c, '好吃麵', 64, 73, 18, '#fff'); txt(c, '杯麵', 64, 104, 11, '#c33'); },
  rice: c => { c.fillStyle = '#f4f1ea'; c.beginPath(); c.moveTo(64, 14); c.quadraticCurveTo(116, 100, 108, 110); c.lineTo(20, 110); c.quadraticCurveTo(12, 100, 64, 14); c.fill(); c.fillStyle = '#1b2a1b'; c.fillRect(42, 70, 44, 42); c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.moveTo(64, 18); c.lineTo(66, 110); c.lineTo(62, 110); c.fill(); c.fillStyle = '#d22'; rr(c, 30, 48, 68, 18, 4); c.fill(); txt(c, '鮪魚飯糰', 64, 57, 12, '#fff'); },
  bento: c => { c.fillStyle = '#8a5a2c'; rr(c, 14, 34, 100, 70, 6); c.fill(); c.fillStyle = '#fff'; rr(c, 20, 40, 54, 58, 4); c.fill(); c.fillStyle = '#c3772a'; c.beginPath(); c.ellipse(46, 62, 22, 14, 0.3, 0, 7); c.fill(); c.fillStyle = '#3a8a2a'; c.fillRect(80, 42, 28, 24); c.fillStyle = '#f2c94a'; c.fillRect(80, 70, 28, 26); c.fillStyle = '#5a3a1a'; c.fillRect(24, 82, 46, 12); txt(c, '排骨', 46, 90, 10, '#fff'); },
  can: c => can(c, '#b8241c', '#d0d0d0', '肉醬', '罐頭 古早味'),
  snack: c => bag(c, '#2da84a', '怪怪', '五香 點心餅', '#ffe94a', c => { c.fillStyle = '#ffe94a'; c.beginPath(); c.arc(64, 38, 12, 0, 7); c.fill(); c.fillStyle = '#2da84a'; c.fillRect(58, 34, 3, 3); c.fillRect(67, 34, 3, 3); }),
  egg: c => { c.fillStyle = '#6b3d1c'; c.beginPath(); c.ellipse(64, 70, 34, 44, 0, 0, 7); c.fill(); c.strokeStyle = '#3a1f0c'; c.lineWidth = 2; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(40 + i * 6, 40 + (i % 3) * 20); c.lineTo(50 + i * 5, 60 + (i % 2) * 24); c.lineTo(44 + i * 6, 86); c.stroke(); } shine(c, 46, 42, 8, 24); },
  oden: c => { c.fillStyle = '#e8e2d0'; c.beginPath(); c.moveTo(22, 64); c.lineTo(106, 64); c.lineTo(94, 118); c.lineTo(34, 118); c.fill(); c.strokeStyle = '#a77a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(52, 12); c.lineTo(58, 70); c.moveTo(76, 14); c.lineTo(70, 70); c.stroke(); c.fillStyle = '#f2e6b8'; c.beginPath(); c.arc(54, 30, 9, 0, 7); c.arc(55, 48, 9, 0, 7); c.fill(); c.fillStyle = '#d9a35a'; c.fillRect(66, 24, 16, 14); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(66, 44); c.lineTo(82, 44); c.lineTo(74, 58); c.fill(); txt(c, '關東煮', 64, 92, 14, '#7a4a20'); },
  danbing: c => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(64, 76, 50, 22, 0, 0, 7); c.fill(); c.fillStyle = '#efc76a'; for (let i = 0; i < 4; i++) { rr(c, 24 + i * 20, 56, 18, 32, 6); c.fill(); } c.fillStyle = '#f9e28a'; for (let i = 0; i < 4; i++) c.fillRect(30 + i * 20, 62, 6, 20); c.fillStyle = '#6a2a10'; c.fillRect(24, 54, 80, 3); txt(c, '蛋餅', 64, 112, 16, '#c33'); },
  chicken: c => { c.fillStyle = '#f2e6c8'; c.beginPath(); c.moveTo(24, 30); c.lineTo(104, 30); c.lineTo(98, 120); c.lineTo(30, 120); c.fill(); c.fillStyle = '#c2702a'; c.beginPath(); c.ellipse(64, 34, 40, 22, 0.1, 0, 7); c.fill(); c.fillStyle = '#9a4a14'; for (let i = 0; i < 30; i++) c.fillRect(30 + Math.random() * 68, 20 + Math.random() * 26, 3, 3); txt(c, '大雞排', 64, 88, 18, '#c22'); },
  sausage: c => { c.strokeStyle = '#c9a46a'; c.lineWidth = 4; c.beginPath(); c.moveTo(64, 120); c.lineTo(64, 20); c.stroke(); c.fillStyle = '#b5321c'; rr(c, 50, 14, 28, 80, 14); c.fill(); c.strokeStyle = '#6a1a0c'; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(52, 26 + i * 12); c.lineTo(76, 32 + i * 12); c.stroke(); } shine(c, 55, 20, 5, 60); },
  pineapple: c => box(c, '#e8b42a', '鳳梨酥', '台灣名產 伴手禮', '#7a2a10'),
  ration: c => box(c, '#4f5a2a', '口糧', '佔領軍配給', '#e8e2b0'),
  betel: c => { c.fillStyle = '#3a8a2a'; c.beginPath(); c.ellipse(64, 72, 46, 30, -0.4, 0, 7); c.fill(); c.fillStyle = '#5ab83a'; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(48 + i * 16, 66 - i * 4, 9, 16, 0.3, 0, 7); c.fill(); } c.fillStyle = '#fff'; c.font = '900 14px sans-serif'; txt(c, '檳榔', 64, 112, 16, '#9f2'); },
  bandage: c => { c.fillStyle = '#f4f0e6'; c.beginPath(); c.arc(54, 64, 34, 0, 7); c.fill(); c.fillStyle = '#d8d2c2'; c.beginPath(); c.arc(54, 64, 12, 0, 7); c.fill(); c.fillStyle = '#f4f0e6'; c.fillRect(54, 84, 60, 14); c.strokeStyle = '#ccc'; c.beginPath(); c.arc(54, 64, 24, 0, 7); c.stroke(); },
  medkit: c => { c.fillStyle = '#e8e8e8'; rr(c, 16, 30, 96, 74, 10); c.fill(); c.fillStyle = '#c22'; c.fillRect(56, 42, 16, 50); c.fillRect(39, 59, 50, 16); c.fillStyle = '#888'; c.fillRect(48, 22, 32, 10); },
  pill: c => { c.fillStyle = '#d8dde4'; rr(c, 22, 30, 84, 68, 8); c.fill(); for (let i = 0; i < 8; i++) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(38 + (i % 4) * 18, 50 + Math.floor(i / 4) * 26, 7, 9, 0, 0, 7); c.fill(); c.strokeStyle = '#aab'; c.stroke(); } txt(c, '止痛錠', 64, 112, 14, '#2a6ad6'); },
  tissue: c => { c.fillStyle = '#fff'; rr(c, 14, 44, 100, 56, 8); c.fill(); c.fillStyle = '#7ac4e8'; c.fillRect(14, 74, 100, 26); c.fillStyle = '#e94b8a'; c.beginPath(); c.arc(30, 60, 6, 0, 7); c.arc(98, 60, 6, 0, 7); c.fill(); c.fillStyle = '#f8f8f8'; c.beginPath(); c.moveTo(52, 44); c.quadraticCurveTo(64, 20, 76, 44); c.fill(); txt(c, '柔柔紙', 64, 87, 16, '#fff'); },
  knife: c => { c.fillStyle = '#5a3a1a'; rr(c, 14, 76, 40, 16, 4); c.fill(); c.fillStyle = grad(c, 50, 116, '#9aa4ac', '#eef2f4'); c.beginPath(); c.moveTo(50, 50); c.lineTo(114, 46); c.lineTo(116, 92); c.lineTo(50, 92); c.fill(); c.fillStyle = '#333'; c.beginPath(); c.arc(104, 58, 4, 0, 7); c.fill(); },
  bat: c => { c.save(); c.translate(64, 64); c.rotate(-0.8); c.fillStyle = grad(c, -10, 10, '#a06a34', '#e2b06a'); c.beginPath(); c.moveTo(-4, 56); c.lineTo(4, 56); c.lineTo(11, -50); c.quadraticCurveTo(0, -62, -11, -50); c.fill(); c.fillStyle = '#222'; c.fillRect(-5, 30, 10, 26); c.restore(); },
  pipe: c => { c.save(); c.translate(64, 64); c.rotate(-0.8); c.fillStyle = grad(c, -8, 8, '#555', '#bbb'); c.fillRect(-7, -56, 14, 112); c.fillStyle = '#7a3a1a'; c.fillRect(-7, -20, 14, 6); c.restore(); },
  pistol: c => { c.fillStyle = '#2a2a2a'; rr(c, 18, 40, 86, 22, 4); c.fill(); c.fillStyle = '#3a3a3a'; c.beginPath(); c.moveTo(66, 60); c.lineTo(92, 60); c.lineTo(100, 110); c.lineTo(76, 110); c.fill(); c.strokeStyle = '#2a2a2a'; c.lineWidth = 5; c.beginPath(); c.arc(66, 70, 10, 0, Math.PI); c.stroke(); c.fillStyle = '#666'; c.fillRect(22, 44, 60, 4); },
  rifle: c => { c.fillStyle = '#2b2f28'; c.fillRect(6, 54, 90, 14); c.fillRect(96, 58, 26, 6); c.fillStyle = '#4b5232'; c.beginPath(); c.moveTo(6, 54); c.lineTo(28, 54); c.lineTo(24, 86); c.lineTo(6, 82); c.fill(); c.fillStyle = '#2b2f28'; c.beginPath(); c.moveTo(56, 68); c.lineTo(68, 68); c.lineTo(72, 100); c.lineTo(62, 100); c.fill(); c.fillStyle = '#1a1a1a'; c.fillRect(40, 66, 10, 20); c.fillRect(44, 44, 24, 10); },
  a9: c => { c.fillStyle = '#5a4a2a'; rr(c, 18, 60, 92, 48, 4); c.fill(); for (let i = 0; i < 5; i++) { c.fillStyle = '#c9a23a'; rr(c, 26 + i * 16, 30, 11, 34, 5); c.fill(); c.fillStyle = '#b06a2a'; c.fillRect(26 + i * 16, 30, 11, 8); } txt(c, '9mm', 64, 86, 20, '#fff'); },
  a556: c => { c.fillStyle = '#3a4a2a'; rr(c, 18, 60, 92, 48, 4); c.fill(); for (let i = 0; i < 5; i++) { c.fillStyle = '#c9a23a'; rr(c, 26 + i * 16, 16, 10, 48, 5); c.fill(); c.fillStyle = '#7a5a2a'; c.fillRect(26 + i * 16, 16, 10, 12); } txt(c, '5.8mm', 64, 86, 18, '#fff'); },
  qbz191: c => gunIco(c, { mag: 'curve', label: 'QBZ-191' }),
  qbz95: c => gunIco(c, { bull: true, mag: 'curve', label: 'QBZ-95-1' }),
  qbu191: c => gunIco(c, { mag: 'curve', scope: true, len: 1.1, bipod: true, label: 'QBU-191' }),
  qbu88: c => gunIco(c, { bull: true, mag: 'box', scope: true, len: 1.1, bipod: true, label: 'QBU-88' }),
  t91: c => gunIco(c, { mag: 'curve', col: '#5a5a52', label: 'T91' }), t65k2: c => gunIco(c, { mag: 'curve', col: '#6a6a5a', label: 'T65K2' }), t75saw: c => gunIco(c, { mag: 'belt', bipod: true, len: 1.1, col: '#5a5a52', label: 'T75 SAW' }),
  t93: c => gunIco(c, { mag: 'box', scope: true, bipod: true, len: 1.15, col: '#5a5a52', label: 'T93' }), t75p: c => gunIco(c, { pistol: true, col: '#5a5a52', label: 'T75' }),
  kestrel: c => tube(c, '#3e4a2e', '紅隼'), at4: c => tube(c, '#5a5a3a', 'AT4'), jav: c => tube(c, '#4b5a38', 'Javelin', true),
  r67: c => tube(c, '#6a6a4a', '67mm'), javm: c => tube(c, '#4b5a38', '彈筒'), stanag: c => magIco(c, 'T91 彈匣', '30', '#1e1e1e'),
  a556n: c => { for (let i = 0; i < 6; i++) { c.fillStyle = '#c9a23a'; rr(c, 22 + i * 14, 30, 9, 56, 4); c.fill(); } c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText('5.56 NATO', 64, 108); },
  a762n: c => { for (let i = 0; i < 4; i++) { c.fillStyle = '#c9a23a'; rr(c, 26 + i * 20, 22, 12, 70, 5); c.fill(); } c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText('7.62 NATO', 64, 110); },
  rocradio_b: c => radioIco(c, true), rocradio: c => radioIco(c, false),
  fpv: c => { c.strokeStyle = '#222'; c.lineWidth = 8; c.beginPath(); c.moveTo(26, 26); c.lineTo(102, 102); c.moveTo(102, 26); c.lineTo(26, 102); c.stroke(); for (const [x, y] of [[26, 26], [102, 26], [26, 102], [102, 102]]) { c.fillStyle = 'rgba(150,150,150,.5)'; c.beginPath(); c.arc(x, y, 20, 0, 7); c.fill(); c.fillStyle = '#333'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); } c.fillStyle = '#3e4a2e'; rr(c, 48, 50, 32, 30, 5); c.fill(); c.fillStyle = '#c33'; c.fillRect(56, 80, 16, 10); },
  frame: c => { c.strokeStyle = '#111'; c.lineWidth = 9; c.beginPath(); c.moveTo(26, 26); c.lineTo(102, 102); c.moveTo(102, 26); c.lineTo(26, 102); c.stroke(); c.fillStyle = '#222'; rr(c, 48, 48, 32, 32, 4); c.fill(); },
  dmotor: c => { c.fillStyle = '#555'; c.beginPath(); c.arc(64, 64, 30, 0, 7); c.fill(); c.fillStyle = '#c33'; c.beginPath(); c.arc(64, 64, 22, 0, 7); c.fill(); c.fillStyle = '#ddd'; c.beginPath(); c.arc(64, 64, 6, 0, 7); c.fill(); },
  lipo: c => { c.fillStyle = '#2a4a8a'; rr(c, 20, 40, 88, 48, 6); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.fillText('4S LiPo', 64, 70); c.fillStyle = '#d33'; c.fillRect(100, 50, 18, 6); },
  vtx: c => { c.fillStyle = '#1a6a3a'; rr(c, 30, 46, 50, 40, 4); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(96, 66, 14, 0, 7); c.fill(); c.fillStyle = '#448'; c.beginPath(); c.arc(96, 66, 7, 0, 7); c.fill(); c.strokeStyle = '#aaa'; c.lineWidth = 3; c.beginPath(); c.moveTo(40, 46); c.lineTo(34, 16); c.stroke(); },
  qsz92: c => gunIco(c, { pistol: true, label: 'QSZ-92' }),
  qjy88: c => gunIco(c, { mag: 'belt', bipod: true, len: 1.1, label: 'QJY-88' }),
  qcw05: c => gunIco(c, { bull: true, mag: 'box', supp: true, len: 0.75, label: 'QCW-05' }),
  qbs09: c => gunIco(c, { mag: 'tube', col: '#2a2a2a', label: 'QBS-09' }),
  mag191: c => magIco(c, '5.8×42 彈匣', '30'), mag88: c => magIco(c, 'QBU-88 彈匣', '10', '#2a2a2a', false), mag92: c => magIco(c, 'QSZ-92 彈匣', '15', '#2a2a2a', false), mag05: c => magIco(c, 'QCW-05 彈匣', '50'),
  belt88: c => { c.fillStyle = '#4b5232'; rr(c, 18, 36, 92, 62, 6); c.fill(); c.fillStyle = '#e8e0c0'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText('5.8×42', 64, 72); c.fillStyle = '#f2d27a'; c.fillText('彈鏈 100', 64, 120); },
  a58p: c => { c.fillStyle = '#3a3e4a'; rr(c, 18, 60, 92, 48, 4); c.fill(); for (let i = 0; i < 6; i++) { c.fillStyle = '#c9a23a'; rr(c, 24 + i * 14, 30, 9, 32, 4); c.fill(); } c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillText('5.8×21', 64, 92); },
  a12: c => { for (let i = 0; i < 4; i++) { c.fillStyle = '#a02a20'; rr(c, 22 + i * 22, 26, 16, 64, 3); c.fill(); c.fillStyle = '#c9a23a'; c.fillRect(22 + i * 22, 78, 16, 14); } c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillText('12 號', 64, 116); },
  grenade: c => { c.fillStyle = '#3e4a2e'; c.beginPath(); c.ellipse(64, 72, 26, 34, 0, 0, 7); c.fill(); c.fillStyle = '#777'; c.fillRect(56, 30, 16, 12); c.strokeStyle = '#aaa'; c.lineWidth = 3; c.beginPath(); c.arc(80, 34, 7, 0, 7); c.stroke(); },
  helmet: c => { c.fillStyle = '#4b5a38'; c.beginPath(); c.arc(64, 74, 42, Math.PI, 0); c.lineTo(110, 84); c.lineTo(18, 84); c.fill(); for (let i = 0; i < 40; i++) { c.fillStyle = ['#3a4628', '#6a6a44', '#2a3020'][i % 3]; c.fillRect(30 + (i * 37) % 70, 44 + (i * 13) % 34, 8, 5); } },
  vest: c => { c.fillStyle = '#4b5a38'; c.beginPath(); c.moveTo(30, 20); c.lineTo(50, 20); c.lineTo(64, 36); c.lineTo(78, 20); c.lineTo(98, 20); c.lineTo(104, 110); c.lineTo(24, 110); c.fill(); c.fillStyle = '#3a4628'; for (let i = 0; i < 3; i++) rr(c, 32 + i * 22, 70, 18, 26, 3), c.fill(); },
  plank: c => { c.save(); c.translate(64, 64); c.rotate(-0.5); c.fillStyle = '#b07a44'; c.fillRect(-56, -14, 112, 28); c.strokeStyle = '#7a5028'; c.lineWidth = 2; for (let i = -3; i < 4; i++) { c.beginPath(); c.moveTo(-56, i * 4); c.bezierCurveTo(-20, i * 4 + 4, 20, i * 4 - 4, 56, i * 4); c.stroke(); } c.restore(); },
  hammer: c => { c.save(); c.translate(64, 64); c.rotate(-0.6); c.fillStyle = '#8a5a2c'; c.fillRect(-5, -20, 10, 76); c.fillStyle = '#555'; c.fillRect(-26, -40, 46, 20); c.fillStyle = '#888'; c.fillRect(-26, -40, 46, 6); c.restore(); },
};
function tube(c: C, col: string, label: string, clu = false) { c.save(); c.translate(64, 64); c.rotate(-0.5); c.fillStyle = col; rr(c, -56, -11, 112, 22, 8); c.fill(); c.fillStyle = '#222'; c.fillRect(-10, 11, 8, 18); if (clu) { c.fillStyle = '#333'; rr(c, -20, -34, 40, 24, 4); c.fill(); } c.restore(); c.fillStyle = '#fff'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.fillText(label, 64, 118); }
function radioIco(c: C, broken: boolean) { c.fillStyle = '#4b5a38'; rr(c, 26, 34, 76, 70, 6); c.fill(); c.fillStyle = '#222'; c.fillRect(36, 46, 30, 18); c.strokeStyle = '#333'; c.lineWidth = 4; c.beginPath(); c.moveTo(88, 34); c.lineTo(96, 6); c.stroke(); for (let i = 0; i < 3; i++) { c.fillStyle = '#aaa'; c.beginPath(); c.arc(44 + i * 18, 84, 5, 0, 7); c.fill(); }
  if (broken) { c.strokeStyle = '#e33'; c.lineWidth = 5; c.beginPath(); c.moveTo(30, 100); c.lineTo(98, 38); c.stroke(); } }
const cache: Record<string, { canvas: HTMLCanvasElement; url?: string; tex?: THREE.Texture }> = {};
export function iconCanvas(id: string) {
  if (!cache[id]) { const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d')!; (DRAW[id] || (c => box(c, '#777', id, '')))(c); cache[id] = { canvas: cv }; }
  return cache[id];
}
export function iconURL(id: string) { const e = iconCanvas(id); return e.url || (e.url = e.canvas.toDataURL()); }
export function iconTex(id: string) { const e = iconCanvas(id); if (!e.tex) { e.tex = new THREE.CanvasTexture(e.canvas); e.tex.colorSpace = THREE.SRGBColorSpace; } return e.tex; }
const matCache: Record<string, THREE.Material> = {};
export function iconMat(id: string) { return matCache[id] || (matCache[id] = new THREE.MeshStandardMaterial({ map: iconTex(id), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, emissive: 0xffffff, emissiveMap: iconTex(id), emissiveIntensity: 0.15 })); }
// size hint (w,h in meters) for 3D product cards
export const PSIZE: Record<string, [number, number]> = { water: [0.12, 0.26], tea: [0.12, 0.26], sport: [0.12, 0.26], soymilk: [0.12, 0.24], milktea: [0.12, 0.2], coffee: [0.09, 0.14], can: [0.11, 0.12], noodle: [0.2, 0.2], cupnoodle: [0.14, 0.14], rice: [0.13, 0.13], bento: [0.22, 0.16], snack: [0.18, 0.22], egg: [0.07, 0.08], oden: [0.14, 0.18], tissue: [0.24, 0.14], bandage: [0.1, 0.1], medkit: [0.24, 0.2], pill: [0.12, 0.1], pineapple: [0.2, 0.16], betel: [0.12, 0.1], danbing: [0.2, 0.12], chicken: [0.22, 0.24], sausage: [0.06, 0.24] };
