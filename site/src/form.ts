import { t } from './i18n';

// Clé d'accès Web3Forms (https://web3forms.com — gratuit).
// À créer avec l'adresse theo.mansopro@gmail.com puis coller ici.
// Tant que la clé est le placeholder, le formulaire bascule en mailto:.
const WEB3FORMS_ACCESS_KEY = '0f86820b-6cbf-42b8-b5f6-a3283a7c3f40';
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
const FALLBACK_EMAIL = 'theo.mansopro@gmail.com';

function isKeyConfigured(): boolean {
  return /^[0-9a-f-]{36}$/i.test(WEB3FORMS_ACCESS_KEY);
}

function collectPayload(form: HTMLFormElement): MissionPayload {
  const data = new FormData(form);
  const get = (k: string): string => String(data.get(k) ?? '').trim();
  return {
    client_type: get('client_type'),
    name: get('name'),
    email: get('email'),
    company: get('company'),
    mission_type: get('mission_type'),
    tools: get('tools'),
    pay_mode: get('pay_mode'),
    budget: get('budget'),
    deadline: get('deadline'),
    description: get('description')
  };
}

function buildMailto(p: MissionPayload & Record<string, string>, subject: string): string {
  const body = [
    `Type de client : ${p.client_type}`,
    `Nom : ${p.name}`,
    `Email : ${p.email}`,
    `Entreprise : ${p.company || '—'}`,
    `Type de mission : ${p.mission_type}`,
    `Outils souhaités : ${p.tools || '—'}`,
    `Rémunération : ${p.pay_mode}`,
    `Budget / TJM : ${p.budget || '—'}`,
    `Délai : ${p.deadline || '—'}`,
    ...(p.call_type ? [`Rendez-vous : ${p.call_type}, ${p.call_date} à ${p.call_time}`, `Téléphone : ${p.phone || '—'}`] : []),
    '',
    'Description :',
    p.description
  ].join('\n');
  return `mailto:${FALLBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export type MissionPayload = Record<
  'client_type' | 'name' | 'email' | 'company' | 'mission_type' | 'tools' | 'pay_mode' | 'budget' | 'deadline' | 'description',
  string
>;

/**
 * Envoie une demande de mission (Web3Forms, ou mailto: tant que la clé n'est pas configurée).
 * Résout 'sent' si l'e-mail est parti, 'mailto' si le client mail a été ouvert ; lève une erreur sinon.
 */
export async function sendMission(
  payload: MissionPayload & Record<string, string>,
  subject = `[Mission ${payload.client_type}] ${payload.mission_type} — ${payload.name}`
): Promise<'sent' | 'mailto'> {
  if (!isKeyConfigured()) {
    window.location.href = buildMailto(payload, subject);
    return 'mailto';
  }
  const res = await fetch(WEB3FORMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: WEB3FORMS_ACCESS_KEY,
      subject,
      from_name: 'Demande de mission — cv-consultant-it',
      ...payload
    })
  });
  const json: { success?: boolean } = await res.json();
  if (!res.ok || !json.success) throw new Error('web3forms error');
  return 'sent';
}

export function initForm(): void {
  const form = document.getElementById('mission-form') as HTMLFormElement | null;
  const success = document.getElementById('form-success');
  const msg = document.getElementById('form-msg');
  if (!form || !success || !msg) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';

    if (!form.reportValidity()) {
      msg.textContent = t('form.required');
      return;
    }

    const btn = form.querySelector<HTMLButtonElement>('.btn-submit')!;
    btn.disabled = true;
    btn.textContent = t('form.sending');

    try {
      if ((await sendMission(collectPayload(form))) === 'sent') {
        form.hidden = true;
        success.hidden = false;
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch {
      msg.textContent = t('form.error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('form.submit');
    }
  });
}

export function prefillClientType(type: 'B2B' | 'B2C'): void {
  const input = document.querySelector<HTMLInputElement>(`input[name="client_type"][value="${type}"]`);
  if (input) input.checked = true;
}

export function prefillOffer(): void {
  prefillClientType('B2B');
  const set = (sel: string, value: string): void => {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(sel);
    if (el) el.value = value;
  };
  set('#f-mission-type', 'site-vitrine');
  set('#f-pay-mode', 'Forfait');
  const budget = document.querySelector<HTMLInputElement>('#f-budget');
  if (budget && !budget.value.trim()) budget.value = t('offers.site.budget');
}
