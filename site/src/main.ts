import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';

import { currentLang, initI18n } from './i18n';
import { initForm, prefillClientType, prefillOffer } from './form';
import { initGalleries } from './gallery';
import { initMedia } from './media';

initI18n();
initForm();
initGalleries();
initMedia();


function setBackgroundInert(on: boolean): void {
  document.querySelectorAll<HTMLElement>('body > header, body > main, body > footer, body > .mission-fab').forEach((el) => {
    el.inert = on;
  });
}

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Sphère du hero : léger décalage qui suit la souris (2D seulement, plus léger pour Safari) ---
const sphere = document.querySelector<HTMLElement>('.hero-sphere');
if (sphere && !reduced && window.matchMedia('(pointer: fine)').matches) {
  let tx = 0;
  let ty = 0;
  let frame = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          sphere.style.transform = `translate3d(${tx * 12}px, ${ty * 10}px, 0)`;
        });
      }
    },
    { passive: true }
  );
}

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
    setBackgroundInert(true);
    document.body.style.overflow = 'hidden';
    modal.querySelector<HTMLElement>(focusSel)?.focus();
  };
  const close = (): void => {
    modal.hidden = true;
    setBackgroundInert(false);
    document.body.style.overflow = '';
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

// --- Bouton « Demander une mission » flottant, centré en bas de l'écran ---
// Visible dès que le bouton du hero sort de l'écran, masqué sur la section formulaire.
const fab = document.querySelector<HTMLElement>('.mission-fab');
const heroCta = document.querySelector('.hero-ctas');
const missionSection = document.getElementById('mission');
if (fab && heroCta && missionSection) {
  let heroVisible = true;
  let formVisible = false;
  const sync = (): void => {
    const show = !heroVisible && !formVisible;
    if (show) {
      fab.hidden = false;
      requestAnimationFrame(() => fab.classList.add('is-visible'));
    } else {
      fab.classList.remove('is-visible');
      if (reduced) fab.hidden = true;
    }
  };
  fab.addEventListener('transitionend', () => {
    if (!fab.classList.contains('is-visible')) fab.hidden = true;
  });
  new IntersectionObserver(([e]) => {
    heroVisible = e.isIntersecting;
    sync();
  }).observe(heroCta);
  new IntersectionObserver(([e]) => {
    formVisible = e.isIntersecting;
    sync();
  }, { threshold: 0.15 }).observe(missionSection);
}

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
counters.forEach((el) => (el.textContent = fmt(reduced ? Number(el.dataset.count ?? '0') : 0)));
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
