import { useState, useRef, useEffect } from 'react';
import { useLanguage, LANGS } from '@/lib/i18n';
import { Globe, Check, ChevronDown } from 'lucide-react';

export default function LanguageSwitcher({ variant = 'dark', placement = 'up' }) {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dark = variant === 'dark';
  const current = LANGS.find((l) => l.code === lang) || LANGS[0];
  const btnClass = dark
    ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
    : 'text-slate-700 hover:bg-slate-100';
  const menuClass = dark
    ? 'border-slate-700 bg-slate-800'
    : 'border-slate-200 bg-white';
  const itemClass = dark
    ? 'text-slate-200 hover:bg-slate-700'
    : 'text-slate-700 hover:bg-slate-100';
  const posClass = placement === 'down' ? 'top-full mt-1' : 'bottom-full mb-1';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition ${btnClass}`}
      >
        <Globe className="w-4 h-4" />
        <span>{current.native}</span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>
      {open && (
        <div
          className={`absolute left-0 rtl:right-0 rtl:left-auto ${posClass} w-40 rounded-lg border shadow-lg z-50 overflow-hidden ${menuClass}`}
        >
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm transition ${itemClass}`}
            >
              {l.native}
              {lang === l.code && <Check className="w-4 h-4 text-indigo-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}