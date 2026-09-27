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

Réencoder un clip : `ffmpeg -i in.mp4 -vf scale=960:-2 -c:v libx264 -pix_fmt yuv420p -profile:v high -crf 28 -preset slow -an -movflags +faststart out.mp4`

## Devis PDF

```bash
pip install reportlab==4.5.0
python .github/workflows/build_devis_site_pme.py   # depuis la racine du repo
```

La sortie est reproductible (`invariant=1`). Committez le PDF régénéré : il est servi tel quel par le site.

## Rendez-vous visio / téléphone

Deux façons d'arriver à la prise de rendez-vous dans la pop-up (`src/wizard.ts`) :
- **À la fin du parcours « Demander une mission » :** étape « On en parle de vive voix ? » (Visio / Téléphone / Pas maintenant), puis le choix du créneau.
- **Par le bouton « Réserver un appel » :** dans le hero, et le lien sous « Vous êtes… ». Il ouvre directement le choix Visio / Téléphone, puis le créneau, puis les coordonnées.

Réglages dans `src/calls.ts` :
- `CALL_SLOTS` : les créneaux proposés (13h, 18h, 19h, 20h, 21h, 22h), heure de Paris.
- `CALL_DAYS` : le calendrier affiché, 14 jours à partir d'aujourd'hui, tous les jours.
- **Faux rendez-vous :**
  - 1 à 3 créneaux sont déjà pris chaque jour, calculés à partir de la date : tout le monde voit les mêmes ;
  - un créneau réservé par le visiteur apparaît ensuite comme pris dans son navigateur.
- Chaque rendez-vous arrive par e-mail via Web3Forms, avec pour objet `[RDV visio] mer. 30/09 19h — Nom` : type, jour, heure et téléphone.
- `CAL_LINK` : laissez vide tant qu'il n'y a pas de compte Cal.com. Renseigné (ex. `theo-manso-pinto/30min`), le choix d'un jour ouvre aussi la page Cal.com correspondante.

## Email (Web3Forms)

La clé d'accès est dans `src/form.ts` (`WEB3FORMS_ACCESS_KEY`). Pour la changer, créez-en une sur https://app.web3forms.com.

## Déploiement

`.github/workflows/deploy-site.yml` compile le site sur chaque PR, et le déploie sur GitHub Pages à chaque push sur `main` qui touche `site/**`.

## Exemples clients

Sites de démonstration à montrer aux prospects. Ils ne sont pas liés depuis la page principale et sont en `noindex`.

### Hamed Coiffeur (salon fictif)

En ligne : https://lmp-01.github.io/ia-data-consulting/exemples/hamed-coiffeur/

- `exemples/hamed-coiffeur/index.html` : la page (tarifs 10 € / 15 €, équipe, réservation, horaires).
- `src/hamed/data.ts` : coiffeurs, prix, horaires d'ouverture, liens Cal.com.
- `src/hamed/booking.ts` : widget de réservation. Les RDV déjà pris sont inventés de façon déterministe (plus chargé le midi, le soir et le samedi). Un créneau réservé est gardé dans le navigateur (`localStorage`). Aucun RDV réel n'est envoyé.
- Design noir et blanc, mise en page éditoriale (aucune couleur).
- `public/exemples/hamed-coiffeur/` :
  - `hamed/sofiane/lucas/ines.jpg` : portraits de l'équipe, générés avec Higgsfield Soul 2.0, passés en N&B. Les prénoms et citations sont fictifs.
  - `hero.jpg`, `og.jpg`, `g1`–`g5.jpg` : vraies photos Unsplash (licence Unsplash, usage commercial libre), converties en N&B :
    - hero / og : Obi, https://unsplash.com/photos/-sRVfY0f2d8
    - g1 : Michael DeMoya, https://unsplash.com/photos/Q82AM6BWBPM
    - g2 : Gulom Nazarov, https://unsplash.com/photos/DrG4V5skbMY
    - g3 : Mr Shave, https://unsplash.com/photos/4k60yfGy7fU
    - g4 : Nathon Oski, https://unsplash.com/photos/EW_rqoSdDes
    - g5 : Hai Phung, https://unsplash.com/photos/m4Pd_e-4zKs

**Brancher un vrai Cal.com :**
1. Créez un compte gratuit sur cal.com.
2. Créez un type d'événement de 30 min par coiffeur, avec les horaires du salon.
3. Remplissez `CAL_LINKS` dans `src/hamed/data.ts`, par exemple `{ any: 'hamed-coiffeur/coupe', hamed: 'hamed-coiffeur/hamed' }`.

« Confirmer » ouvre alors la page Cal.com du coiffeur, sur le bon jour.

### Trattoria Nonna Rosa (restaurant fictif)

En ligne : https://lmp-01.github.io/ia-data-consulting/exemples/nonna-rosa/

- `exemples/nonna-rosa/index.html` : la page (diaporama, histoire, carte, à emporter, réservation, galerie en carrousel, horaires).
- Identité volontairement différente du coiffeur :
  - serif Playfair Display, olive et terracotta ;
  - boutons pilules et ronds, cartes arrondies, photo en arche ;
  - diaporama plein écran ;
  - carte à onglets (une catégorie à la fois) ;
  - panier en bouton flottant et feuille du bas ;
  - nombre de couverts au compteur − / +.
- `src/nonna/data.ts` : carte (26 plats, tags végétarien / sans gluten), services midi/soir, horaires de retrait, capacité de la salle (40 couverts), `CAL_LINK`.
- `src/nonna/menu.ts` : carte à onglets, filtres et panier à emporter. Le panier est gardé dans `localStorage` et s'ouvre dans un tiroir `<dialog>`. Les créneaux de retrait sont proposés par quart d'heure, au plus tôt 30 minutes après l'heure actuelle. Aucune commande réelle n'est envoyée.
- `src/nonna/booking.ts` : réservation de table.
  - Les places restantes sont inventées de façon déterministe : plus chargé le soir, presque complet le vendredi et le samedi soir.
  - Les tables réservées sont déduites grâce à `localStorage`.
  - Si `CAL_LINK` est renseigné, « Confirmer » ouvre Cal.com.
- `public/exemples/nonna-rosa/*.jpg` : vraies photos Unsplash (licence Unsplash), avec un léger étalonnage chaud :
  - slide1 / og : Liubov Ilchuk, https://unsplash.com/photos/_qZOwG2oaj4
  - slide2 : Fabrizio Pullara, https://unsplash.com/photos/vHRFraV4U00
  - slide3 : Eaters Collective, https://unsplash.com/photos/ddZYOtZUnBk
  - story : Vincent Dörig, https://unsplash.com/photos/mciRIMaxiAM
  - g1 : Fabrizio Pullara, https://unsplash.com/photos/vHRFraV4U00
  - g2 : Aurélien Lemasson-Théobald, https://unsplash.com/photos/x00CzBt4Dfk
  - g3 : Rob Wicks, https://unsplash.com/photos/fDLBn8X_IlU
  - g4 : Eaters Collective, https://unsplash.com/photos/ddZYOtZUnBk
  - g5 : Olga Petnyunene, https://unsplash.com/photos/n3GkbNzur3s
