// v22.4 shared modal screens: 設定 (volume / 畫質 / language / sensitivity / vibration / key rebinding),
// 操作說明 and 製作名單. Used from the title menu and the in-game pause menu.
import { SET, saveSettings, ACTIONS, BIND, keyName, rebind, resetKeys, type Quality } from './settings';

let modal: HTMLElement | null = null;
let capture: ((e: KeyboardEvent) => void) | null = null;
export const modalOpen = () => !!modal;
export function closeModal() {
  if (capture) (removeEventListener('keydown', capture, true), (capture = null));
  modal?.remove();
  modal = null;
}
function open(title: string, html: string) {
  closeModal();
  modal = document.createElement('div');
  modal.id = 'modal';
  modal.innerHTML = `<div class="mbox"><h3>${title}</h3><div class="mbody">${html}</div><button class="mclose">返回（Esc）</button></div>`;
  (modal.querySelector('.mclose') as HTMLElement).onclick = closeModal;
  document.body.appendChild(modal);
  return modal;
}
const pct = (v: number) => Math.round(v * 100);

export function openSettings() {
  const sl = (k: 'master' | 'sfx' | 'music', t: string) =>
    `<label class="srow"><span>${t}</span><input type="range" min="0" max="100" data-k="${k}" value="${pct(SET[k])}"><i>${pct(SET[k])}</i></label>`;
  const m = open(
    '⚙ 設定',
    `<h4>音量</h4>${sl('master', '主音量')}${sl('sfx', '音效')}${sl('music', '環境音／音樂')}
    <h4>畫面</h4><label class="srow"><span>畫質</span><select id="squal">${(['low', 'med', 'high'] as Quality[])
      .map(
        q =>
          `<option value="${q}"${SET.quality === q ? ' selected' : ''}>${{ low: '低', med: '中', high: '高' }[q]}</option>`,
      )
      .join('')}</select><i>材質解析度於重新載入後生效</i></label>
    <label class="srow"><span>語言</span><select id="slang"><option value="zh-TW" selected>繁體中文</option><option disabled>English（即將推出）</option></select></label>
    <h4>操作</h4><label class="srow"><span>滑鼠靈敏度</span><input type="range" min="25" max="300" id="ssens" value="${pct(SET.sens)}"><i>${pct(SET.sens)}%</i></label>
    <label class="srow"><span>震動（手機）</span><input type="checkbox" id="svib"${SET.vib ? ' checked' : ''}></label>
    <h4>按鍵設定 <button id="kreset">恢復預設</button></h4><em id="kmsg">點按鍵再按下新的鍵；Esc 取消。重複的鍵會自動互換。</em><div id="klist"></div>`,
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
  (m.querySelector('#svib') as HTMLInputElement).onchange = e => {
    SET.vib = (e.target as HTMLInputElement).checked;
    saveSettings();
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
    <table class="ktab"><tr><th colspan="2">手機</th></tr><tr><td>左下搖桿</td><td>移動（推到底奔跑）</td></tr><tr><td>搜</td><td>搜刮／互動</td></tr><tr><td>打</td><td>攻擊最近目標（按住連射）</td></tr><tr><td>撤</td><td>撤退／找掩體</td></tr><tr><td>🛡</td><td>掩體</td></tr><tr><td>☰</td><td>選單（暫停）</td></tr></table>
    <p class="mnote">按鍵可在「設定 → 按鍵設定」中更改。</p>`,
  );
}

export function openAbout() {
  open(
    '📜 製作名單／關於',
    `<p><b>保衛台北 Defend Taipei — 萬華淪陷區</b></p>
    <p>虛構的諷刺生存遊戲。人物、部隊番號、商店與品牌皆為虛構，如有雷同純屬巧合。</p>
    <p>地圖資料 © OpenStreetMap contributors（ODbL）<br>引擎：three.js・TypeScript・Vite<br>所有材質與音效皆為程式即時生成。</p>
    <p>設計與開發：DefendTaipei-Lab</p>`,
  );
}
