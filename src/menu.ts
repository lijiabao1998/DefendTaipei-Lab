// v22.4 shared modal screens: 設定 (volume / 畫質 / language / sensitivity / vibration / key rebinding),
// 操作說明 and 製作名單. Used from the title menu and the in-game pause menu.
import { SET, saveSettings, ACTIONS, BIND, keyName, rebind, resetKeys, applyBtnSize, type Quality } from './settings';
import { VERSION } from './version';

/** touch device (phone / tablet): no Esc key, no mouse */
export const TOUCH =
  typeof matchMedia !== 'undefined' && (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window);

// ---- v22.7.1 Android back button: every overlay we open pushes a history entry; Back pops the top overlay
let hDepth = 0,
  hSkip = 0;
let onBack: () => void = () => {};
export const setBackHandler = (f: () => void) => (onBack = f);
export function histPush() {
  if (!TOUCH) return;
  hDepth++;
  history.pushState({ dtOverlay: hDepth }, '');
}
/** call when an overlay is closed from the UI (not by Back) so the extra history entry is dropped */
export function histPop() {
  if (!TOUCH || hDepth <= 0) return;
  hDepth--;
  hSkip++;
  history.back();
}
addEventListener('popstate', () => {
  if (hSkip > 0) return void hSkip--;
  if (hDepth <= 0) return;
  hDepth--;
  onBack();
});

let modal: HTMLElement | null = null;
let capture: ((e: KeyboardEvent) => void) | null = null;
export const modalOpen = () => !!modal;
/** fromBack: closed by the Android Back button (history entry already gone) */
export function closeModal(fromBack = false) {
  if (capture) (removeEventListener('keydown', capture, true), (capture = null));
  if (!modal) return;
  modal.remove();
  modal = null;
  if (!fromBack) histPop();
}
function open(title: string, html: string) {
  const had = !!modal;
  if (had) {
    if (capture) (removeEventListener('keydown', capture, true), (capture = null));
    modal!.remove();
  }
  modal = document.createElement('div');
  modal.id = 'modal';
  modal.innerHTML =
    `<div class="mbox"><div class="mhead"><h3>${title}</h3><button class="mx" aria-label="返回">✕ 返回</button></div>` +
    `<div class="mbody">${html}</div><button class="mclose">返回${TOUCH ? '' : '（Esc）'}</button></div>`;
  (modal.querySelector('.mclose') as HTMLElement).onclick = () => closeModal();
  (modal.querySelector('.mx') as HTMLElement).onclick = () => closeModal();
  // tap on the backdrop (outside the box) closes
  modal.addEventListener('click', e => e.target === modal && closeModal());
  document.body.appendChild(modal);
  if (!had) histPush();
  return modal;
}
/** v23.1 generic read-only panel (收音機紀錄) */
export const openPanel = (title: string, html: string) => open(title, html);
const pct = (v: number) => Math.round(v * 100);

export function openSettings() {
  const sl = (k: 'master' | 'sfx' | 'music' | 'radio', t: string) =>
    `<label class="srow"><span>${t}</span><input type="range" min="0" max="100" data-k="${k}" value="${pct(SET[k])}"><i>${pct(SET[k])}</i></label>`;
  const m = open(
    '⚙ 設定',
    `<h4>音量</h4>${sl('master', '主音量')}${sl('sfx', '音效')}${sl('music', '環境音／音樂')}${sl('radio', '廣播')}
    <label class="srow"><span>廣播語音</span><input type="checkbox" id="svoice"${SET.voice ? ' checked' : ''}><i>收音機廣播以合成語音朗讀</i></label>
    <h4>畫面</h4><label class="srow"><span>畫質</span><select id="squal">${(['low', 'med', 'high'] as Quality[])
      .map(
        q =>
          `<option value="${q}"${SET.quality === q ? ' selected' : ''}>${{ low: '低', med: '中', high: '高' }[q]}</option>`,
      )
      .join('')}</select><i>材質解析度於重新載入後生效</i></label>
    <label class="srow"><span>語言</span><select id="slang"><option value="zh-TW" selected>繁體中文</option><option disabled>English（即將推出）</option></select></label>
    <h4>操作</h4>${
      TOUCH
        ? `<label class="srow"><span>震動回饋</span><input type="checkbox" id="svib"${SET.vib ? ' checked' : ''}></label>
    <label class="srow"><span>按鈕大小</span><select id="sbtn">${[
      [0.85, '小'],
      [1, '標準'],
      [1.1, '大'],
    ]
      .map(([v, t]) => `<option value="${v}"${SET.btn === v ? ' selected' : ''}>${t}</option>`)
      .join('')}</select></label>
    <details class="kdet"><summary>外接鍵盤／滑鼠設定</summary>`
        : ''
    }<label class="srow"><span>滑鼠靈敏度</span><input type="range" min="25" max="300" id="ssens" value="${pct(SET.sens)}"><i>${pct(SET.sens)}%</i></label>
    ${TOUCH ? '' : `<label class="srow"><span>震動（手機）</span><input type="checkbox" id="svib"${SET.vib ? ' checked' : ''}></label>`}
    <h4>按鍵設定 <button id="kreset">恢復預設</button></h4><em id="kmsg">點按鍵再按下新的鍵；Esc 取消。重複的鍵會自動互換。</em><div id="klist"></div>${
      TOUCH ? '</details>' : ''
    }`,
  );
  m.querySelectorAll('input[type=range][data-k]').forEach(el => {
    const i = el as HTMLInputElement;
    i.oninput = () => {
      SET[i.dataset.k as 'master'] = +i.value / 100;
      (i.nextElementSibling as HTMLElement).textContent = i.value;
      saveSettings();
    };
  });
  (m.querySelector('#squal') as HTMLSelectElement).onchange = e => {
    SET.quality = (e.target as HTMLSelectElement).value as Quality;
    saveSettings();
  };
  const sens = m.querySelector('#ssens') as HTMLInputElement;
  sens.oninput = () => {
    SET.sens = +sens.value / 100;
    (sens.nextElementSibling as HTMLElement).textContent = sens.value + '%';
    saveSettings();
  };
  (m.querySelector('#svoice') as HTMLInputElement).onchange = e => {
    SET.voice = (e.target as HTMLInputElement).checked;
    saveSettings();
    if (!SET.voice) speechSynthesis?.cancel();
  };
  (m.querySelector('#svib') as HTMLInputElement).onchange = e => {
    SET.vib = (e.target as HTMLInputElement).checked;
    saveSettings();
  };
  const sb = m.querySelector('#sbtn') as HTMLSelectElement | null;
  if (sb)
    sb.onchange = () => {
      SET.btn = +sb.value;
      saveSettings();
      applyBtnSize();
    };
  const msg = m.querySelector('#kmsg') as HTMLElement;
  const draw = () => {
    const kl = m.querySelector('#klist') as HTMLElement;
    kl.innerHTML = ACTIONS.map(
      ([a, t]) => `<div class="krow"><span>${t}</span><button data-a="${a}">${keyName(BIND[a])}</button></div>`,
    ).join('');
    kl.querySelectorAll('button').forEach(
      b =>
        ((b as HTMLElement).onclick = () => {
          if (capture) return;
          b.textContent = '按下新按鍵…';
          b.classList.add('wait');
          capture = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            removeEventListener('keydown', capture!, true);
            capture = null;
            if (e.code !== 'Escape') {
              const a = (b as HTMLElement).dataset.a!;
              const sw = rebind(a, e.code);
              const lab = (x: string) => ACTIONS.find(q => q[0] === x)![1];
              msg.textContent = sw
                ? `${keyName(e.code)} 原本是「${lab(sw)}」，已與「${lab(a)}」互換。`
                : `「${lab(a)}」= ${keyName(e.code)}`;
            }
            draw();
          };
          addEventListener('keydown', capture, true);
        }),
    );
  };
  (m.querySelector('#kreset') as HTMLElement).onclick = () => {
    resetKeys();
    msg.textContent = '已恢復預設按鍵。';
    draw();
  };
  draw();
}

export function openHelp() {
  const rows = ACTIONS.map(([a, t]) => `<tr><td>${keyName(BIND[a])}</td><td>${t}</td></tr>`).join('');
  open(
    '🎮 操作說明',
    `<table class="ktab"><tr><th colspan="2">鍵盤＋滑鼠</th></tr>${rows}
    <tr><td>滑鼠</td><td>瞄準</td></tr><tr><td>左鍵</td><td>攻擊／射擊</td></tr><tr><td>滾輪</td><td>縮放</td></tr><tr><td>Esc</td><td>關閉視窗／選單（暫停）</td></tr></table>
    <table class="ktab"><tr><th colspan="2">手機</th></tr><tr><td>下方搖桿</td><td>移動（推到底奔跑）</td></tr><tr><td>大圓鈕</td><td>打（按住連續攻擊）；靠近可互動的東西時變成 搜／開門／爬上／上車…，點一下互動、長按攻擊；狙擊槍時是「瞄」：按住開鏡、拖曳瞄準、放開射擊</td></tr><tr><td>蹲</td><td>貼牆掩體或潛行；再點起身；長按撤退；開鏡時 ✕ 關鏡</td></tr><tr><td>武器欄 ⇄</td><td>切換武器</td></tr><tr><td>☰ ／ 🗺</td><td>選單（暫停、背包、存檔）／地圖</td></tr><tr><td>返回鍵</td><td>關閉視窗／選單</td></tr></table>
    <p class="mnote">按鍵可在「設定 → 按鍵設定」中更改。</p>`,
  );
}

export function openAbout() {
  open(
    '📜 製作名單／關於',
    `<p><b>保衛台北 Defend Taipei — 萬華淪陷區</b>　${VERSION}</p>
    <p>虛構的諷刺生存遊戲。人物、部隊番號、商店與品牌皆為虛構，如有雷同純屬巧合。</p>
    <p>地圖資料 © OpenStreetMap contributors（ODbL）<br>引擎：three.js・TypeScript・Vite<br>所有材質與音效皆為程式即時生成。</p>
    <p>設計與開發：DefendTaipei-Lab</p>`,
  );
}
