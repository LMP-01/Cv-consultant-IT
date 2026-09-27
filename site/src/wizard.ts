import { currentLang, t } from './i18n';
import { sendMission, type MissionPayload } from './form';
import { CAL_LINK, callDays, fromKey, isTaken, saveBooking, slotsFor } from './calls';

// Parcours dans la pop-up « Demander une mission » :
//  - mission : Vous êtes… → Type → Budget/délai → Projet → Coordonnées → Un appel ? → (Créneau)
//  - appel direct (« Réserver un appel ») : Visio/Téléphone → Créneau → Coordonnées

type StepId = 'client' | 'mission' | 'budget' | 'project' | 'contact' | 'call' | 'slot' | 'callcontact' | 'done';
type Mode = 'mission' | 'call';
type CallType = '' | 'visio' | 'phone';

const DEADLINE_KEY: Record<string, string> = {
  urgent: 'wizard.deadline.urgent',
  soon: 'wizard.deadline.soon',
  flexible: 'wizard.deadline.flexible'
};

interface State {
  mode: Mode;
  client_type: 'B2B' | 'B2C';
  mission_type: string;
  pay_mode: string;
  deadline: string;
  /** true quand le type de mission vient d'une offre (on saute l'étape « Type »). */
  preset: boolean;
  callType: CallType;
  callDate: string;
  callHour: number | null;
}

const initial = (mode: Mode = 'mission'): State => ({
  mode,
  client_type: 'B2B',
  mission_type: '',
  pay_mode: '',
  deadline: '',
  preset: false,
  callType: '',
  callDate: '',
  callHour: null
});
let state = initial();
let current: StepId = 'client';

let box: HTMLElement;
const $ = <T extends HTMLElement>(sel: string): T => box.querySelector<T>(sel)!;
const stepEl = (s: StepId): HTMLElement => box.querySelector<HTMLElement>(`.wz-step[data-step="${s}"]`)!;

/** Étapes du parcours en cours (le créneau n'apparaît que si un appel est demandé). */
function flow(): StepId[] {
  if (state.mode === 'call') return ['call', 'slot', 'callcontact'];
  const steps: StepId[] = ['client', 'mission', 'budget', 'project', 'contact', 'call'];
  if (state.callType) steps.push('slot');
  return steps;
}

function setPressed(group: Element, value: string): void {
  group.querySelectorAll<HTMLElement>('[data-value]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
}

// --- Calendrier ---

const locale = (): string => (currentLang() === 'fr' ? 'fr-FR' : 'en-GB');
const fmtHour = (h: number): string => (currentLang() === 'fr' ? `${h}h` : `${h}:00`);
const longDate = (k: string): string => fromKey(k).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });

function renderDays(): void {
  const wrap = $('.call-days');
  const days = callDays();
  if (!days.includes(state.callDate)) state.callDate = days[0] ?? '';
  wrap.innerHTML = '';
  for (const key of days) {
    const d = fromKey(key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip call-day';
    btn.dataset.value = key;
    btn.setAttribute('aria-pressed', String(key === state.callDate));
    btn.setAttribute('aria-label', longDate(key));
    btn.innerHTML = `<span>${d.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '')}</span><strong>${d.getDate()}</strong>`;
    btn.addEventListener('click', () => {
      state.callDate = key;
      state.callHour = null;
      setPressed(wrap, key);
      renderSlots();
      if (CAL_LINK) window.open(`https://cal.com/${CAL_LINK}?date=${key}`, '_blank', 'noopener');
    });
    wrap.appendChild(btn);
  }
}

function renderSlots(): void {
  const wrap = $('.call-slots');
  wrap.innerHTML = '';
  if (!state.callDate) return;
  for (const h of slotsFor(state.callDate)) {
    const taken = isTaken(state.callDate, h);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip call-slot';
    btn.dataset.value = String(h);
    btn.textContent = fmtHour(h);
    btn.disabled = taken;
    btn.setAttribute('aria-pressed', String(state.callHour === h));
    btn.setAttribute('aria-label', `${fmtHour(h)}${taken ? ` — ${t('call.slot.taken')}` : ''}`);
    btn.addEventListener('click', () => {
      state.callHour = h;
      setPressed(wrap, String(h));
      box.querySelectorAll<HTMLElement>('.wz-msg').forEach((m) => (m.textContent = ''));
    });
    wrap.appendChild(btn);
  }
}

function callSummary(): string {
  if (!state.callDate || state.callHour === null) return '';
  const kind = t(state.callType === 'phone' ? 'call.phone.title' : 'call.visio.title');
  return `${kind} · ${longDate(state.callDate)} · ${fmtHour(state.callHour)}`;
}

// --- Navigation ---

function show(step: StepId): void {
  current = step;
  box.querySelectorAll<HTMLElement>('.wz-step').forEach((el) => (el.hidden = el !== stepEl(step)));
  const steps = flow();
  const idx = steps.indexOf(step);
  const inFlow = step !== 'done' && idx > 0;
  $('.wz-head').hidden = !inFlow;
  $('.wz-bar').hidden = !inFlow;
  if (idx >= 0) {
    $('.wz-progress').textContent = t('wizard.progress').replace('{n}', String(idx + 1)).replace('{total}', String(steps.length));
    $<HTMLElement>('.wz-bar span').style.width = `${((idx + 1) / steps.length) * 100}%`;
  }
  // Pré-sélections quand on arrive (ou revient) sur une étape.
  setPressed(stepEl('mission').querySelector('.wz-missions')!, state.mission_type);
  box.querySelectorAll<HTMLElement>('.wz-chips').forEach((g) => setPressed(g, state[g.dataset.field as 'pay_mode' | 'deadline']));
  setPressed(stepEl('call').querySelector('.call-types')!, state.callType);
  $('.wz-company').hidden = state.client_type !== 'B2B';
  $('.wz-skip-call').hidden = state.mode === 'call';
  if (step === 'slot') {
    renderDays();
    renderSlots();
    $('.call-kind').textContent = t(state.callType === 'phone' ? 'call.phone.title' : 'call.visio.title');
    // Parcours mission : le téléphone se demande ici ; appel direct : à l'étape coordonnées.
    const askPhone = state.mode === 'mission' && state.callType === 'phone';
    $('.call-phone-field').hidden = !askPhone;
    $<HTMLInputElement>('#wz-phone').required = askPhone;
    const submit = $<HTMLButtonElement>('[data-step="slot"] .wz-submit');
    submit.textContent = t(state.mode === 'call' ? 'wizard.next' : 'form.submit');
  }
  if (step === 'callcontact') {
    const askPhone = state.callType === 'phone';
    $('.cc-phone-field').hidden = !askPhone;
    $<HTMLInputElement>('#cc-phone').required = askPhone;
    $('.call-recap').textContent = callSummary();
  }
  box.querySelectorAll<HTMLElement>('.wz-msg').forEach((m) => (m.textContent = ''));
  box.scrollTop = 0;
  if (!box.closest<HTMLElement>('.modal')!.hidden) stepEl(step).querySelector<HTMLElement>('.wz-title')?.focus({ preventScroll: true });
}

function next(): void {
  const steps = flow();
  const i = steps.indexOf(current);
  if (i >= 0 && i < steps.length - 1) show(steps[i + 1]);
}

function back(): void {
  const steps = flow();
  const i = steps.indexOf(current);
  if (i > 0) show(steps[i - 1]);
}

/** Élément à focaliser à l'ouverture de la pop-up (reprend là où on s'était arrêté). */
export function focusTarget(): HTMLElement | null {
  if (current === 'done') reset();
  return current === 'client' ? box.querySelector<HTMLElement>('.js-choose') : stepEl(current).querySelector<HTMLElement>('.wz-title');
}

export function reset(mode: Mode = 'mission'): void {
  state = initial(mode);
  box.querySelectorAll<HTMLFormElement>('form.wz-step').forEach((f) => f.reset());
  show(mode === 'call' ? 'call' : 'client');
}

/** Ouvre directement la prise de rendez-vous (bouton « Réserver un appel »). */
export function startCall(): void {
  if (state.mode !== 'call' || current === 'done') reset('call');
}

/** Si la pop-up était en mode appel, un clic sur « Demander une mission » repart sur le parcours mission. */
export function startMission(): void {
  if (state.mode !== 'mission' || current === 'done') reset('mission');
}

/** Démarre le parcours depuis une offre : type de mission et rémunération déjà choisis. */
export function presetOffer(values: { mission_type: string; pay_mode: string; budget: string }): void {
  reset();
  state.mission_type = values.mission_type;
  state.pay_mode = values.pay_mode;
  state.preset = true;
  $<HTMLInputElement>('#wz-budget').value = values.budget;
}

export function chooseClient(type: 'B2B' | 'B2C'): void {
  state.client_type = type;
  show(state.preset && state.mission_type ? 'budget' : 'mission');
}

// --- Envoi ---

async function send(form: HTMLElement | null): Promise<void> {
  const msg = form?.querySelector<HTMLElement>('.wz-msg') ?? null;
  const val = (sel: string): string => $<HTMLInputElement>(sel).value.trim();
  const hasCall = !!state.callType && !!state.callDate && state.callHour !== null;
  const call: Record<string, string> = hasCall
    ? {
        call_type: state.callType === 'phone' ? 'Téléphone' : 'Visio',
        call_date: fromKey(state.callDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        call_time: `${state.callHour}h (heure de Paris)`
      }
    : {};
  let payload: MissionPayload & Record<string, string>;
  if (state.mode === 'call') {
    payload = {
      client_type: '',
      name: val('#cc-name'),
      email: val('#cc-email'),
      company: val('#cc-company'),
      mission_type: 'Appel découverte',
      tools: '',
      pay_mode: '',
      budget: '',
      deadline: '',
      description: val('#cc-topic') || '—',
      phone: state.callType === 'phone' ? val('#cc-phone') : '',
      ...call
    };
  } else {
    payload = {
      client_type: state.client_type,
      name: val('#wz-name'),
      email: val('#wz-email'),
      company: state.client_type === 'B2B' ? val('#wz-company') : '',
      mission_type: state.mission_type,
      tools: val('#wz-tools'),
      pay_mode: state.pay_mode,
      budget: val('#wz-budget'),
      // L'e-mail reçu reste en français, quelle que soit la langue du visiteur.
      deadline: state.deadline ? t(DEADLINE_KEY[state.deadline], 'fr') : '',
      description: val('#wz-description'),
      ...(hasCall && state.callType === 'phone' ? { phone: val('#wz-phone') } : ({} as Record<string, string>)),
      ...call
    };
  }
  const subject = hasCall
    ? `[RDV ${state.callType === 'phone' ? 'téléphone' : 'visio'}] ${fromKey(state.callDate).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${state.callHour}h — ${payload.name}`
    : undefined;

  const btn = form?.querySelector<HTMLButtonElement>('.wz-submit') ?? null;
  const label = btn?.textContent ?? '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('form.sending');
  }
  try {
    if ((await sendMission(payload, subject)) === 'sent') {
      if (hasCall) saveBooking(state.callDate, state.callHour!);
      const doneCall = $('.wz-done-call');
      doneCall.hidden = !hasCall;
      if (hasCall) {
        doneCall.textContent = `${t('call.done')} ${callSummary()}. ${t(state.callType === 'phone' ? 'call.done.phone' : 'call.done.visio')}`;
      }
      $('.wz-done-desc').hidden = state.mode === 'call';
      show('done');
    }
  } catch {
    if (msg) msg.textContent = t('form.error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
}

export function initWizard(): void {
  box = document.querySelector<HTMLElement>('#client-modal .wizard')!;

  $('.wz-back').addEventListener('click', back);
  // Le message « champs obligatoires » disparaît dès qu'on corrige.
  box.addEventListener('input', (e) => {
    const msg = (e.target as HTMLElement).closest('form')?.querySelector<HTMLElement>('.wz-msg');
    if (msg) msg.textContent = '';
  });

  stepEl('mission').querySelectorAll<HTMLButtonElement>('.wz-mission').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.mission_type = btn.dataset.value!;
      show('budget');
    })
  );

  box.querySelectorAll<HTMLElement>('.wz-chips').forEach((group) =>
    group.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
      if (!chip) return;
      state[group.dataset.field as 'pay_mode' | 'deadline'] = chip.dataset.value!;
      setPressed(group, chip.dataset.value!);
    })
  );

  // Étapes à formulaire : validation puis étape suivante.
  (['budget', 'project', 'contact'] as const).forEach((id) =>
    stepEl(id).addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      if (!form.reportValidity()) {
        const msg = form.querySelector<HTMLElement>('.wz-msg');
        if (msg) msg.textContent = t('form.required');
        return;
      }
      next();
    })
  );

  // Un appel ? Visio / Téléphone → créneau ; « Pas maintenant » → envoi direct.
  stepEl('call').querySelectorAll<HTMLButtonElement>('.wz-call').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.callType = btn.dataset.value as CallType;
      next();
    })
  );
  $('.wz-skip-call').addEventListener('click', () => {
    state.callType = '';
    void send(stepEl('call'));
  });

  stepEl('slot').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const msg = form.querySelector<HTMLElement>('.wz-msg')!;
    if (state.callHour === null) {
      msg.textContent = t('call.slot.pick');
      return;
    }
    if (!form.reportValidity()) {
      msg.textContent = t('form.required');
      return;
    }
    if (state.mode === 'call') next();
    else void send(form);
  });

  stepEl('callcontact').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (!form.reportValidity()) {
      form.querySelector<HTMLElement>('.wz-msg')!.textContent = t('form.required');
      return;
    }
    void send(form);
  });

  document.querySelectorAll<HTMLElement>('.js-start-call').forEach((el) => el.addEventListener('click', () => startCall()));

  show('client');
}
