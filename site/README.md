# Site interactif 3D — Demande de mission

Landing page 3D (Three.js) bilingue FR/EN permettant à un prospect d'envoyer une demande de mission (outils, TJM/forfait/régie, description) par email, avec choix B2B / B2C.

## Développement

```bash
cd site
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans site/dist
```

## Activer l'envoi d'email (2 minutes, gratuit)

Le formulaire utilise [Web3Forms](https://web3forms.com) — service gratuit, sans backend, qui transforme le POST du formulaire en email dans votre boîte.

1. Allez sur https://web3forms.com et entrez **theo.mansopro@gmail.com**
2. Vous recevez une **Access Key** (format UUID) par email
3. Collez-la dans `site/src/form.ts` :
   ```ts
   const WEB3FORMS_ACCESS_KEY = 'votre-cle-ici';
   ```
4. Commitez et poussez : le site redéploie automatiquement

Tant que la clé n'est pas configurée, le bouton « Envoyer la demande » ouvre le client mail du prospect avec le message pré-rempli (`mailto:`), donc rien n'est perdu.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-site.yml` construit et déploie le site à chaque push sur `main` touchant `site/**`.

**Activation initiale (une seule fois)** : dans les settings GitHub du repo → **Pages** → Source : **GitHub Actions**.

URL : https://lmp-01.github.io/Cv-consultant-IT/

## Structure

- `src/scene.ts` — scène Three.js : flux de particules « data streams », grille Tron, icosaèdre wireframe, parallax souris
- `src/form.ts` — formulaire de mission → Web3Forms (fallback mailto)
- `src/i18n.ts` + `src/locales/{fr,en}.json` — tout le texte de la page
- `src/styles.css` — design futuriste (néons cyan/magenta, scanlines, animations ease-out < 300 ms)

Accessibilité : `prefers-reduced-motion` respecté (scène statique, compteurs instantanés), fallback si WebGL indisponible, navigation clavier du modal (Escape pour fermer).
