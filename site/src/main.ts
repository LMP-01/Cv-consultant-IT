import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';

import { currentLang, initI18n, t } from './i18n';
import { initForm } from './form';
import { initGalleries } from './gallery';
import { initMedia } from './media';
import { chooseClient, focusTarget, initWizard, presetOffer, startCall, startMission } from './wizard';

initI18n();
initForm();
initGalleries();
initMedia();
initWizard();


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

// --- Modales (B2B/B2C et mentions légales) ---
function makeModal(
  id: string,
  openSel: string,
  closeSel: string,
  focusSel: string | (() => HTMLElement | null)
): { open: () => void; close: () => void } {
  const modal = document.getElementById(id)!;
  let lastFocused: HTMLElement | null = null;
  const open = (): void => {
    lastFocused = document.activeElement as HTMLElement;
    modal.hidden = false;
    setBackgroundInert(true);
    document.body.style.overflow = 'hidden';
    (typeof focusSel === 'string' ? modal.querySelector<HTMLElement>(focusSel) : focusSel())?.focus();
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
  return { open, close };
}

// Choisit le parcours avant l'ouverture : « Réserver un appel » (data-start="call") ou demande de mission.
document.querySelectorAll<HTMLElement>('.js-open-modal').forEach((el) =>
  el.addEventListener('click', () => (el.dataset.start === 'call' ? startCall() : startMission()))
);
const clientModal = makeModal('client-modal', '.js-open-modal', '.js-close-modal', focusTarget);
makeModal('legal-modal', '.js-open-legal', '.js-close-legal', '.modal-close');
const offerModal = makeModal('offer-modal', '.js-offer-details', '.js-close-offer', '.modal-close');

// Après « Entreprise / Particulier », le parcours continue dans la pop-up (src/wizard.ts).
document.querySelectorAll<HTMLButtonElement>('.js-choose').forEach((btn) => {
  btn.addEventListener('click', () => chooseClient(btn.dataset.type as 'B2B' | 'B2C'));
});

// --- Offre « Site vitrine PME » → même pop-up, type de mission déjà choisi ---
document.querySelectorAll('.js-offer').forEach((btn) =>
  btn.addEventListener('click', () => {
    presetOffer({ mission_type: 'site-vitrine', pay_mode: 'Forfait', budget: t('offers.site.budget') });
    if (!document.getElementById('offer-modal')!.hidden) offerModal.close();
    clientModal.open();
  })
);

// --- Bouton « Demander une mission » flottant, centré en bas de l'écran ---
// Toujours affiché une fois le hero dépassé (le bouton du hero est alors au-dessus de l'écran).
const fab = document.querySelector<HTMLElement>('.mission-fab');
const heroCta = document.querySelector('.hero-ctas');
if (fab && heroCta) {
  const sync = (show: boolean): void => {
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
  new IntersectionObserver(([e]) => sync(!e.isIntersecting && e.boundingClientRect.bottom < 0)).observe(heroCta);
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
