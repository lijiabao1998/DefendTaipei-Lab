import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
// Writes dist/sw.js with a precache list + a cache version derived from the build output, so every deploy invalidates the old cache.
const sw = (): Plugin => ({
  name: 'dt-sw',
  apply: 'build',
  generateBundle(_o, bundle) {
    const files = Object.keys(bundle).filter(f => !f.endsWith('.map'));
    const core = [
      './',
      'index.html',
      'manifest.webmanifest',
      'data/wanhua.json',
      'icons/icon-192.png',
      'icons/icon-512.png',
      ...files.filter(f => f !== 'index.html'),
    ];
    const ver = createHash('sha1').update(files.sort().join('|')).digest('hex').slice(0, 10);
    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: `const V='dt-${ver}',CORE=${JSON.stringify(core)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('dt-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 if(r.mode==='navigate'){e.respondWith(fetch(r,{cache:'no-store'}).then(x=>{const y=x.clone();caches.open(V).then(c=>c.put('index.html',y));return x}).catch(()=>caches.match('index.html',{ignoreVary:true})));return}
 e.respondWith(caches.match(r,{ignoreVary:true,ignoreSearch:true}).then(h=>h||fetch(r).then(x=>{if(x.ok){const y=x.clone();caches.open(V).then(c=>c.put(r,y))}return x})))});
`,
    });
  },
});
export default defineConfig({
  base: '/',
  plugins: [sw()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: id => (id.includes('node_modules/three/') ? 'three' : undefined) } },
  },
});
