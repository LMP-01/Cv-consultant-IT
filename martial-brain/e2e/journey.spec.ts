/**
 * The journey that proves the app is a graph and not fifteen lists:
 * create a technique, create a combination that references it, log a sparring
 * that mentions both — then check all three fiches cite each other and the
 * graph connects the three nodes.
 *
 * Everything a link buys you is downstream of that working.
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * Boot the app on a clean database.
 *
 * No storage clearing here: Playwright gives every test its own browser
 * context, so IndexedDB starts empty anyway. Deleting it from inside the page
 * was actively harmful — the app holds an open connection, so the delete is
 * deferred and lands *after* the next boot has seeded and saved, wiping it.
 */
async function freshApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.brand', { timeout: 30_000 });
  // Wait for the seed's counts. Matched by href, not label: "Techniques" is
  // also a substring of "Erreurs techniques".
  await expect(page.locator('.nav-item[href="#/t/technique"] .count')).toHaveText('7');
}

/** Fill the title field and any named descriptor fields, then save. */
async function createFiche(
  page: Page,
  type: string,
  title: string,
  links: string[] = [],
): Promise<void> {
  await page.goto(`/#/new/${type}`);
  await page.locator('#f-title').fill(title);

  for (const code of links) {
    // Each relation group has its own search box; find the one that offers it.
    const search = page.locator('.rel-group input[type="search"]');
    const count = await search.count();
    for (let i = 0; i < count; i += 1) {
      const box = search.nth(i);
      await box.fill(code);
      const option = page.locator('.rel-group .chip', { hasText: code }).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
        break;
      }
      await box.fill('');
    }
  }

  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('h1')).toContainText(title);
}

test.describe('graphe de connaissances', () => {
  test('une fiche créée depuis un côté est visible depuis l’autre', async ({ page }) => {
    await freshApp(page);

    // The seed already gives us K001 Jab; hang a new combination off it.
    await createFiche(page, 'combo', 'Test — Jab puis crochet', ['K001']);

    // The combination shows the technique…
    await expect(page.locator('.aside')).toContainText('K001');

    // …and, crucially, the technique now shows the combination, although the
    // link was only ever created from the combination's side.
    await page.goto('/#/t/technique');
    await page.locator('.row', { hasText: 'Jab' }).first().click();
    await expect(page.locator('h1')).toContainText('Jab');
    await expect(page.locator('.aside')).toContainText('Test — Jab puis crochet');
  });

  test('un sparring alimente l’historique des fiches qu’il mentionne', async ({ page }) => {
    await freshApp(page);

    await createFiche(page, 'sparring', 'Test — séance du jour', ['K001', 'A001']);

    // The technique's "Historique" is derived from the bouts linked to it —
    // nobody typed it into a field.
    await page.goto('/#/t/technique');
    await page.locator('.row', { hasText: 'Jab' }).first().click();
    await expect(page.getByRole('heading', { name: 'Historique' })).toBeVisible();
    await expect(page.locator('.rows')).toContainText('Test — séance du jour');
  });

  test('le graphe relie les nœuds et se centre sur une fiche', async ({ page }) => {
    await freshApp(page);

    await page.goto('/#/graph');
    const caption = page.locator('.pane .sub').last();
    await expect(caption).toContainText('fiches');

    const text = (await caption.textContent()) ?? '';
    const [fiches, relations] = (text.match(/(\d+) fiches · (\d+) relations/) ?? []).slice(1);
    expect(Number(fiches)).toBeGreaterThan(20);
    expect(Number(relations)).toBeGreaterThan(30);

    // Focus mode: open a fiche and jump to its neighbourhood.
    await page.goto('/#/t/technique');
    await page.locator('.row', { hasText: 'Mae Geri' }).first().click();
    await page.locator('.page-head').getByRole('link', { name: 'Graphe' }).click();
    await expect(page.getByRole('heading', { name: 'Voisinage' })).toBeVisible();
    await expect(page.locator('.chip', { hasText: '2 sauts' })).toBeVisible();
  });
});

test.describe('recherche', () => {
  test('trouve malgré les accents et saute directement sur un identifiant', async ({ page }) => {
    await freshApp(page);
    await page.goto('/#/search');

    const box = page.locator('input[type="search"]').first();
    // "déséquilibre" appears in O Soto Gari's description, not its title —
    // so this also checks that search reaches the descriptor fields.
    await box.fill('desequilibre');
    await expect(page.locator('.rows')).toContainText('O Soto Gari');

    // An exact code is a lookup, not a search. (The AI panel shows its own
    // banner above, so scope this to the one that follows the search box.)
    await box.fill('K003');
    await expect(page.locator('.banner').filter({ hasText: 'K003' })).toContainText('Mae Geri');
  });

  test('filtre par module', async ({ page }) => {
    await freshApp(page);
    await page.goto('/#/search');
    await page.locator('.chip', { hasText: 'Contres' }).first().click();
    await expect(page.locator('.rows .row')).toHaveCount(1);
  });
});

test.describe('cycle de vie d’une fiche', () => {
  test('création, modification et suppression', async ({ page }) => {
    await freshApp(page);

    await createFiche(page, 'principle', 'Test — principe jetable');
    await page.getByRole('link', { name: 'Modifier' }).click();
    await page.locator('#f-title').fill('Test — principe renommé');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('h1')).toContainText('renommé');

    page.on('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.locator('h1')).toContainText('Principes');
    await expect(page.locator('.rows')).not.toContainText('principe renommé');
  });
});

test.describe('persistance', () => {
  test('les modifications survivent au rechargement', async ({ page }) => {
    await freshApp(page);
    await createFiche(page, 'tactic', 'Test — tactique persistée');

    await page.reload();
    await page.waitForSelector('.brand');
    await page.goto('/#/t/tactic');
    await expect(page.locator('.rows')).toContainText('Test — tactique persistée');
  });
});

test.describe('sans clé IA', () => {
  test('tout fonctionne, et le panneau IA le dit', async ({ page }) => {
    await freshApp(page);

    await page.goto('/#/search');
    await expect(page.locator('.banner')).toContainText('clé IA');
    // The ordinary search still works right underneath it.
    await page.locator('input[type="search"]').first().fill('mae');
    await expect(page.locator('.rows')).toContainText('Mae Geri');

    await page.goto('/#/analytics');
    await expect(page.getByRole('heading', { name: 'Lecture statistique' })).toBeVisible();
    await expect(page.locator('.banner')).toContainText('calculés en SQL');
  });
});
