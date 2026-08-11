import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import './styles.css';

import { initScene } from './scene';
import { initI18n } from './i18n';
import { initForm, prefillClientType } from './form';
import { initGalleries } from './gallery';

initI18n();
initForm();
initGalleries();

const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement | null;
if (canvas) initScene(canvas);

// --- Modal B2B / B2C ---
const modal = document.getElementById('client-modal')!;
let lastFocused: HTMLElement | null = null;

function openModal(): void {
  lastFocused = document.activeElement as HTMLElement;
  modal.hidden = false;
  modal.querySelector<HTMLButtonElement>('.js-choose')?.focus();
}

function closeModal(): void {
  modal.hidden = true;
  lastFocused?.focus();
}

document.querySelectorAll('.js-open-modal').forEach((btn) => btn.addEventListener('click', openModal));
document.querySelectorAll('.js-close-modal').forEach((btn) => btn.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

document.querySelectorAll<HTMLButtonElement>('.js-choose').forEach((btn) => {
  btn.addEventListener('click', () => {
    prefillClientType(btn.dataset.type as 'B2B' | 'B2C');
    closeModal();
    document.getElementById('mission')?.scrollIntoView({ behavior: 'smooth' });
  });
});

// --- Reveal au scroll ---
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.15 }
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

// --- Compteurs animés des stats ---
const easeOut = (x: number): number => 1 - Math.pow(1 - x, 4);

function animateCount(el: HTMLElement): void {
  const target = Number(el.dataset.count ?? '0');
  const start = performance.now();
  const duration = 1200;
  function tick(now: number): void {
    const p = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(easeOut(p) * target));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const statObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        animateCount(entry.target as HTMLElement);
        statObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.4 }
);
document.querySelectorAll<HTMLElement>('.stat-num').forEach((el) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = el.dataset.count ?? '0';
  } else {
    statObserver.observe(el);
  }
});
