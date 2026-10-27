/** v22.7 portrait touch controls: short label for the context action button, derived from the HUD prompt */
const MAP: [RegExp, string][] = [
  [/搜刮|翻找|搜/, '搜'],
  [/關門/, '關門'],
  [/開門|撬/, '開門'],
  [/爬上/, '爬上'],
  [/下樓|爬下|下到/, '下樓'],
  [/下車/, '下車'],
  [/騎|開車|上車|^開/, '上車'],
  [/捷運|進站|搭乘|月台|回地面/, '捷運'],
  [/避難所/, '避難'],
  [/購|買|商店|交易|換/, '交易'],
  [/交談|對話|聯絡人|說話/, '交談'],
  [/撿|拿/, '撿'],
];
/** prompt like "[E] 搜刮 便利商店｜[B] 封門" → "搜"; null when nothing interactable */
export function ctxLabel(prompt: string, key: string): string | null {
  const pre = `[${key}]`;
  if (!prompt.startsWith(pre)) return null;
  const t = prompt.slice(pre.length).trim().split(/[｜|]/)[0];
  for (const [re, l] of MAP) if (re.test(t)) return l;
  return t.replace(/[（(].*$/, '').slice(0, 2) || '互動';
}
/** the prompt text without the bound key, for the small hint over the button */
export const ctxHint = (prompt: string, key: string) =>
  prompt.startsWith(`[${key}]`)
    ? prompt
        .slice(key.length + 2)
        .split(/[｜|]/)[0]
        .trim()
    : '';
