// On-screen analog joystick (#joy / #joyk) for touch play. joy.x / joy.y are in [-1, 1]; pushing it all
// the way makes the player run. On touch devices page scrolling, zooming and long-press menus are blocked.
export const joy = { x: 0, y: 0, id: -1 };
export function initJoystick(mobile: boolean) {
  const J = document.getElementById('joy')!,
    K = document.getElementById('joyk')!;
  const R = 55;
  let cx = 0,
    cy = 0;
  const upd = (e: PointerEvent) => {
    let dx = e.clientX - cx,
      dy = e.clientY - cy;
    const L = Math.hypot(dx, dy);
    if (L > R) {
      dx *= R / L;
      dy *= R / L;
    }
    joy.x = dx / R;
    joy.y = dy / R;
    K.style.transform = `translate(${dx}px,${dy}px)`;
  };
  J.addEventListener('pointerdown', e => {
    e.preventDefault();
    const b = J.getBoundingClientRect();
    cx = b.left + b.width / 2;
    cy = b.top + b.height / 2;
    joy.id = e.pointerId;
    J.setPointerCapture(e.pointerId);
    upd(e);
  });
  J.addEventListener('pointermove', e => {
    if (e.pointerId === joy.id) upd(e);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== joy.id) return;
    joy.id = -1;
    joy.x = joy.y = 0;
    K.style.transform = '';
  };
  J.addEventListener('pointerup', end);
  J.addEventListener('pointercancel', end);
  if (mobile) {
    for (const ev of ['touchmove', 'gesturestart', 'contextmenu', 'selectstart'])
      document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  }
}
