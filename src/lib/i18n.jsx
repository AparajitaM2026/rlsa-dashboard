import { createContext, useState, useContext, useEffect } from 'react';
import translations from '@/lib/translations';

export const LANGS = [
  { code: 'en', native: 'English', dir: 'ltr' },
  { code: 'ar', native: 'العربية', dir: 'rtl' },
  { code: 'fr', native: 'Français', dir: 'ltr' }
];

// Module-level current language so non-hook code (e.g. formatMonthLabel) can translate.
let currentLang = 'en';

export function translate(key, vars) {
  const str =
    (translations[currentLang] && translations[currentLang][key]) ||
    (translations.en && translations.en[key]) ||
    key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
}

export function getCurrentLang() {
  return currentLang;
}

const LangContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('lang') || 'en';
    } catch {
      return 'en';
    }
  });

  // Sync module-level currentLang during render so non-hook code (e.g.
  // formatMonthLabel) and this render agree on the language immediately.
  currentLang = lang;

  useEffect(() => {
    try {
      localStorage.setItem('lang', lang);
    } catch {
      /* ignore */
    }
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [lang]);

  // t closes over `lang` so it reflects the freshly selected language on the
  // re-render triggered by setLang. Relying on the module-level currentLang
  // alone would lag by one render (it's only updated as a side effect), which
  // is why switching language changed alignment but not the text.
  const t = (key, vars) => {
    const str =
      (translations[lang] && translations[lang][key]) ||
      (translations.en && translations.en[key]) ||
      key;
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
  };

  const value = {
    lang,
    setLang,
    t,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    isRTL: lang === 'ar'
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LangContext);
  if (!ctx) return { lang: 'en', setLang: () => {}, t: translate, dir: 'ltr', isRTL: false };
  return ctx;
}