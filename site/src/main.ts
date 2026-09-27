import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';

import { initScene } from './scene';
import { currentLang, initI18n } from './i18n';
import { initForm, prefillClientType, prefillOffer } from './form';
import { initGalleries } from './gallery';
import { initMedia } from './media';

initI18n();
initForm();
initGalleries();
initMedia();

const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement | null;
if (canvas) initScene(canvas);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function goToForm(): void {
  const form = document.getElementById('mission');
  form?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  window.setTimeout(() => document.getElementById('f-name')?.focus({ preventScroll: true }), reduced ? 0 : 600);
}

// --- Modales (B2B/B2C et mentions légales) ---
function makeModal(id: string, openSel: string, closeSel: string, focusSel: string): { close: () => void } {
  const modal = document.getElementById(id)!;
  let lastFocused: HTMLElement | null = null;
  const open = (): void => {
    lastFocused = document.activeElement as HTMLElement;
    modal.hidden = false;
    modal.querySelector<HTMLElement>(focusSel)?.focus();
  };
  const close = (): void => {
    modal.hidden = true;
    lastFocused?.focus();
  };
  document.querySelectorAll(openSel).forEach((el) => el.addEventListener('click', open));
  document.querySelectorAll(closeSel).forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
  return { close };
}

const clientModal = makeModal('client-modal', '.js-open-modal', '.js-close-modal', '.js-choose');
makeModal('legal-modal', '.js-open-legal', '.js-close-legal', '.modal-close');

document.querySelectorAll<HTMLButtonElement>('.js-choose').forEach((btn) => {
  btn.addEventListener('click', () => {
    prefillClientType(btn.dataset.type as 'B2B' | 'B2C');
    clientModal.close();
    goToForm();
  });
});

// --- Offre « Site vitrine PME » → formulaire pré-rempli ---
document.querySelectorAll('.js-offer').forEach((btn) =>
  btn.addEventListener('click', () => {
    prefillOffer();
    goToForm();
  })
);

// --- Apparition au scroll ---
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.12 }
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

// --- Compteurs des chiffres clés ---
const fmt = (n: number): string => n.toLocaleString(currentLang() === 'fr' ? 'fr-FR' : 'en-US');
const easeOut = (x: number): number => 1 - Math.pow(1 - x, 4);

function animateCount(el: HTMLElement): void {
  const target = Number(el.dataset.count ?? '0');
  const start = performance.now();
  const duration = 1100;
  const tick = (now: number): void => {
    const p = Math.min(1, (now - start) / duration);
    el.textContent = fmt(Math.round(easeOut(p) * target));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const counters = document.querySelectorAll<HTMLElement>('.stat-num');
counters.forEach((el) => (el.textContent = fmt(Number(el.dataset.count ?? '0'))));
if (!reduced) {
  const statObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          animateCount(entry.target as HTMLElement);
          statObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.5 }
  );
  counters.forEach((el) => statObserver.observe(el));
}
document.getElementById('lang-toggle')?.addEventListener('click', () => {
  counters.forEach((el) => (el.textContent = fmt(Number(el.dataset.count ?? '0'))));
});
