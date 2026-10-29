import fs from 'node:fs';
import assert from 'node:assert/strict';
import {launch,shot,preview} from './lib.mjs';
const mobile=process.env.MODE==='mobile', name=mobile?'mobile':'desktop';
const report={name,checks:[],errors:[],limitations:['Touch emulation, not a physical phone. Debug teleport/time used for contextual and night scenes.']};
const server=await preview(4191),browser=await launch();
const check=(v,label)=>{report.checks.push({label,passed:!!v});assert.ok(v,label);};
try{
const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});
await ctx.addInitScript(()=>localStorage.setItem('dt.settings',JSON.stringify({quality:'low'})));
const p=await ctx.newPage();p.setDefaultTimeout(120000);p.on('pageerror',e=>report.errors.push(String(e)));
const snap=async label=>p.screenshot({path:shot(`${name}-${label}.png`),timeout:120000});
await p.goto(server.url);await p.waitForFunction(()=>window.__newGame,null,{timeout:600000,polling:500});
await p.locator('#tmenu [data-a="new"]').click();await snap('roles-top');
check(await p.locator('#title h1').evaluate(e=>e.getBoundingClientRect().top>=0),'role heading not clipped');
const last=p.locator('.ch').last();await last.scrollIntoViewIfNeeded();await snap('roles-bottom');
report.lastRole=await last.evaluate(e=>({text:e.innerText,rect:e.getBoundingClientRect().toJSON()}));
check(report.lastRole.rect.top>=0 && report.lastRole.rect.bottom<=(mobile?844:800),'last role card reachable');
await p.locator('#skipintro').check();await p.locator('.ch[data-r="nurse"]').click();if(mobile)await p.locator('#startgo').click();
await p.waitForFunction(()=>window.__game.started(),null,{timeout:600000});await p.waitForTimeout(1800);await snap('day');
if(mobile){await p.locator('#menubtn').tap();await p.locator('#pmenu [data-a="inv"]').tap();}else await p.keyboard.press('Tab');
await snap('inventory');check(await p.locator('body').evaluate(e=>e.classList.contains('inventory-open')),'inventory state active');
if(mobile){for(const id of ['joy','pbtns','mkeys','equip'])check(await p.locator('#'+id).evaluate(e=>getComputedStyle(e).display==='none'),'inventory hides '+id);}
const close=p.locator('#panel button').filter({hasText:mobile?'關閉背包':'關閉 (Esc)'});check(await close.count()===1,'correct inventory close label');await close.click();
check(await p.locator('body').evaluate(e=>!e.classList.contains('inventory-open')),'inventory closes');
if(mobile){
await p.evaluate(()=>{const g=window.__game;const b=g.blds.find(b=>b.detailed==='store');const c=g.conts.find(c=>c.b===b);g.tp(c.p[0]+.3,c.p[1]+.3);});
await p.waitForFunction(()=>document.querySelector('#pbact').dataset.mode==='ctx',null,{timeout:120000});
const b=await p.locator('#pbact').boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();
check(await p.locator('#pbact').evaluate(e=>e.classList.contains('holding')),'long press progress begins');await snap('longpress');
await p.waitForTimeout(450);check(await p.locator('#pbact').evaluate(e=>e.classList.contains('hold-ready')),'long press threshold reached');await p.mouse.up();
check(await p.locator('#pbact').evaluate(e=>!e.classList.contains('holding')&&!e.classList.contains('hold-ready')),'long press release clears');
await p.mouse.down();await p.locator('#pbact').dispatchEvent('pointercancel');await p.mouse.up();check(await p.locator('#pbact').evaluate(e=>!e.classList.contains('holding')&&!e.classList.contains('hold-ready')),'cancel clears feedback');
}
await p.evaluate(()=>window.__game.setTime(22*60));await p.waitForTimeout(1500);await snap('night');
check(report.errors.length===0,'no page errors');report.status='passed';await ctx.close();
}catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}finally{await browser.close();server.stop();fs.writeFileSync(shot(`${name}-report.json`),JSON.stringify(report,null,2));}
