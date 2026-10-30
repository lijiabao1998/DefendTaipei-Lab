/** Locale is fixed for a session so labels and data stay consistent. Save IDs never change. */
export type Language = 'zh-TW' | 'en';
export const normalizeLanguage = (value: unknown): Language => (value === 'en' ? 'en' : 'zh-TW');
function readLanguage(): Language {
  try {
    return normalizeLanguage(JSON.parse(localStorage.getItem('dt.settings') || '{}').lang);
  } catch {
    return 'zh-TW';
  }
}
const language = readLanguage();
export const getLanguage = (): Language => language;
export const tr = (zh: string, en: string): string => (language === 'en' ? en : zh);
/** The game can cancel this event when saving/reloading would be unsafe. */
export function requestLanguageChange(value: unknown): boolean {
  const next = normalizeLanguage(value);
  if (next === language) return true;
  if (
    !confirm(
      tr(
        '切換語言需要重新載入。單人遊戲進度會先存檔，確定切換？',
        'Changing language reloads the game. Single-player progress will be saved first. Continue?',
      ),
    )
  )
    return false;
  const detail = { language: next, resume: false };
  const event = new CustomEvent('dt:before-language-change', { cancelable: true, detail });
  if (!dispatchEvent(event)) return false;
  let previous: string | null = null;
  let wrote = false;
  try {
    previous = localStorage.getItem('dt.settings');
    let settings: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(previous || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) settings = parsed;
    } catch {
      /* Recover a corrupt preference blob without touching game progress. */
    }
    localStorage.setItem('dt.settings', JSON.stringify({ ...settings, lang: next }));
    wrote = true;
    if (detail.resume) sessionStorage.setItem('dt.autoload', '1');
  } catch {
    if (wrote) {
      try {
        if (previous === null) localStorage.removeItem('dt.settings');
        else localStorage.setItem('dt.settings', previous);
      } catch {
        /* A storage failure must never trigger a reload. */
      }
    }
    alert(
      tr(
        '無法儲存語言設定，未切換。請確認瀏覽器允許本機儲存。',
        'Language could not be saved. Check that browser storage is enabled.',
      ),
    );
    return false;
  }
  location.reload();
  return true;
}
export function initLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-Hant';
}

/** Static title HTML is localized once; gameplay modules localize at their rendering boundaries. */
export function initTitleLanguage() {
  initLanguage();
  document.title = tr('保衛台北 Defend Taipei — 萬華淪陷區', 'Defend Taipei — Occupied Wanhua');
  const title = document.getElementById('title');
  if (!title) return;
  const h1 = title.querySelector('h1');
  if (h1) h1.textContent = tr('保衛台北', 'Defend Taipei');
  const subtitle = title.querySelector('h2');
  if (subtitle && language === 'en')
    subtitle.textContent = (subtitle.textContent || '').replace(
      '萬華淪陷區 · 生存原型',
      'Occupied Wanhua · Survival prototype',
    );
  const intro = title.querySelector('p');
  if (intro && language === 'en')
    intro.innerHTML =
      'Three days after the PLA landings, Taipei has fallen. Wanhua still has lights and running water, but the utilities are under occupation.<br>You are a survivor hiding in its alleys. Stock up while water and power last, then endure the outages.<br>Scavenge supplies, evade patrols, and reclaim the neighborhood one block at a time.<br><b>Death is permanent.</b>';
  const keys = title.querySelector('.keys');
  if (keys)
    keys.textContent = tr('Esc／☰ 開選單・按鍵可在「設定」中更改', 'Esc / ☰: menu · Change key bindings in Settings');
  const loading = document.getElementById('loadmsg');
  if (loading) loading.textContent = tr('下載程式中…', 'Downloading game…');
  const credit = document.getElementById('credit');
  if (credit)
    credit.textContent = tr(
      '地圖資料 © OpenStreetMap contributors (ODbL)｜虛構作品，人物與部隊番號皆為虛構',
      'Map data © OpenStreetMap contributors (ODbL) | Fictional work; all characters and unit designations are fictional.',
    );
  const switcher = document.createElement('select');
  switcher.id = 'title-language';
  // Loading is not interactive; reveal this only when the title menu is ready.
  switcher.hidden = true;
  switcher.setAttribute('aria-label', tr('語言', 'Language'));
  switcher.innerHTML = '<option value="zh-TW">繁體中文</option><option value="en">English</option>';
  switcher.value = language;
  switcher.onchange = () => {
    if (!requestLanguageChange(switcher.value)) switcher.value = language;
  };
  title.insertBefore(switcher, title.firstChild);
}

export function showTitleLanguage() {
  const switcher = document.getElementById('title-language');
  if (switcher) switcher.hidden = false;
}
