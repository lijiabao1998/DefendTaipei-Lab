// Worker entry: anonymous auth, room codes, WebSocket upgrade routed to one Durable Object per room.
import { Room } from './room';
export { Room };
export interface Env {
  ROOM: DurableObjectNamespace;
  DB: D1Database;
  ARCHIVE: R2Bucket;
  AUTH_SECRET: string;
  ALLOWED_ORIGINS: string;
}
const enc = new TextEncoder();
async function sign(uid: string, secret: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(uid)));
  return btoa(String.fromCharCode(...s)).replace(/[+/=]/g, c => (c === '+' ? '-' : c === '/' ? '_' : ''));
}
export async function verify(token: string | null, secret: string): Promise<string | null> {
  if (!token) return null;
  const [uid, sig] = token.split('.');
  if (!uid || !sig || !/^[a-z0-9]{12}$/.test(uid)) return null;
  return (await sign(uid, secret)) === sig ? uid : null;
}
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mkCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => CODE[b % CODE.length]).join('');
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin);
    const cors: Record<string, string> = allowed
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        }
      : {};
    const J = (o: unknown, st = 200) =>
      new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json', ...cors } });
    if (origin && !allowed) return J({ error: 'origin not allowed' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 16) return J({ error: 'server not configured' }, 500);
    if (url.pathname === '/api/auth' && req.method === 'POST') {
      // anonymous account: random uid + HMAC token
      const uid = Array.from(
        crypto.getRandomValues(new Uint8Array(12)),
        b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36],
      ).join('');
      await env.DB.prepare('INSERT INTO users (uid, created, last) VALUES (?1, ?2, ?2)').bind(uid, Date.now()).run();
      return J({ uid, token: uid + '.' + (await sign(uid, env.AUTH_SECRET)) });
    }
    const uid = await verify(
      req.headers.get('Authorization')?.replace(/^Bearer /, '') || url.searchParams.get('token'),
      env.AUTH_SECRET,
    );
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      if (!uid) return J({ error: 'auth' }, 401);
      for (let i = 0; i < 5; i++) {
        const code = mkCode();
        const ex = await env.DB.prepare('SELECT code FROM rooms WHERE code = ?1').bind(code).first();
        if (ex) continue;
        const r = await env.ROOM.get(env.ROOM.idFromName(code)).fetch('https://room/init', {
          method: 'POST',
          body: JSON.stringify({ code, by: uid }),
        });
        if (!r.ok) return J({ error: 'init' }, 500);
        return J({ code });
      }
      return J({ error: 'busy' }, 503);
    }
    const m = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{5})(\/ws)?$/);
    if (m) {
      const code = m[1];
      const row = await env.DB.prepare('SELECT players, tick FROM rooms WHERE code = ?1').bind(code).first();
      if (!row) return J({ error: 'no such room' }, 404);
      if (!m[2]) return J({ code, ...row });
      if (!uid) return J({ error: 'auth' }, 401);
      if (req.headers.get('Upgrade') !== 'websocket') return J({ error: 'expected websocket' }, 426);
      const h = new Headers(req.headers);
      h.set('X-UID', uid);
      h.set('X-Code', code);
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(new Request('https://room/ws', { headers: h }));
    }
    return J({ ok: true, service: 'defendtaipei-mp' });
  },
};
