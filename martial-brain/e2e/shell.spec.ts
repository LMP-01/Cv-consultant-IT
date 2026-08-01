/**
 * La coquille du cahier des charges UI/UX.
 *
 * Ce que ces parcours vérifient n'est pas « c'est joli » — ça ne se teste pas.
 * Ils vérifient les promesses vérifiables du document : la palette s'ouvre au
 * clavier et ouvre une fiche à l'Entrée, plusieurs fiches restent ouvertes en
 * onglets, le fil d'Ariane dit toujours où l'on est, et les réglages
 * d'accessibilité changent réellement l'affichage.
 *
 * Ce sont précisément les points qui cassent en silence : une régression sur
 * Ctrl+K ne lève aucune erreur, elle rend juste l'application pénible.
 */
import { expect, test, type Page } from '@playwright/test';

async function freshApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.shell', { timeout: 30_000 });
  await expect(page.locator('.nav-item[href="#/t/technique"] .count')).toHaveText('7');
}

test.describe('coquille', () => {
  test('barre supérieure, barre latérale et fil d’Ariane sont toujours là', async ({ page }) => {
    await freshApp(page);

    await expect(page.locator('.topbar .brand')).toContainText('Combat OS');
    await expect(page.locator('.breadcrumb')).toContainText('Tableau de bord');

    // Les 16 modules sont dans la barre latérale, décisions comprises.
    await expect(page.locator('.nav-item[href^="#/t/"]')).toHaveCount(16);
    await expect(page.locator('.nav-item[href="#/t/decision"]')).toContainText('Décisions');

    // Fil d'Ariane sur une fiche : module puis identifiant.
    await page.goto('/#/t/technique');
    await page.locator('.row', { hasText: 'Mae Geri' }).first().click();
    const crumbs = page.locator('.breadcrumb');
    await expect(crumbs).toContainText('Techniques');
    await expect(crumbs).toContainText('K003');
  });

  test('plusieurs fiches restent ouvertes en onglets', async ({ page }) => {
    await freshApp(page);

    await page.goto('/#/t/technique');
    await page.locator('.row', { hasText: 'Mae Geri' }).first().click();
    await page.goto('/#/t/counter');
    await page.locator('.row').first().click();

    const tabs = page.locator('.tab');
    await expect(tabs.filter({ hasText: 'K003' })).toHaveCount(1);
    await expect(tabs.filter({ hasText: 'C001' })).toHaveCount(1);
    await expect(tabs.filter({ hasText: 'C001' })).toHaveClass(/active/);

    // Revenir à un onglet déjà ouvert le réactive au lieu d'en créer un second.
    const before = await tabs.count();
    await tabs.filter({ hasText: 'K003' }).click();
    await expect(page.locator('h1')).toContainText('Mae Geri');
    await expect(tabs).toHaveCount(before);

    // Fermer l'onglet actif bascule sur son voisin, jamais sur du vide.
    await tabs.filter({ hasText: 'K003' }).locator('.close').click();
    await expect(tabs.filter({ hasText: 'K003' })).toHaveCount(0);
    await expect(page.locator('.tab.active')).toBeVisible();
  });
});

test.describe('palette de commandes', () => {
  test('Ctrl+K ouvre, la frappe filtre, Entrée ouvre la fiche', async ({ page }) => {
    await freshApp(page);

    await page.keyboard.press('Control+k');
    await expect(page.locator('.cmdk')).toBeVisible();

    await page.keyboard.type('K003');
    // Un identifiant exact passe en tête : la première entrée EST la fiche.
    await expect(page.locator('.cmdk-item').first()).toContainText('Mae Geri');

    await page.keyboard.press('Enter');
    await expect(page.locator('.cmdk')).toHaveCount(0);
    await expect(page.locator('h1')).toContainText('Mae Geri');
  });

  test('les commandes créent sans passer par les menus', async ({ page }) => {
    await freshApp(page);

    await page.keyboard.press('Control+k');
    await page.keyboard.type('importer une video');
    await page.keyboard.press('Enter');

    // « Importer une vidéo » ouvre le formulaire Ressource DÉJÀ réglé sur
    // Vidéo — sinon la commande n'est qu'un raccourci vers un formulaire vide.
    await expect(page.locator('h1')).toContainText('Ressource');
    await expect(page.locator('select').first()).toHaveValue('Vidéo');
  });

  test('Échap referme sans naviguer', async ({ page }) => {
    await freshApp(page);
    const before = page.url();

    await page.keyboard.press('Control+k');
    await expect(page.locator('.cmdk')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cmdk')).toHaveCount(0);
    expect(page.url()).toBe(before);
  });
});

test.describe('accessibilité', () => {
  test('thème, contraste et taille du texte changent l’affichage et survivent au rechargement', async ({
    page,
  }) => {
    await freshApp(page);

    // Mode sombre par défaut, comme le demande le cahier des charges.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator('button[aria-label="Passer en mode clair"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.locator('button[aria-label="Profil et affichage"]').click();
    await page.locator('.pop-row', { hasText: 'Contraste' }).getByRole('button', { name: 'Élevé' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');

    await page.locator('.pop-row', { hasText: 'Taille' }).getByRole('button', { name: '130' }).click();
    await expect(page.locator('html')).toHaveAttribute('style', /--font-scale:\s*1\.3/);

    // Le réglage doit tenir : c'est un choix d'accessibilité, pas une lubie de
    // session. Et il doit être posé AVANT le premier pixel, sans clignotement.
    await page.reload();
    await page.waitForSelector('.shell');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  });

  test('un identifiant se copie et le confirme', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'permission presse-papiers spécifique à Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await freshApp(page);

    await page.goto('/#/t/technique');
    await page.locator('.row', { hasText: 'Mae Geri' }).first().click();
    await page.locator('h1').waitFor();

    await page.locator('.code').first().click();
    await expect(page.locator('.copied')).toContainText('copié');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('K003');
  });
});

test.describe('timeline et calendrier', () => {
  test('les fiches datées se relisent par année et par mois', async ({ page }) => {
    await freshApp(page);

    await page.goto('/#/timeline');
    await expect(page.locator('.tl-item')).not.toHaveCount(0);
    // La décision du jeu d'amorçage est datée : elle doit apparaître.
    await expect(page.locator('.timeline')).toContainText('D001');

    // Un point de la timeline ouvre sa fiche.
    await page.locator('.tl-item', { hasText: 'D001' }).click();
    await expect(page.locator('h1')).toContainText('trois armes');

    await page.goto('/#/calendar/2026-11');
    await expect(page.locator('.cal-day')).not.toHaveCount(0);
    await expect(page.locator('.rows')).toContainText('Championnat régional');
  });
});

test.describe('LUIS AI', () => {
  test('occupe la place libre sur grand écran et connaît la fiche ouverte', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await freshApp(page);

    // Le dock est ouvert d'office là où la place existe — c'est tout l'objet :
    // cet espace était vide.
    await expect(page.locator('.luis')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-luis', 'open');

    // Le pack de méthode est installé au premier démarrage, sinon LUIS
    // démarrerait sans rien d'autre que des fiches vides.
    await page.locator('.luis-head .chip', { hasText: 'Mixte' }).click();
    await expect(page.locator('.corpus-row', { hasText: 'Fondamentaux' })).toContainText('passage');
    await page.locator('.corpus-head .icon-btn').click();

    // Sur une fiche, la question porte sur la fiche sans qu'on ait à le dire.
    await page.goto('/#/t/technique');
    await page.locator('.row', { hasText: 'Mae Geri' }).first().click();
    await expect(page.locator('.luis-focus')).toContainText('K003');
    await expect(page.locator('.luis-compose textarea')).toHaveAttribute(
      'placeholder',
      /K003/,
    );
  });

  test('se ferme, se rouvre au clavier, et laisse un bouton déplaçable', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await freshApp(page);

    await page.locator('.luis-head').getByRole('button', { name: 'Fermer LUIS AI' }).click();
    await expect(page.locator('.luis')).toHaveCount(0);
    await expect(page.locator('.luis-fab')).toBeVisible();

    await page.keyboard.press('Control+j');
    await expect(page.locator('.luis')).toBeVisible();
    await page.keyboard.press('Control+j');
    await expect(page.locator('.luis')).toHaveCount(0);

    // Le bouton se déplace, et la position tient au rechargement : un bouton
    // fixe masque toujours quelque chose, et ce quelque chose dépend de l'écran.
    const fab = page.locator('.luis-fab');
    const before = await fab.boundingBox();
    await page.mouse.move(before!.x + 20, before!.y + 20);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.up();

    const after = await fab.boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(50);
    // Un déplacement n'ouvre pas le panneau — sinon on ne pourrait jamais
    // déplacer sans ouvrir.
    await expect(page.locator('.luis')).toHaveCount(0);

    await page.reload();
    await page.waitForSelector('.shell');
    const restored = await page.locator('.luis-fab').boundingBox();
    expect(Math.abs(restored!.x - after!.x)).toBeLessThan(4);
  });

  test('sur mobile, un bouton flottant plutôt qu’une colonne', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await freshApp(page);

    // Pas de colonne à prendre sur 390 px : le panneau ne s'ouvre pas seul.
    await expect(page.locator('.luis')).toHaveCount(0);
    await page.locator('.luis-fab').click();
    await expect(page.locator('.luis')).toBeVisible();

    // Et il prend tout l'écran, plutôt que de laisser une bande inutilisable.
    const box = await page.locator('.luis').boundingBox();
    expect(box!.width).toBeGreaterThan(380);
  });

  test('sans clé, LUIS le dit au lieu d’échouer en silence', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await freshApp(page);
    await expect(page.locator('.luis-intro .banner')).toContainText('Aucune clé IA');
  });
});
