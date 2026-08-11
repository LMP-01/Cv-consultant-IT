import { t } from './i18n';

// Galeries « Aperçu en images » : screenshots servis depuis public/assets/.
const BASE = import.meta.env.BASE_URL;

interface Slide {
  src: string;
  capKey: string;
}

const GALLERIES: Record<string, Slide[]> = {
  epta5: [
    { src: 'assets/epta5-01.png', capKey: 'gal.epta5.1' },
    { src: 'assets/epta5-02.png', capKey: 'gal.epta5.2' }
  ],
  jarvis: [{ src: 'assets/jarvis-01.png', capKey: 'gal.jarvis.1' }],
  track: [{ src: 'assets/track-01.png', capKey: 'gal.track.1' }],
  seissix: [
    { src: 'assets/seissix-01.png', capKey: 'gal.seissix.1' },
    { src: 'assets/seissix-02.png', capKey: 'gal.seissix.2' }
  ],
  guide: [{ src: 'assets/guide-01.png', capKey: 'gal.guide.1' }]
};

export function initGalleries(): void {
  const lbFound = document.getElementById('lightbox');
  if (!lbFound) return;
  const lb: HTMLElement = lbFound;
  const slidesWrap = lb.querySelector<HTMLElement>('.lb-slides')!;
  const capEl = lb.querySelector<HTMLElement>('.lb-cap')!;
  const dotsWrap = lb.querySelector<HTMLElement>('.lb-dots')!;

  let current: Slide[] = [];
  let index = 0;
  let lastFocused: HTMLElement | null = null;

  function go(k: number): void {
    if (!current.length) return;
    index = (k + current.length) % current.length;
    slidesWrap.style.transform = `translateX(-${index * 100}%)`;
    capEl.textContent = t(current[index].capKey);
    dotsWrap.querySelectorAll('button').forEach((d, i) => d.classList.toggle('on', i === index));
  }

  function build(key: string): void {
    current = GALLERIES[key] ?? [];
    index = 0;
    slidesWrap.innerHTML = '';
    dotsWrap.innerHTML = '';
    slidesWrap.style.transform = 'translateX(0)';
    current.forEach((slide, i) => {
      const cell = document.createElement('div');
      cell.className = 'lb-slide';
      const img = document.createElement('img');
      img.alt = t(slide.capKey);
      img.loading = 'lazy';
      img.addEventListener(
        'error',
        () => {
          const ph = document.createElement('p');
          ph.className = 'lb-ph';
          ph.textContent = t('gal.missing');
          img.replaceWith(ph);
        },
        { once: true }
      );
      img.src = BASE + slide.src;
      cell.appendChild(img);
      slidesWrap.appendChild(cell);

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', `${i + 1}/${current.length}`);
      dot.addEventListener('click', () => go(i));
      dotsWrap.appendChild(dot);
    });
  }

  function open(key: string): void {
    lastFocused = document.activeElement as HTMLElement;
    build(key);
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    go(0);
    lb.querySelector<HTMLButtonElement>('.lb-close')?.focus();
  }

  function close(): void {
    lb.hidden = true;
    document.body.style.overflow = '';
    lastFocused?.focus();
  }

  document.querySelectorAll<HTMLButtonElement>('[data-gallery]').forEach((btn) => {
    btn.addEventListener('click', () => open(btn.dataset.gallery!));
  });
  lb.querySelector('.lb-close')?.addEventListener('click', close);
  lb.querySelector('.lb-prev')?.addEventListener('click', () => go(index - 1));
  lb.querySelector('.lb-next')?.addEventListener('click', () => go(index + 1));
  lb.querySelector('.lb-backdrop')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
  });
}
