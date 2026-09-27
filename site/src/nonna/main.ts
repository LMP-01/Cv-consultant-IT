import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/500-italic.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles.css';

import { initBooking } from './booking';
import { initMenu } from './menu';

initMenu();
initBooking(document.querySelector<HTMLElement>('.table-booking')!);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- En-tête : transparent sur le diaporama, plein ensuite ---
const top = document.querySelector<HTMLElement>('.top')!;
const onScroll = (): void => {
  top.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.6);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// --- Diaporama du hero (fondu, défilement auto toutes les 6 s) ---
const slides = [...document.querySelectorAll<HTMLElement>('.slide')];
const dots = [...document.querySelectorAll<HTMLButtonElement>('.dots button')];
let current = 0;
let timer = 0;

function show(i: number): void {
  current = (i + slides.length) % slides.length;
  slides.forEach((s, k) => s.classList.toggle('is-active', k === current));
  dots.forEach((d, k) => (k === current ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
}

function play(): void {
  if (reduced) return;
  window.clearInterval(timer);
  timer = window.setInterval(() => show(current + 1), 6000);
}

document.querySelector('.slide-prev')!.addEventListener('click', () => { show(current - 1); play(); });
document.querySelector('.slide-next')!.addEventListener('click', () => { show(current + 1); play(); });
dots.forEach((d, k) => d.addEventListener('click', () => { show(k); play(); }));
const hero = document.querySelector<HTMLElement>('.hero')!;
hero.addEventListener('mouseenter', () => window.clearInterval(timer));
hero.addEventListener('mouseleave', play);
hero.addEventListener('focusin', () => window.clearInterval(timer));
document.addEventListener('visibilitychange', () => (document.hidden ? window.clearInterval(timer) : play()));
play();

// --- Carrousel de la galerie ---
const carousel = document.querySelector<HTMLElement>('.carousel')!;
const step = (): number => (carousel.querySelector('li')?.getBoundingClientRect().width ?? 300) + 16;
document.querySelector('.carousel-prev')!.addEventListener('click', () =>
  carousel.scrollBy({ left: -step(), behavior: reduced ? 'auto' : 'smooth' })
);
document.querySelector('.carousel-next')!.addEventListener('click', () =>
  carousel.scrollBy({ left: step(), behavior: reduced ? 'auto' : 'smooth' })
);

// --- Apparition des sections au scroll ---
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.08 }
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

document.getElementById('year')!.textContent = String(new Date().getFullYear());
