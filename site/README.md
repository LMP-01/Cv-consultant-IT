# Site — IA & data consulting (thème clair)

Landing page bilingue FR/EN : prestations IA & data, offre **Site vitrine PME à 700 € HT**, réalisations, formulaire de demande de mission envoyé par email (Web3Forms).

En ligne : https://lmp-01.github.io/ia-data-consulting/

## Développement

```bash
cd site
npm ci
npm run dev        # http://localhost:5173
npm run build      # build de production dans site/dist
```

## Structure

- `index.html` : toutes les sections (hero, chiffres, bande vidéo, prestations, offres, réalisations, boîte à outils, formulaire, mentions légales).
- `src/styles.css` : design system clair. Les tokens sont dans `:root` (ivoire `#F7F7F4`, encre `#0B1020`, bleu `#2F5BFF`, violet `#7C3AED`) ; polices Space Grotesk (titres) et Inter (texte).
- Hero : la sphère de la maquette animée par Kling (`public/media/sphere.mp4`, poster `sphere.jpg`), fondue dans le fond par un masque radial, avec un léger effet de profondeur à la souris (`src/main.ts`).
- `src/media.ts` : boucles vidéo des cartes. La `<video>` n'est créée qu'à l'entrée à l'écran, mise en pause en sortant. Seul le poster s'affiche en reduced-motion ou en mode économie de données.
- `src/form.ts` : formulaire → Web3Forms. `prefillOffer()` pré-remplit la demande « Site vitrine PME ».
- `src/i18n.ts` + `src/locales/{fr,en}.json` : tous les textes.

## Assets

| Fichier | Origine |
|---|---|
| `public/media/*.mp4` | Boucles Kling 3.0 (5 s, muettes), encodées en H.264 ≤ 400 Ko |
| `public/media/*.jpg` | Posters (1ʳᵉ image de chaque clip) et visuels GPT Image 2.5 |
| `public/og.jpg` | Image de partage social 1200×630 |
| `public/devis/Devis_Site_Vitrine_PME_EPTA5.pdf` | Devis type généré par `.github/workflows/build_devis_site_pme.py` |
| `public/cv/*.pdf` | CV FDE FR et EN |

Réencoder un clip : `ffmpeg -i in.mp4 -vf scale=960:-2 -c:v libx264 -pix_fmt yuv420p -profile:v high -crf 28 -preset slow -an -movflags +faststart out.mp4`

## Devis PDF

```bash
pip install reportlab==4.5.0
python .github/workflows/build_devis_site_pme.py   # depuis la racine du repo
```

La sortie est reproductible (`invariant=1`). Committez le PDF régénéré : il est servi tel quel par le site.

## Email (Web3Forms)

La clé d'accès est dans `src/form.ts` (`WEB3FORMS_ACCESS_KEY`). Pour la changer, créez-en une sur https://app.web3forms.com.

## Déploiement

`.github/workflows/deploy-site.yml` compile le site sur chaque PR, et le déploie sur GitHub Pages à chaque push sur `main` qui touche `site/**`.
