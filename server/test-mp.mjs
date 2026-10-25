// Local multiplayer integration test against `wrangler dev` (no Cloudflare account): auth, room code, 4 players, 5th rejected,
// delta stream, speed-hack clamp, contested loot, reconnect, D1 save.
import WebSocket from 'ws';
const B = process.argv[2] || 'http://localhost:8787'; const W = B.replace('http', 'ws'); const out = {};
const post = async (p, tok) => (await fetch(B + p, { method: 'POST', headers: tok ? { Authorization: 'Bearer ' + tok } : {} })).json();
const users = []; for (let i = 0; i < 5; i++) users.push(await post('/api/auth'));
const { code } = await post('/api/rooms', users[0].token); out.code = code;
out.noauth = (await fetch(`${B}/api/rooms/${code}/ws`)).status; out.badroom = (await fetch(`${B}/api/rooms/ZZZZZ`)).status;
function join(u, name, x = 0) { return new Promise((res) => { const ws = new WebSocket(`${W}/api/rooms/${code}/ws?token=${u.token}`); const c = { ws, msgs: 0, bytes: 0, deltas: 0, snaps: 0, rej: [], err: null, s: null, seq: 0, closed: null };
  ws.on('open', () => ws.send(JSON.stringify({ k: 'hello', name, role: 'courier', g: 'm', x, z: 0 })));
  ws.on('message', d => { const m = JSON.parse(d); c.msgs++; c.bytes += d.length; if (m.k === 'snap') { c.snaps++; c.s = m.s; res(c); } if (m.k === 'delta') c.deltas++; if (m.k === 'rej') c.rej.push(m.why); if (m.k === 'err') { c.err = m.e; res(c); } if (m.tick !== undefined) ws.send(JSON.stringify({ k: 'ack', tick: m.tick })); });
  ws.on('close', (cd) => { c.closed = cd; res(c); }); }); }
const cs = []; for (let i = 0; i < 4; i++) cs.push(await join(users[i], 'P' + i, i * 2));
const fifth = await join(users[4], 'P4'); out.fifth = fifth.err || fifth.closed;
await new Promise(r => setTimeout(r, 1500));
const cmd = (c, o) => c.ws.send(JSON.stringify({ k: 'cmd', c: { seq: ++c.seq, ...o } }));
cmd(cs[0], { t: 'move', x: 80, z: 0 }); // speed hack
cmd(cs[1], { t: 'loot', id: 'b12_0', x: 2, z: 0 }); cmd(cs[2], { t: 'loot', id: 'b12_0', x: 4, z: 0 }); // contested loot (P2 too far + taken)
cmd(cs[3], { t: 'attack', target: 0 });
await new Promise(r => setTimeout(r, 1500));
out.rejects = cs.map(c => c.rej); out.stream = cs.map(c => ({ snaps: c.snaps, deltas: c.deltas, avgBytes: Math.round(c.bytes / c.msgs) }));
// reconnect P1 with same token
cs[1].ws.close(); await new Promise(r => setTimeout(r, 800)); const re = await join(users[1], 'P1', 2); out.reconnect = { snap: re.snaps, players: Object.keys(re.s.players).length, sameId: !!re.s.players[users[1].uid], looted: re.s.looted };
await new Promise(r => setTimeout(r, 11000)); out.info = await (await fetch(`${B}/api/rooms/${code}`)).json();
for (const c of [...cs, re]) c.ws.close(); console.log(JSON.stringify(out, null, 1)); process.exit(0);
