// Parcours : roadmap cinématique (lecture auto chapitre par chapitre) puis vue d'ensemble.
import { t } from './i18n';

export function initJourney(): void {
  const found = document.querySelector<HTMLElement>('.jr');
  if (!found) return;
  const root = found;
  const film = root.querySelector<HTMLElement>('.jr-film')!;
  const overview = root.querySelector<HTMLElement>('.jr-overview')!;
  const chapters = [...root.querySelectorAll<HTMLElement>('.jr-ch')];
  const bars = [...root.querySelectorAll<HTMLElement>('.jr-progress i')];
  const nodes = [...root.querySelectorAll<HTMLButtonElement>('.jr-node')];
  const path = root.querySelector<SVGPathElement>('.jr-path')!;
  const playBtn = root.querySelector<HTMLButtonElement>('.jr-play')!;
  const last = chapters.length - 1;
  const duration = Number(root.dataset.duration) || 6500;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.style.setProperty('--jr-dur', `${duration}ms`);

  let index = 0;
  let elapsed = 0;
  let playing = !reduced;
  let visible = false;
  let frame = 0;
  let prev = 0;

  const running = (): boolean => playing && visible && !document.hidden && overview.hidden;

  function paint(): void {
    const ratio = Math.min(elapsed / duration, 1);
    bars.forEach((b, k) => b.style.setProperty('--p', String(k < index ? 1 : k === index ? ratio : 0)));
    const along = index < last ? (index + ratio) / last : 1;
    path.style.strokeDashoffset = String(100 - along * 100);
  }

  function syncState(): void {
    root.classList.toggle('is-paused', !playing);
    root.classList.toggle('is-halted', !running());
    const key = playing ? 'journey.pause' : 'journey.play';
    playBtn.dataset.i18nAria = key;
    playBtn.setAttribute('aria-label', t(key));
    if (running() && !frame) {
      prev = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  function tick(now: number): void {
    frame = 0;
    if (!running()) return;
    elapsed += Math.min(now - prev, 100);
    prev = now;
    if (elapsed >= duration) {
      if (index < last) go(index + 1);
      else return showOverview(false);
    }
    paint();
    frame = requestAnimationFrame(tick);
  }

  function go(i: number): void {
    index = Math.max(0, Math.min(last, i));
    elapsed = 0;
    chapters.forEach((c, k) => {
      const on = k === index;
      c.classList.toggle('is-active', on);
      c.inert = !on;
    });
    nodes.forEach((n, k) => {
      n.classList.toggle('is-reached', k <= index);
      if (k === index) n.setAttribute('aria-current', 'step');
      else n.removeAttribute('aria-current');
    });
    paint();
  }

  function showFilm(i: number): void {
    overview.hidden = true;
    film.hidden = false;
    go(i);
    syncState();
  }

  function showOverview(userAction: boolean): void {
    film.hidden = true;
    overview.hidden = false;
    syncState();
    if (userAction) overview.querySelector<HTMLElement>('.jr-ov-title')?.focus({ preventScroll: true });
  }

  // Images : on charge tout dès que la section approche, pour des transitions sans trou.
  const eager = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      root.querySelectorAll('img').forEach((img) => (img.loading = 'eager'));
      eager.disconnect();
    },
    { rootMargin: '600px 0px' }
  );
  eager.observe(root);

  // Lecture seulement quand le film est à l'écran.
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      syncState();
    },
    { threshold: 0.35 }
  ).observe(film);
  document.addEventListener('visibilitychange', syncState);

  playBtn.addEventListener('click', () => {
    playing = !playing;
    syncState();
  });
  root.querySelector('.jr-prev')!.addEventListener('click', () => go(index - 1));
  root.querySelector('.jr-next')!.addEventListener('click', () => (index < last ? go(index + 1) : showOverview(true)));
  root.querySelector('.jr-skip')!.addEventListener('click', () => showOverview(true));
  nodes.forEach((n) => n.addEventListener('click', () => go(Number(n.dataset.i))));
  film.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'ArrowRight') (index < last ? go(index + 1) : showOverview(true));
    else return;
    e.preventDefault();
  });
  root.querySelectorAll<HTMLButtonElement>('.jr-mile').forEach((m) =>
    m.addEventListener('click', () => {
      showFilm(Number(m.dataset.i));
      film.querySelector<HTMLElement>('.jr-play')?.focus({ preventScroll: true });
    })
  );
  root.querySelector('.jr-replay')!.addEventListener('click', () => {
    playing = true;
    showFilm(0);
    playBtn.focus({ preventScroll: true });
  });

  go(0);
  // Mouvement réduit : directement la vue d'ensemble, sans lecture automatique.
  if (reduced) showOverview(false);
  else syncState();
}
