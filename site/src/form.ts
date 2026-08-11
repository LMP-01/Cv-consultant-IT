import { t } from './i18n';

// Clé d'accès Web3Forms (https://web3forms.com — gratuit).
// À créer avec l'adresse theo.mansopro@gmail.com puis coller ici.
// Tant que la clé est le placeholder, le formulaire bascule en mailto:.
const WEB3FORMS_ACCESS_KEY = 'REMPLACER_PAR_VOTRE_CLE_WEB3FORMS';
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
const FALLBACK_EMAIL = 'theo.mansopro@gmail.com';

function isKeyConfigured(): boolean {
  return /^[0-9a-f-]{36}$/i.test(WEB3FORMS_ACCESS_KEY);
}

function collectPayload(form: HTMLFormElement): Record<string, string> {
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

function buildMailto(p: Record<string, string>): string {
  const subject = `[Mission ${p.client_type}] ${p.mission_type} — ${p.name}`;
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
    '',
    'Description :',
    p.description
  ].join('\n');
  return `mailto:${FALLBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

    const payload = collectPayload(form);

    if (!isKeyConfigured()) {
      // Pas encore de clé Web3Forms : on ouvre le client mail du prospect.
      window.location.href = buildMailto(payload);
      return;
    }

    const btn = form.querySelector<HTMLButtonElement>('.btn-submit')!;
    btn.disabled = true;
    btn.textContent = t('form.sending');

    try {
      const res = await fetch(WEB3FORMS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: `[Mission ${payload.client_type}] ${payload.mission_type} — ${payload.name}`,
          from_name: 'Demande de mission — cv-consultant-it',
          ...payload
        })
      });
      const json: { success?: boolean } = await res.json();
      if (!res.ok || !json.success) throw new Error('web3forms error');
      form.hidden = true;
      success.hidden = false;
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
