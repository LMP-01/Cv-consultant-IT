import { MENU, PICKUP, TAG_LABEL, eur, type Dish, type Tag } from './data';

const CART_KEY = 'nonna-rosa-panier';
const DISHES = new Map<string, Dish>(MENU.flatMap((c) => c.dishes.map((d) => [d.id, d] as const)));

let cart = new Map<string, number>();

// --- Stockage ---

function loadCart(): void {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? '{}') as Record<string, number>;
    cart = new Map(Object.entries(raw).filter(([id, q]) => DISHES.has(id) && q > 0));
  } catch {
    cart = new Map();
  }
}

function saveCart(): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(Object.fromEntries(cart)));
  } catch {
    // Stockage indisponible : le panier vit le temps de la visite.
  }
}

const count = (): number => [...cart.values()].reduce((a, b) => a + b, 0);
const total = (): number => [...cart].reduce((sum, [id, q]) => sum + DISHES.get(id)!.price * q, 0);

// --- Carte ---

function tagBadges(tags: Tag[] = []): string {
  return tags.map((t) => `<span class="tag tag-${t}">${TAG_LABEL[t]}</span>`).join('');
}

function renderMenu(root: HTMLElement): void {
  root.innerHTML = MENU.map(
    (cat) => `
    <section class="menu-cat" id="cat-${cat.id}" aria-labelledby="cat-${cat.id}-title">
      <h3 id="cat-${cat.id}-title">${cat.name}</h3>
      <ul class="dishes">
        ${cat.dishes
          .map(
            (d) => `
          <li class="dish" data-tags="${(d.tags ?? []).join(' ')}">
            <div class="dish-line">
              <h4>${d.name}</h4><span class="dots" aria-hidden="true"></span><p class="dish-price">${eur(d.price)}</p>
            </div>
            <div class="dish-meta">
              <p class="dish-desc">${d.desc}</p>
              ${tagBadges(d.tags)}
            </div>
            ${
              d.takeaway === false
                ? '<p class="dish-note">Sur place uniquement</p>'
                : `<button class="add" type="button" data-add="${d.id}" aria-label="Ajouter ${d.name} au panier">+ Ajouter</button>`
            }
          </li>`
          )
          .join('')}
      </ul>
    </section>`
  ).join('');
}

function applyFilter(root: HTMLElement, filter: string): void {
  root.querySelectorAll<HTMLElement>('.dish').forEach((li) => {
    li.hidden = filter !== 'all' && !li.dataset.tags!.split(' ').includes(filter);
  });
  root.querySelectorAll<HTMLElement>('.menu-cat').forEach((sec) => {
    sec.hidden = !sec.querySelector('.dish:not([hidden])');
  });
  document.querySelectorAll<HTMLElement>('.cat-tabs a').forEach((a) => {
    const target = document.querySelector<HTMLElement>(a.getAttribute('href')!);
    a.hidden = !!target?.hidden;
  });
}

// --- Horaires de retrait ---

const pad = (n: number): string => String(n).padStart(2, '0');
const fmtTime = (m: number): string => `${Math.floor(m / 60)}h${pad(m % 60)}`;

/** Premier jour ouvert (aujourd'hui compris) avec des créneaux de retrait ≥ maintenant + 30 min. */
export function pickupSlots(now = new Date()): { label: string; date: Date; times: number[] } | null {
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const min = i === 0 ? now.getHours() * 60 + now.getMinutes() + 30 : 0;
    const times: number[] = [];
    for (const [a, b] of PICKUP[d.getDay()]) {
      for (let t = a; t <= b - 15; t += 15) if (t >= min) times.push(t);
    }
    if (times.length) {
      const label =
        i === 0 ? 'Aujourd’hui' : i === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return { label, date: d, times };
    }
  }
  return null;
}

// --- Panier ---

let dialog: HTMLDialogElement;

function renderBar(): void {
  const bar = document.querySelector<HTMLElement>('.cart-bar')!;
  const n = count();
  bar.hidden = n === 0;
  bar.querySelector('.cart-bar-text')!.textContent = `Panier · ${n} article${n > 1 ? 's' : ''} · ${eur(total())}`;
  document.querySelectorAll<HTMLElement>('.js-cart-count').forEach((el) => (el.textContent = String(n)));
}

function renderCart(): void {
  const list = dialog.querySelector<HTMLElement>('.cart-lines')!;
  const empty = count() === 0;
  dialog.querySelector<HTMLElement>('.cart-empty')!.hidden = !empty;
  dialog.querySelector<HTMLElement>('.cart-checkout')!.hidden = empty;
  list.innerHTML = [...cart]
    .map(([id, q]) => {
      const d = DISHES.get(id)!;
      return `<li class="cart-line">
        <span class="cart-name">${d.name}</span>
        <span class="qty">
          <button type="button" data-dec="${id}" aria-label="Retirer un ${d.name}">−</button>
          <output aria-label="Quantité">${q}</output>
          <button type="button" data-inc="${id}" aria-label="Ajouter un ${d.name}">+</button>
        </span>
        <span class="cart-price">${eur(d.price * q)}</span>
      </li>`;
    })
    .join('');
  dialog.querySelector('.cart-total-value')!.textContent = eur(total());

  const slots = pickupSlots();
  const select = dialog.querySelector<HTMLSelectElement>('select[name=retrait]')!;
  const current = select.value;
  select.innerHTML = slots
    ? `<optgroup label="${slots.label}">${slots.times.map((t) => `<option value="${t}">${fmtTime(t)}</option>`).join('')}</optgroup>`
    : '<option value="">Aucun créneau cette semaine</option>';
  if (current && select.querySelector(`option[value="${current}"]`)) select.value = current;
  dialog.querySelector('.pickup-day')!.textContent = slots ? slots.label : '';
}

function setQty(id: string, q: number): void {
  if (q <= 0) cart.delete(id);
  else cart.set(id, Math.min(q, 20));
  saveCart();
  renderBar();
  if (dialog.open) renderCart();
}

function add(id: string, btn: HTMLButtonElement): void {
  setQty(id, (cart.get(id) ?? 0) + 1);
  btn.textContent = '✓ Ajouté';
  btn.classList.add('is-added');
  window.setTimeout(() => {
    btn.textContent = '+ Ajouter';
    btn.classList.remove('is-added');
  }, 1100);
  const live = document.getElementById('cart-live');
  if (live) live.textContent = `${DISHES.get(id)!.name} ajouté. ${count()} article${count() > 1 ? 's' : ''} dans le panier.`;
}

export function openCart(): void {
  renderCart();
  dialog.querySelector<HTMLElement>('.cart-flow')!.hidden = false;
  dialog.querySelector<HTMLElement>('.cart-done')!.hidden = true;
  dialog.showModal();
}

function checkout(e: SubmitEvent): void {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (!form.reportValidity() || count() === 0) return;
  const slots = pickupSlots();
  const t = Number((form.elements.namedItem('retrait') as HTMLSelectElement).value);
  const name = (form.elements.namedItem('prenom') as HTMLInputElement).value.trim();
  const n = count();
  const sum = total();
  const num = `NR-${String(Math.floor(1000 + Math.random() * 9000))}`;
  const done = dialog.querySelector<HTMLElement>('.cart-done')!;
  done.querySelector('.cart-done-title')!.textContent = `Grazie, ${name} !`;
  done.querySelector('.cart-done-text')!.textContent =
    `Commande ${num} : ${n} article${n > 1 ? 's' : ''}, ${eur(sum)}. Retrait ${slots ? slots.label.toLowerCase() : ''} à ${fmtTime(t)}, 12 rue des Oliviers.`;
  dialog.querySelector<HTMLElement>('.cart-flow')!.hidden = true;
  done.hidden = false;
  done.querySelector<HTMLElement>('.cart-done-title')!.focus();
  cart.clear();
  saveCart();
  renderBar();
  form.reset();
}

export function initMenu(): void {
  const root = document.querySelector<HTMLElement>('.menu-cats')!;
  dialog = document.querySelector<HTMLDialogElement>('dialog.cart')!;
  loadCart();
  renderMenu(root);

  document.querySelectorAll<HTMLButtonElement>('.filters button').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filters button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      applyFilter(root, btn.dataset.filter!);
    })
  );

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-add]');
    if (btn) add(btn.dataset.add!, btn);
  });

  dialog.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const inc = el.closest<HTMLElement>('[data-inc]');
    const dec = el.closest<HTMLElement>('[data-dec]');
    if (inc) setQty(inc.dataset.inc!, (cart.get(inc.dataset.inc!) ?? 0) + 1);
    if (dec) setQty(dec.dataset.dec!, (cart.get(dec.dataset.dec!) ?? 0) - 1);
    if (el === dialog) dialog.close(); // clic sur le fond
  });
  dialog.querySelectorAll('.js-close-cart').forEach((b) => b.addEventListener('click', () => dialog.close()));
  dialog.querySelector('form')!.addEventListener('submit', (e) => checkout(e as SubmitEvent));
  document.querySelectorAll('.js-open-cart').forEach((b) => b.addEventListener('click', openCart));

  renderBar();
}
