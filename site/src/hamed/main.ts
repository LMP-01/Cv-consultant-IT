import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles.css';

import { initBooking, preselect } from './booking';

const booking = document.getElementById('reserver')!;
initBooking(booking.querySelector<HTMLElement>('.booking')!);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function goToBooking(): void {
  booking.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

// « Réserver avec … » sur les cartes de l'équipe et les tarifs.
document.querySelectorAll<HTMLButtonElement>('[data-book]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const barber = btn.dataset.barber;
    preselect(btn.dataset.book as 'any' | 'chosen', barber);
    goToBooking();
  })
);

// Année du pied de page.
document.getElementById('year')!.textContent = String(new Date().getFullYear());
