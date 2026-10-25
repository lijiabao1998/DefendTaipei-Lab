import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => errs.push(String(e)));
const L = async (m) => console.log(m, await p.evaluate(`document.querySelector('#log').innerText.split('\\n').slice(0,4).join(' | ')`));
await p.goto('http://localhost:4173/DefendTaipei-Lab/'); await p.waitForFunction(() => window.__game, null, { timeout: 180000 });
await p.click('.ch[data-g="f"]'); await p.waitForTimeout(3000);
// trigger 1: 2 blocks liberated
await p.evaluate(`window.__game.liberate(2)`); await p.waitForTimeout(1500); await L('unlock');
await p.screenshot({ path: '/workspace/defendtaipei-v13-roc-unlock.png' });
// ROC weapons inventory + caches
await p.evaluate(`(()=>{const g=window.__game;for(const [k,n] of [['t91',1],['t65k2',1],['t75saw',1],['t93',1],['t75p',1],['kestrel',1],['r67',2],['at4',1],['jav',1],['javm',1],['a556n',60],['a762n',10],['stanag',2],['rocradio_b',1],['lipo',1],['vtx',1]])g.addItem(k,n);g.toggleInv()})()`); await p.waitForTimeout(1000);
await p.screenshot({ path: '/workspace/defendtaipei-v13-roc-inventory.png' }); await p.keyboard.press('Tab');
console.log('caches', await p.evaluate(`window.__game.conts.filter(c=>c.label==='國軍補給箱'||c.label==='受傷聯絡官的背包').map(c=>c.label).join(',')`));
// AT4 vs armour
console.log('AT', await p.evaluate(`(()=>{const g=window.__game,a=g.armor().list.find(a=>!a.dead);const P=a.g.position;g.tp(P.x+18,P.z);g.player.equip='at4';const before=a.hp;const after=g.testAT('at4');return [a.kind,before,after,a.dead,!!g.player.inv.at4]})()`)); await p.waitForTimeout(1200); await p.screenshot({ path: '/workspace/defendtaipei-v13-roc-at4.png' });
// repair radio + call support
await p.evaluate(`(()=>{const g=window.__game;g.useItem?g.useItem('rocradio_b'):0})()`);
console.log('radio', await p.evaluate(`[!!window.__game.player.inv.rocradio, !!window.__game.player.inv.rocradio_b]`));
await p.evaluate(`(()=>{const g=window.__game;const q=g.roadPt();g.tp(q[0],q[1]);g.callSupport();g.sim(240)})()`); await p.waitForTimeout(1500); await L('support');
console.log('roc units', await p.evaluate(`window.__game.roc().list.map(u=>u.kind+'@'+u.g.position.toArray().map(Math.round).join(','))`));
await p.evaluate(`(()=>{const g=window.__game,u=g.roc().list[0];g.tp(u.g.position.x+10,u.g.position.z+10)})()`); await p.waitForTimeout(2500);
await p.screenshot({ path: '/workspace/defendtaipei-v13-roc-support.png' });
await p.evaluate(`window.__game.sim(200)`); await p.waitForTimeout(1500); await L('support fire');
await p.screenshot({ path: '/workspace/defendtaipei-v13-roc-support-fire.png' });
// counter-offensive
await p.evaluate(`window.__game.liberate(7)`); await p.waitForTimeout(500); await L('offensive');
await p.evaluate(`(()=>{const g=window.__game;g.sim(120);const u=g.roc().list.find(u=>u.kind==='m1a2t'&&u.life>9000);g.tp(u.g.position.x+12,u.g.position.z+8)})()`); await p.waitForTimeout(2500);
await p.screenshot({ path: '/workspace/defendtaipei-v13-roc-column.png' });
await p.evaluate(`window.__game.liberate(9)`); await p.waitForTimeout(5000);
await p.screenshot({ path: '/workspace/defendtaipei-v13-roc-ending-cine.png' });
await p.waitForFunction(() => document.querySelector('#evacend.win'), null, { timeout: 240000 }); await p.waitForTimeout(1500);
await p.screenshot({ path: '/workspace/defendtaipei-v13-roc-endcard.png' });
console.log('errors', errs); await b.close();
