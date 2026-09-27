import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';

import { initBooking } from './booking';
import { initMenu } from './menu';

initMenu();
initBooking(document.querySelector<HTMLElement>('.table-booking')!);

// Apparition des sections au scroll.
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

// Année du pied de page.
document.getElementById('year')!.textContent = String(new Date().getFullYear());
