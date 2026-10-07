// Languages. The English text itself is the key: t("enter") looks "enter" up in
// the player's language and falls back to English when a line isn't translated.
// Values can carry {placeholders}: t("+{n} ◈", { n: 5 }).
// Dictionaries live in src/i18n/<code>.json and load only when picked.
// Picked from the browser on the first visit; changeable on the entry screen
// and in settings (localStorage `seeface-lang`).
// Only the interface is translated: the world itself (posters, signs, the
// leaked pages, names of people) stays as it is for everyone.
import { useEffect, useState } from "react";

export const LANGS: { code: string; name: string; rtl?: boolean }[] = [
  { code: "en", name: "English" },
  { code: "uk", name: "Українська" },
  { code: "ru", name: "Русский" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pl", name: "Polski" },
  { code: "tr", name: "Türkçe" },
  { code: "nl", name: "Nederlands" },
  { code: "sv", name: "Svenska" },
  { code: "cs", name: "Čeština" },
  { code: "ro", name: "Română" },
  { code: "el", name: "Ελληνικά" },
  { code: "hu", name: "Magyar" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" },
  { code: "hi", name: "हिन्दी" },
  { code: "ar", name: "العربية", rtl: true },
  { code: "he", name: "עברית", rtl: true },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "th", name: "ไทย" },
];

const KEY = "seeface-lang";
const files = import.meta.glob<{ default: Record<string, string> }>("./i18n/*.json");

let code = "en";
let dict: Record<string, string> = {};
const listeners = new Set<() => void>();

const known = (c: string | null | undefined) => (c && LANGS.some((l) => l.code === c) ? c : null);

/** saved choice, else the browser's languages, else English */
export function detectLang() {
  try {
    const saved = known(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    // ignore
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const c = known(l?.toLowerCase().split("-")[0]);
    if (c) return c;
  }
  return "en";
}

export const lang = () => code;
export const isRtl = () => LANGS.some((l) => l.code === code && l.rtl);

export async function setLang(next: string, save = true) {
  const c = known(next) ?? "en";
  if (save) {
    try {
      localStorage.setItem(KEY, c);
    } catch {
      // ignore
    }
  }
  let d: Record<string, string> = {};
  if (c !== "en") {
    const load = files[`./i18n/${c}.json`];
    try {
      if (load) d = (await load()).default;
    } catch {
      // offline or missing: English
    }
  }
  code = c;
  dict = d;
  document.documentElement.lang = c;
  listeners.forEach((f) => f());
}

export function t(en: string, vars?: Record<string, string | number>) {
  let s = dict[en] || en;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** re-render a component when the language changes */
export function useLang() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return code;
}

// start loading straight away
void setLang(detectLang(), false);
