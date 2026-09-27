import { CAL_LINK, CAPACITY, DAYS_AHEAD, MAX_COVERS, SERVICES, type Service } from './data';

interface Booking {
  date: string;
  time: number;
  covers: number;
}

const STORE_KEY = 'nonna-rosa-tables';

const state: { covers: number; date: string | null; service: Service['id'] | null; time: number | null } = {
  covers: 2,
  date: null,
  service: null,
  time: null
};

// --- Utilitaires (même logique que la démo Hamed Coiffeur) ---

const pad = (n: number): string => String(n).padStart(2, '0');
const dateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmtTime = (min: number): string => `${Math.floor(min / 60)}h${pad(min % 60)}`;
const longDate = (k: string): string =>
  fromKey(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Hash FNV-1a → [0, 1) : les réservations inventées sont les mêmes à chaque visite. */
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
    // Stockage indisponible : la démo continue sans mémoriser.
  }
}

/** Taux de remplissage inventé : le soir plus que le midi, vendredi/samedi soir presque complets. */
function fillRate(date: string, time: number): number {
  const day = fromKey(date).getDay();
  const evening = time >= 18 * 60;
  let rate = evening ? 0.55 : 0.4;
  if (evening && (day === 5 || day === 6)) rate += 0.3;
  if (!evening && day === 0) rate += 0.3;
  if (time === 20 * 60 || time === 20 * 60 + 30 || time === 12 * 60 + 30) rate += 0.1;
  return rate + (unit(`${date}|${time}`) - 0.5) * 0.5;
}

export function seatsLeft(date: string, time: number): number {
  const taken = Math.round(Math.min(1, Math.max(0, fillRate(date, time))) * CAPACITY);
  const mine = loadBookings()
    .filter((b) => b.date === date && b.time === time)
    .reduce((s, b) => s + b.covers, 0);
  return Math.max(0, CAPACITY - taken - mine);
}

function servicesFor(date: string): Service[] {
  return SERVICES[fromKey(date).getDay()];
}

function slotsFor(date: string, service: Service): number[] {
  const now = new Date();
  const isToday = date === dateKey(now);
  const min = now.getHours() * 60 + now.getMinutes() + 30;
  const out: number[] = [];
  for (let t = service.start; t <= service.end - 30; t += 30) if (!isToday || t > min) out.push(t);
  return out;
}

const isOpen = (date: string): boolean => servicesFor(date).some((s) => slotsFor(date, s).length > 0);

// --- Rendu ---

let root: HTMLElement;
const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;

function setPressed(group: HTMLElement, btn: HTMLElement | null): void {
  group.querySelectorAll('[aria-pressed]').forEach((el) => el.setAttribute('aria-pressed', String(el === btn)));
}

function renderCovers(): void {
  const wrap = $('.tb-covers');
  wrap.innerHTML = '';
  for (let n = 1; n <= MAX_COVERS; n++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tb-cover';
    btn.textContent = String(n);
    btn.setAttribute('aria-label', `${n} personne${n > 1 ? 's' : ''}`);
    btn.setAttribute('aria-pressed', String(state.covers === n));
    btn.addEventListener('click', () => {
      state.covers = n;
      state.time = null;
      setPressed(wrap, btn);
      update();
    });
    wrap.appendChild(btn);
  }
}

function renderDays(): void {
  const wrap = $('.tb-days');
  wrap.innerHTML = '';
  const start = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dateKey(d);
    const open = isOpen(key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tb-day';
    btn.dataset.date = key;
    btn.disabled = !open;
    btn.setAttribute('aria-pressed', String(state.date === key));
    btn.setAttribute('aria-label', `${longDate(key)}${open ? '' : ', fermé'}`);
    btn.innerHTML = `<span>${d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</span><strong>${d.getDate()}</strong><small>${open ? d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : 'fermé'}</small>`;
    btn.addEventListener('click', () => {
      state.date = key;
      state.time = null;
      const services = servicesFor(key).filter((s) => slotsFor(key, s).length);
      if (!services.some((s) => s.id === state.service)) state.service = services[0]?.id ?? null;
      setPressed(wrap, btn);
      update();
    });
    wrap.appendChild(btn);
  }
}

function renderServices(): void {
  const wrap = $('.tb-services');
  wrap.innerHTML = '';
  if (!state.date) return;
  for (const s of servicesFor(state.date)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tb-service';
    btn.dataset.service = s.id;
    btn.textContent = `${s.label} · ${fmtTime(s.start)}–${fmtTime(s.end)}`;
    btn.disabled = slotsFor(state.date, s).length === 0;
    btn.setAttribute('aria-pressed', String(state.service === s.id));
    btn.addEventListener('click', () => {
      state.service = s.id;
      state.time = null;
      setPressed(wrap, btn);
      update();
    });
    wrap.appendChild(btn);
  }
}

function renderSlots(): void {
  const wrap = $('.tb-slots');
  const note = $('.tb-slots-note');
  wrap.innerHTML = '';
  const service = state.date ? servicesFor(state.date).find((s) => s.id === state.service) : undefined;
  if (!state.date || !service) return;
  const slots = slotsFor(state.date, service);
  let free = 0;
  for (const t of slots) {
    const left = seatsLeft(state.date, t);
    const ok = left >= state.covers;
    if (ok) free++;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tb-slot';
    btn.dataset.time = String(t);
    btn.disabled = !ok;
    btn.innerHTML = `<strong>${fmtTime(t)}</strong><small>${ok ? (left <= 6 ? `${left} places` : 'Libre') : 'Complet'}</small>`;
    btn.setAttribute('aria-label', `${fmtTime(t)}, ${ok ? `${left} places restantes` : 'complet'}`);
    btn.setAttribute('aria-pressed', String(state.time === t));
    btn.addEventListener('click', () => {
      state.time = t;
      setPressed(wrap, btn);
      update();
    });
    wrap.appendChild(btn);
  }
  note.textContent = free
    ? `${free} horaire${free > 1 ? 's' : ''} disponible${free > 1 ? 's' : ''} pour ${state.covers} personne${state.covers > 1 ? 's' : ''}`
    : 'Complet pour ce service. Essayez un autre horaire ou appelez-nous.';
}

function summary(): string {
  const parts = [`${state.covers} personne${state.covers > 1 ? 's' : ''}`];
  if (state.date) parts.push(longDate(state.date));
  if (state.time !== null) parts.push(fmtTime(state.time));
  return parts.join(' · ');
}

function update(): void {
  $('.tb-step-service').hidden = !state.date;
  $('.tb-step-form').hidden = state.time === null;
  renderServices();
  renderSlots();
  $('.tb-summary').textContent = summary();
}

function confirm(e: SubmitEvent): void {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (!form.reportValidity() || !state.date || state.time === null) return;
  if (seatsLeft(state.date, state.time) < state.covers) {
    state.time = null;
    update();
    return;
  }
  if (CAL_LINK) {
    window.open(`https://cal.com/${CAL_LINK}?date=${state.date}`, '_blank', 'noopener');
    return;
  }
  saveBooking({ date: state.date, time: state.time, covers: state.covers });
  const name = (form.elements.namedItem('prenom') as HTMLInputElement).value.trim();
  const done = $('.tb-done');
  done.querySelector('.tb-done-title')!.textContent = `A presto, ${name} !`;
  done.querySelector('.tb-done-text')!.textContent =
    `Table pour ${state.covers} personne${state.covers > 1 ? 's' : ''}, ${longDate(state.date)} à ${fmtTime(state.time)}. Nous vous gardons la table 15 minutes.`;
  $('.tb-flow').hidden = true;
  done.hidden = false;
  done.querySelector<HTMLElement>('.tb-done-title')!.focus();
}

function reset(): void {
  state.date = null;
  state.service = null;
  state.time = null;
  ($('.tb-step-form form') as HTMLFormElement).reset();
  renderCovers();
  renderDays();
  $('.tb-done').hidden = true;
  $('.tb-flow').hidden = false;
  update();
}

export function initBooking(el: HTMLElement): void {
  root = el;
  $('.tb-step-form form').addEventListener('submit', (e) => confirm(e as SubmitEvent));
  $('.tb-again').addEventListener('click', reset);
  renderCovers();
  renderDays();
  update();
}
