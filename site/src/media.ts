// Boucles vidéo Kling : la <video> n'est créée qu'à l'entrée dans le viewport,
// et se met en pause en sortant. Poster seul en reduced-motion ou en mode économie de données.

const BASE = import.meta.env.BASE_URL;

type MediaState = 'poster' | 'loading' | 'playing' | 'paused';

export function initMedia(): void {
  const boxes = document.querySelectorAll<HTMLElement>('.media[data-video]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

  const setState = (box: HTMLElement, s: MediaState): void => {
    box.dataset.state = s;
  };

  boxes.forEach((box) => setState(box, 'poster'));
  if (reduced || saveData || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const box = entry.target as HTMLElement;
        let video = box.querySelector('video');
        if (entry.isIntersecting) {
          if (!video) {
            video = document.createElement('video');
            video.muted = true;
            video.defaultMuted = true;
            video.loop = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.setAttribute('aria-hidden', 'true');
            video.setAttribute('tabindex', '-1');
            video.addEventListener('playing', () => setState(box, 'playing'));
            video.addEventListener('error', () => setState(box, 'poster'));
            video.src = BASE + box.dataset.video;
            box.appendChild(video);
            setState(box, 'loading');
          }
          video.play().catch(() => setState(box, 'poster'));
        } else if (video) {
          video.pause();
          if (box.dataset.state === 'playing') setState(box, 'paused');
        }
      }
    },
    { rootMargin: '120px 0px', threshold: 0.15 }
  );

  boxes.forEach((box) => observer.observe(box));
}
