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

const ICONS = `${import.meta.env.BASE_URL}exemples/nonna-rosa/icons/`;
const TAG_ICON: Record<Tag, string> = {
  veg: `<img src="${ICONS}veg.webp" alt="" width="18" height="18" loading="lazy" />`,
  gf: `<img src="${ICONS}gf.webp" alt="" width="18" height="18" loading="lazy" />`
};

function tagBadges(tags: Tag[] = []): string {
  return tags.map((t) => `<span class="tag tag-${t}">${TAG_ICON[t]}${TAG_LABEL[t]}</span>`).join('');
}

let activeCat = MENU[0].id;
let activeFilter = 'all';

const PLUS = '<span aria-hidden="true">+</span>';
const CHECK = '<span aria-hidden="true">✓</span>';

function renderMenu(root: HTMLElement, tabs: HTMLElement): void {
  tabs.innerHTML = MENU.map(
    (cat) =>
      `<button type="button" role="tab" id="tab-${cat.id}" aria-controls="cat-${cat.id}" aria-selected="${cat.id === activeCat}" tabindex="${cat.id === activeCat ? 0 : -1}" data-cat="${cat.id}">${cat.name}</button>`
  ).join('');
  root.innerHTML = MENU.map(
    (cat) => `
    <section class="menu-cat" id="cat-${cat.id}" role="tabpanel" aria-labelledby="tab-${cat.id}">
      <ul class="dishes">
        ${cat.dishes
          .map(
            (d) => `
          <li class="dish" data-tags="${(d.tags ?? []).join(' ')}">
            <div class="dish-body">
              <h4>${d.name}</h4>
              <p class="dish-desc">${d.desc}</p>
              <p class="dish-tags">${tagBadges(d.tags)}</p>
            </div>
            <p class="dish-price">${eur(d.price)}</p>
            ${
              d.takeaway === false
                ? '<p class="dish-note">Sur place</p>'
                : `<button class="add" type="button" data-add="${d.id}" aria-label="Ajouter ${d.name} au panier">${PLUS}</button>`
            }
          </li>`
          )
          .join('')}
      </ul>
      <p class="menu-empty" hidden>Aucun plat de cette catégorie ne correspond au filtre.</p>
    </section>`
  ).join('');
}

function applyView(root: HTMLElement, tabs: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.menu-cat').forEach((sec) => {
    sec.hidden = sec.id !== `cat-${activeCat}`;
    let n = 0;
    sec.querySelectorAll<HTMLElement>('.dish').forEach((li) => {
      li.hidden = activeFilter !== 'all' && !li.dataset.tags!.split(' ').includes(activeFilter);
      if (!li.hidden) n++;
    });
    sec.querySelector<HTMLElement>('.menu-empty')!.hidden = n > 0;
  });
  tabs.querySelectorAll<HTMLButtonElement>('[role=tab]').forEach((t) => {
    const on = t.dataset.cat === activeCat;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
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
  const fab = document.querySelector<HTMLButtonElement>('.cart-fab')!;
  const n = count();
  fab.hidden = n === 0;
  fab.querySelector('.cart-fab-count')!.textContent = String(n);
  fab.querySelector('.cart-fab-total')!.textContent = eur(total());
  fab.setAttribute('aria-label', `Voir le panier : ${n} article${n > 1 ? 's' : ''}, ${eur(total())}`);
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
  btn.innerHTML = CHECK;
  btn.classList.add('is-added');
  const fab = document.querySelector<HTMLElement>('.cart-fab')!;
  fab.classList.remove('bump');
  void fab.offsetWidth;
  fab.classList.add('bump');
  window.setTimeout(() => {
    btn.innerHTML = PLUS;
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
  const tabs = document.querySelector<HTMLElement>('.cat-tabs')!;
  dialog = document.querySelector<HTMLDialogElement>('dialog.cart')!;
  loadCart();
  renderMenu(root, tabs);
  applyView(root, tabs);

  tabs.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('[role=tab]');
    if (!tab) return;
    activeCat = tab.dataset.cat!;
    applyView(root, tabs);
  });
  // Flèches gauche/droite entre les onglets (motif ARIA « tabs »).
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = MENU.findIndex((c) => c.id === activeCat);
    const next = MENU[(i + (e.key === 'ArrowRight' ? 1 : MENU.length - 1)) % MENU.length];
    activeCat = next.id;
    applyView(root, tabs);
    tabs.querySelector<HTMLElement>(`[data-cat="${next.id}"]`)!.focus();
  });

  document.querySelectorAll<HTMLButtonElement>('.filters button').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filters button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      activeFilter = btn.dataset.filter!;
      applyView(root, tabs);
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
