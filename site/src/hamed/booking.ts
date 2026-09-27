import { BARBERS, CAL_LINKS, DAYS_AHEAD, HOURS, PRICE_ANY, PRICE_CHOSEN, SLOT_MINUTES } from './data';

interface Booking {
  date: string;
  time: number;
  barber: string;
}

const STORE_KEY = 'hamed-coiffeur-rdv';

const state: { mode: 'any' | 'chosen' | null; barber: string | null; date: string | null; time: number | null } = {
  mode: null,
  barber: null,
  date: null,
  time: null
};

// --- Utilitaires ---

const pad = (n: number): string => String(n).padStart(2, '0');
const dateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmtTime = (min: number): string => `${Math.floor(min / 60)}h${pad(min % 60)}`;
const longDate = (k: string): string =>
  fromKey(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Hash FNV-1a → [0, 1) : les RDV inventés sont les mêmes à chaque visite. */
function unit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

function loadBookings(): Booking[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as Booking[];
  } catch {
    return [];
  }
}

function saveBooking(b: Booking): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...loadBookings(), b]));
  } catch {
    // Stockage indisponible (navigation privée) : la démo continue sans mémoriser.
  }
}

function isBusy(date: string, time: number, barber: string): boolean {
  if (loadBookings().some((b) => b.date === date && b.time === time && b.barber === barber)) return true;
  return unit(`${date}|${time}|${barber}`) < busyRate(date, time);
}

/** Taux de remplissage inventé : plus chargé le midi, en fin de journée et le samedi. */
function busyRate(date: string, time: number): number {
  let rate = 0.3;
  if ((time >= 12 * 60 && time < 14 * 60) || time >= 17 * 60 + 30) rate += 0.4;
  if (fromKey(date).getDay() === 6) rate += 0.25;
  return Math.min(rate, 0.92);
}

function slotsFor(date: string): number[] {
  const hours = HOURS[fromKey(date).getDay()];
  if (!hours) return [];
  const now = new Date();
  const isToday = date === dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes() + 15;
  const out: number[] = [];
  for (let t = hours[0]; t + SLOT_MINUTES <= hours[1]; t += SLOT_MINUTES) {
    if (!isToday || t > nowMin) out.push(t);
  }
  return out;
}

/** Coiffeur libre pour ce créneau, ou null. En mode « peu importe », le premier libre. */
function freeBarber(date: string, time: number): string | null {
  if (state.mode === 'chosen') return state.barber && !isBusy(date, time, state.barber) ? state.barber : null;
  return BARBERS.find((b) => !isBusy(date, time, b.id))?.id ?? null;
}

// --- Rendu ---

let root: HTMLElement;
const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;

function setPressed(group: HTMLElement, btn: HTMLElement | null): void {
  group.querySelectorAll('[aria-pressed]').forEach((el) => el.setAttribute('aria-pressed', String(el === btn)));
}

function renderBarbers(): void {
  const wrap = $('.bk-barbers');
  wrap.innerHTML = '';
  for (const b of BARBERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bk-barber';
    btn.dataset.id = b.id;
    btn.setAttribute('aria-pressed', String(state.barber === b.id));
    btn.innerHTML = `<img src="${import.meta.env.BASE_URL}exemples/hamed-coiffeur/${b.photo}" alt="" width="56" height="56" loading="lazy" /><span><strong>${b.name}</strong><small>${b.role}</small></span>`;
    btn.addEventListener('click', () => {
      state.barber = b.id;
      state.time = null;
      setPressed(wrap, btn);
      update();
    });
    wrap.appendChild(btn);
  }
}

function renderDays(): void {
  const wrap = $('.bk-days');
  wrap.innerHTML = '';
  const start = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dateKey(d);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bk-day';
    btn.dataset.date = key;
    const open = slotsFor(key).length > 0;
    btn.disabled = !open;
    btn.setAttribute('aria-pressed', String(state.date === key));
    btn.setAttribute('aria-label', `${longDate(key)}${open ? '' : ', fermé'}`);
    btn.innerHTML = `<span>${d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</span><strong>${d.getDate()}</strong><small>${open ? d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : 'fermé'}</small>`;
    btn.addEventListener('click', () => {
      state.date = key;
      state.time = null;
      setPressed(wrap, btn);
      update();
    });
    wrap.appendChild(btn);
  }
}

function renderSlots(): void {
  const wrap = $('.bk-slots');
  const note = $('.bk-slots-note');
  wrap.innerHTML = '';
  if (!state.date) return;
  const slots = slotsFor(state.date);
  let free = 0;
  for (const t of slots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bk-slot';
    btn.textContent = fmtTime(t);
    const available = freeBarber(state.date, t) !== null;
    btn.disabled = !available;
    if (available) free++;
    btn.setAttribute('aria-label', `${fmtTime(t)}${available ? '' : ', déjà réservé'}`);
    btn.setAttribute('aria-pressed', String(state.time === t));
    btn.addEventListener('click', () => {
      state.time = t;
      setPressed(wrap, btn);
      update();
    });
    wrap.appendChild(btn);
  }
  note.textContent = free
    ? `${free} créneau${free > 1 ? 'x' : ''} libre${free > 1 ? 's' : ''} sur ${slots.length}`
    : 'Complet ce jour-là, essayez un autre jour.';
}

function summaryText(): string {
  if (!state.mode) return 'Choisissez une prestation pour commencer.';
  const parts: string[] = [];
  const barber = BARBERS.find((b) => b.id === state.barber);
  parts.push(state.mode === 'any' ? `Coupe, ${PRICE_ANY} €` : `Coupe avec ${barber ? barber.name : 'votre coiffeur'}, ${PRICE_CHOSEN} €`);
  if (state.date) parts.push(longDate(state.date));
  if (state.time !== null) parts.push(fmtTime(state.time));
  return parts.join(' · ');
}

function update(): void {
  const needBarber = state.mode === 'chosen';
  $('.bk-step-barber').hidden = !needBarber;
  const ready1 = state.mode === 'any' || (needBarber && !!state.barber);
  $('.bk-step-date').hidden = !ready1;
  $('.bk-step-time').hidden = !ready1 || !state.date;
  $('.bk-step-form').hidden = !ready1 || !state.date || state.time === null;
  if (ready1) renderSlots();
  $('.bk-summary').textContent = summaryText();
}

function confirm(e: SubmitEvent): void {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (!form.reportValidity() || !state.date || state.time === null) return;
  const barber = freeBarber(state.date, state.time);
  if (!barber) {
    state.time = null;
    update();
    return;
  }
  const cal = CAL_LINKS[state.mode === 'chosen' ? barber : 'any'];
  if (cal) {
    window.open(`https://cal.com/${cal}?date=${state.date}`, '_blank', 'noopener');
    return;
  }
  saveBooking({ date: state.date, time: state.time, barber });
  const name = (form.elements.namedItem('prenom') as HTMLInputElement).value.trim();
  const b = BARBERS.find((x) => x.id === barber)!;
  const done = $('.bk-done');
  done.querySelector('.bk-done-title')!.textContent = `C’est noté, ${name} !`;
  done.querySelector('.bk-done-text')!.textContent =
    `${state.mode === 'any' ? 'Coupe' : 'Coupe avec votre coiffeur'} avec ${b.name}, ${longDate(state.date)} à ${fmtTime(state.time)}. ` +
    `À régler sur place : ${state.mode === 'any' ? PRICE_ANY : PRICE_CHOSEN} €.`;
  $('.bk-flow').hidden = true;
  done.hidden = false;
  done.querySelector<HTMLElement>('.bk-done-title')!.focus();
}

function reset(): void {
  state.mode = null;
  state.barber = null;
  state.date = null;
  state.time = null;
  ($('.bk-step-form form') as HTMLFormElement).reset();
  setPressed($('.bk-services'), null);
  renderBarbers();
  renderDays();
  $('.bk-done').hidden = true;
  $('.bk-flow').hidden = false;
  update();
  $<HTMLButtonElement>('.bk-service').focus();
}

/** Pré-sélectionne une prestation (et un coiffeur) depuis un bouton ailleurs sur la page. */
export function preselect(mode: 'any' | 'chosen', barber?: string): void {
  const btn = root.querySelector<HTMLElement>(`.bk-service[data-mode="${mode}"]`);
  btn?.click();
  if (barber) root.querySelector<HTMLElement>(`.bk-barber[data-id="${barber}"]`)?.click();
}

export function initBooking(el: HTMLElement): void {
  root = el;
  root.querySelectorAll<HTMLButtonElement>('.bk-service').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode as 'any' | 'chosen';
      if (state.mode === 'any') state.barber = null;
      state.time = null;
      setPressed($('.bk-services'), btn);
      renderBarbers();
      update();
    })
  );
  $('.bk-step-form form').addEventListener('submit', (e) => confirm(e as SubmitEvent));
  $('.bk-again').addEventListener('click', reset);
  renderBarbers();
  renderDays();
  update();
}
