// Prise de rendez-vous visio / téléphone : créneaux, jours et « faux » rendez-vous déjà pris.

/** Heures proposées chaque jour (heure de Paris). */
export const CALL_SLOTS = [13, 18, 19, 20, 21, 22];
/** Nombre de jours affichés, aujourd'hui compris. */
export const CALL_DAYS = 14;
/**
 * Lien Cal.com (ex. 'theo-manso-pinto/30min'). Vide = prise de rendez-vous intégrée, envoyée par e-mail.
 * Rempli = après le choix du jour, la page Cal.com s'ouvre sur ce jour.
 */
export const CAL_LINK = '';

const STORE_KEY = 'tmp-calls';

const pad = (n: number): string => String(n).padStart(2, '0');
export const dateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Hash FNV-1a → [0, 1) : les rendez-vous inventés sont identiques à chaque visite. */
function unit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/** 1 à 3 créneaux déjà pris par jour, choisis de façon déterministe. */
export function inventedBusy(date: string): number[] {
  const count = 1 + Math.floor(unit(`${date}|n`) * 3);
  return [...CALL_SLOTS]
    .sort((a, b) => unit(`${date}|${a}`) - unit(`${date}|${b}`))
    .slice(0, count);
}

function myBookings(): { date: string; hour: number }[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveBooking(date: string, hour: number): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...myBookings(), { date, hour }]));
  } catch {
    // Stockage indisponible : rien à mémoriser.
  }
}

export function isTaken(date: string, hour: number): boolean {
  return inventedBusy(date).includes(hour) || myBookings().some((b) => b.date === date && b.hour === hour);
}

/** Créneaux affichés pour un jour : ceux d'aujourd'hui déjà passés (ou dans moins d'une heure) sont retirés. */
export function slotsFor(date: string, now = new Date()): number[] {
  if (date !== dateKey(now)) return CALL_SLOTS;
  const minHour = now.getHours() + (now.getMinutes() > 0 ? 2 : 1);
  return CALL_SLOTS.filter((h) => h >= minHour);
}

/** Les 14 prochains jours qui ont encore au moins un créneau affiché. */
export function callDays(now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < CALL_DAYS; i++) {
    const key = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
    if (slotsFor(key, now).length) out.push(key);
  }
  return out;
}
