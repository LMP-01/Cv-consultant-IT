import { t } from './i18n';
import { sendMission, type MissionPayload } from './form';

// Parcours de demande de mission dans la pop-up : 1 Vous êtes… → 2 Type → 3 Budget/délai → 4 Projet → 5 Coordonnées.

type Step = 1 | 2 | 3 | 4 | 5 | 'done';
const TOTAL = 5;

const DEADLINE_KEY: Record<string, string> = {
  urgent: 'wizard.deadline.urgent',
  soon: 'wizard.deadline.soon',
  flexible: 'wizard.deadline.flexible'
};

interface State {
  client_type: 'B2B' | 'B2C';
  mission_type: string;
  pay_mode: string;
  deadline: string;
  /** true quand le type de mission vient d'une offre (on saute l'étape 2). */
  preset: boolean;
}

const initial = (): State => ({ client_type: 'B2B', mission_type: '', pay_mode: '', deadline: '', preset: false });
let state = initial();
let current: Step = 1;

let box: HTMLElement;
const $ = <T extends HTMLElement>(sel: string): T => box.querySelector<T>(sel)!;
const stepEl = (s: Step): HTMLElement => box.querySelector<HTMLElement>(`.wz-step[data-step="${s}"]`)!;

function setPressed(group: HTMLElement, value: string): void {
  group.querySelectorAll<HTMLElement>('[data-value]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
}

function show(step: Step): void {
  current = step;
  box.querySelectorAll<HTMLElement>('.wz-step').forEach((el) => (el.hidden = el !== stepEl(step)));
  const inFlow = typeof step === 'number' && step > 1;
  $('.wz-head').hidden = !inFlow;
  $('.wz-bar').hidden = step === 'done' || step === 1;
  if (typeof step === 'number') {
    $('.wz-progress').textContent = t('wizard.progress').replace('{n}', String(step)).replace('{total}', String(TOTAL));
    $<HTMLElement>('.wz-bar span').style.width = `${(step / TOTAL) * 100}%`;
  }
  // Pré-sélections quand on arrive (ou revient) sur une étape.
  setPressed(stepEl(2).querySelector('.wz-missions')!, state.mission_type);
  box.querySelectorAll<HTMLElement>('.wz-chips').forEach((g) => setPressed(g, state[g.dataset.field as 'pay_mode' | 'deadline']));
  $('.wz-company').hidden = state.client_type !== 'B2B';
  box.querySelectorAll<HTMLElement>('.wz-msg').forEach((m) => (m.textContent = ''));
  box.scrollTop = 0;
  if (!box.closest<HTMLElement>('.modal')!.hidden) stepEl(step).querySelector<HTMLElement>('.wz-title')?.focus({ preventScroll: true });
}

function back(): void {
  if (current === 'done' || current === 1) return;
  show((current - 1) as Step);
}

/** Élément à focaliser à l'ouverture de la pop-up (reprend là où on s'était arrêté). */
export function focusTarget(): HTMLElement | null {
  if (current === 'done') reset();
  return current === 1 ? box.querySelector<HTMLElement>('.js-choose') : stepEl(current).querySelector<HTMLElement>('.wz-title');
}

export function reset(): void {
  state = initial();
  box.querySelectorAll<HTMLFormElement>('form.wz-step').forEach((f) => f.reset());
  show(1);
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
  show(state.preset && state.mission_type ? 3 : 2);
}

async function submit(form: HTMLFormElement): Promise<void> {
  const msg = form.querySelector<HTMLElement>('.wz-msg')!;
  if (!form.reportValidity()) {
    msg.textContent = t('form.required');
    return;
  }
  const val = (sel: string): string => $<HTMLInputElement>(sel).value.trim();
  const payload: MissionPayload = {
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
    description: val('#wz-description')
  };
  const btn = form.querySelector<HTMLButtonElement>('.wz-submit')!;
  btn.disabled = true;
  btn.textContent = t('form.sending');
  try {
    if ((await sendMission(payload)) === 'sent') show('done');
  } catch {
    msg.textContent = t('form.error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('form.submit');
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

  stepEl(2).querySelectorAll<HTMLButtonElement>('.wz-mission').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.mission_type = btn.dataset.value!;
      show(3);
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

  ([3, 4] as const).forEach((n) =>
    stepEl(n).addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      if (!form.reportValidity()) {
        const msg = form.querySelector<HTMLElement>('.wz-msg');
        if (msg) msg.textContent = t('form.required');
        return;
      }
      show((n + 1) as Step);
    })
  );

  stepEl(5).addEventListener('submit', (e) => {
    e.preventDefault();
    void submit(e.currentTarget as HTMLFormElement);
  });

  show(1);
}
