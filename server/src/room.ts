// One Durable Object per room: authoritative 20 Hz simulation (shared core), per-client delta streams,
// reconnect window, D1 autosave and R2 archive on close.
import {
  newState,
  addPlayer,
  applyCmd,
  step,
  diff,
  clone,
  TICK_HZ,
  type State,
  type Cmd,
} from '../../src/core/sim/core';
import type { Env } from './index';
type Conn = { ws: WebSocket; uid: string; ack: number; rate: number; rateT: number; ready: boolean };
const HIST = 80,
  GRACE_MS = 60_000;
export class Room {
  s: State | null = null;
  code = '';
  conns = new Map<WebSocket, Conn>();
  hist = new Map<number, State>();
  timer: any = null;
  leftAt = new Map<string, number>();
  lastSave = 0;
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}
  async load(code: string) {
    if (this.s) return;
    this.code = code;
    const row = await this.env.DB.prepare('SELECT state FROM rooms WHERE code = ?1')
      .bind(code)
      .first<{ state: string }>();
    if (row) {
      this.s = JSON.parse(row.state);
      for (const p of Object.values(this.s!.players)) p.on = false;
    }
  }
  async save() {
    if (!this.s) return;
    const n = Object.values(this.s.players).filter(p => p.on).length;
    await this.env.DB.prepare(
      'INSERT INTO rooms (code, tick, state, players, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?5) ON CONFLICT(code) DO UPDATE SET tick = ?2, state = ?3, players = ?4, updated = ?5',
    )
      .bind(this.code, this.s.tick, JSON.stringify(this.s), n, Date.now())
      .run();
    this.lastSave = this.s.tick;
  }
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      const { code } = await req.json<{ code: string }>();
      this.code = code;
      this.s = newState([...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0, 0, 0, 10);
      await this.save();
      return new Response('ok');
    }
    if (url.pathname === '/ws') {
      const uid = req.headers.get('X-UID')!,
        code = req.headers.get('X-Code')!;
      await this.load(code);
      if (!this.s) return new Response('no room', { status: 404 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      const c: Conn = { ws: server, uid, ack: -1, rate: 0, rateT: Date.now(), ready: false };
      this.conns.set(server, c);
      server.addEventListener('message', ev => this.onMsg(c, ev.data as string));
      const bye = () => {
        this.conns.delete(server);
        if (![...this.conns.values()].some(o => o.uid === uid)) {
          const p = this.s?.players[uid];
          if (p) {
            p.on = false;
            this.leftAt.set(uid, Date.now());
            this.s!.log.push(`${p.name} 斷線了`);
          }
        }
      };
      server.addEventListener('close', bye);
      server.addEventListener('error', bye);
      this.ensureTick();
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }
  onMsg(c: Conn, raw: string) {
    const s = this.s!;
    if (typeof raw !== 'string' || raw.length > 2048) return c.ws.close(1009, 'too big');
    const now = Date.now();
    if (now - c.rateT > 1000) {
      c.rate = 0;
      c.rateT = now;
    }
    if (++c.rate > 60) return; // server-side rate limit
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.k === 'hello') {
      for (const [ws, o] of this.conns)
        if (o.uid === c.uid && ws !== c.ws) {
          try {
            ws.close(4000, 'replaced');
          } catch {}
          this.conns.delete(ws);
        }
      const err = addPlayer(
        s,
        c.uid,
        String(m.name || '倖存者'),
        String(m.role || 'office').slice(0, 12),
        m.g === 'f' ? 'f' : 'm',
        +m.x || 0,
        +m.z || 0,
      );
      if (err) {
        c.ws.send(JSON.stringify({ k: 'err', e: err }));
        return c.ws.close(4001, err);
      }
      c.ready = true;
      this.leftAt.delete(c.uid);
      c.ack = -1;
      c.ws.send(JSON.stringify({ k: 'snap', tick: s.tick, you: c.uid, code: this.code, s }));
      return;
    }
    if (!c.ready) return;
    if (m.k === 'ack' && typeof m.tick === 'number') {
      c.ack = m.tick;
      return;
    }
    if (m.k === 'cmd' && m.c && typeof m.c.t === 'string') {
      const r = applyCmd(s, c.uid, m.c as Cmd);
      if (r && r !== 'stale') c.ws.send(JSON.stringify({ k: 'rej', seq: m.c.seq, why: r }));
    }
  }
  ensureTick() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
  }
  async tick() {
    const s = this.s;
    if (!s) return;
    step(s);
    const now = Date.now();
    for (const [uid, t] of this.leftAt)
      if (now - t > GRACE_MS) {
        delete s.players[uid];
        this.leftAt.delete(uid);
      }
    this.hist.set(s.tick, clone(s));
    this.hist.delete(s.tick - HIST);
    for (const c of this.conns.values()) {
      if (!c.ready) continue;
      const base = this.hist.get(c.ack);
      try {
        c.ws.send(
          JSON.stringify(
            base
              ? { ...diff(base, s), ack: s.players[c.uid]?.ack }
              : { k: 'snap', tick: s.tick, you: c.uid, code: this.code, s },
          ),
        );
      } catch {}
    }
    if (s.tick - this.lastSave >= 200) this.save();
    if (!this.conns.size && !Object.values(s.players).some(p => p.on) && this.leftAt.size === 0) {
      clearInterval(this.timer);
      this.timer = null;
      await this.save();
      await this.env.ARCHIVE.put(`rooms/${this.code}/${s.tick}.json`, JSON.stringify(s));
    }
  }
}
