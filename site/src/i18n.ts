import fr from './locales/fr.json';
import en from './locales/en.json';

export type Lang = 'fr' | 'en';

const dicts: Record<Lang, Record<string, string>> = { fr, en };

const STORAGE_KEY = 'tmp-lang';

export function currentLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'fr' || stored === 'en') return stored;
  return navigator.language.startsWith('fr') ? 'fr' : 'en';
}

export function t(key: string, lang: Lang = currentLang()): string {
  return dicts[lang][key] ?? dicts.fr[key] ?? key;
}

export function applyLang(lang: Lang): void {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  document.title = t('meta.title', lang);

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n!;
    el.textContent = t(key, lang);
    // Utilisé par l'effet glitch CSS (content: attr(...))
    el.setAttribute('data-i18n-text', t(key, lang));
  });

  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh!, lang);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria!, lang));
  });

  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.textContent = lang === 'fr' ? 'EN' : 'FR';
}

export function initI18n(): void {
  applyLang(currentLang());
  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    applyLang(currentLang() === 'fr' ? 'en' : 'fr');
  });
}
