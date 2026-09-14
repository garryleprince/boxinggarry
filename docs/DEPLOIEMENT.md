# Déploiement et installation

## 1. Choix de l'hébergement

Le build produit un dossier `dist/` entièrement statique : du HTML, du JS, du
CSS, un manifeste, un service worker et cinq icônes. N'importe quel hébergeur
statique convient. Les offres gratuites ont été vérifiées en septembre 2026 :

| Hébergeur | Bande passante gratuite | HTTPS | Sous-domaine | Remarque |
| --- | --- | --- | --- | --- |
| **Cloudflare Pages** | illimitée sur l'actif statique | oui | `*.pages.dev` | **Recommandé** — 500 builds/mois, 10 Go de stockage |
| GitHub Pages | 100 Go/mois | oui | `*.github.io` | Dépôt public requis sans abonnement Pro |
| Netlify | 300 crédits/mois (facturation à crédits depuis 2025) | oui | `*.netlify.app` | Coût moins prévisible |
| Vercel | 100 Go/mois | oui | `*.vercel.app` | Usage personnel uniquement |

Cloudflare Pages est retenu : c'est le seul dont l'actif statique n'est pas
compté, ce qui supprime tout risque de dépassement, et le plan gratuit n'exige
rien d'autre qu'un compte.

---

## 2. Déployer sur Cloudflare Pages

### Depuis Git (recommandé — redéploie à chaque push)

1. Pousser ce dépôt sur GitHub ou GitLab.
2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Pages** → **Connect to Git**.
3. Sélectionner le dépôt, puis configurer :
   - **Framework preset** : `Vite`
   - **Build command** : `npm run build`
   - **Build output directory** : `dist`
   - **Node version** : rien à faire, `.node-version` s'en charge
4. **Production branch** : la branche qui contient réellement le projet.
   C'est le piège le plus courant — Cloudflare construit la branche **par
   défaut du dépôt**, pas celle sélectionnée à la création. Si le projet vit
   sur une branche de travail, il faut la désigner ici, sinon le build échoue
   sur `Could not read package.json` : le clone a bien réussi, mais la branche
   construite ne contient pas le projet.
5. **Save and Deploy**.

L'application est en ligne sur `https://<projet>.pages.dev`, en HTTPS, servie
depuis le réseau Cloudflare.

### Si le build échoue sur `Could not read package.json`

Le clone a réussi mais la branche construite ne contient pas `package.json`.
Deux corrections possibles :

- **Settings → Builds & deployments → Production branch** : désigner la bonne
  branche, puis **Retry deployment** ;
- ou fusionner la branche de travail dans la branche par défaut du dépôt, ce
  qui rend la configuration par défaut correcte.

La version de Node est fixée par `.node-version` (22) et par le champ
`engines` de `package.json` : il n'y a pas besoin de définir `NODE_VERSION` à
la main.

### Depuis la machine locale

```bash
npm run build
npx wrangler pages deploy dist --project-name=boxing-body-coach
```

`wrangler` demande une authentification au premier lancement.

### En-têtes recommandés

Créer `public/_headers` avant le build pour durcir la politique de sécurité et
garantir que le service worker n'est jamais servi depuis un cache périmé :

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

/sw.js
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

Ce fichier est déjà présent dans le dépôt : Cloudflare Pages le lit
automatiquement. Netlify utilise le même format ; GitHub Pages ne permet pas
d'en-têtes personnalisés — le service worker y sera revalidé par défaut, ce qui
reste correct.

---

## 3. Déployer sur GitHub Pages

```bash
npm run build
npx gh-pages -d dist          # ou pousser dist/ sur la branche gh-pages
```

Attention : GitHub Pages sert sous `https://<compte>.github.io/<dépôt>/`, un
sous-chemin. Il faut alors construire avec une base :

```bash
npm run build -- --base=/boxing-body-coach/
```

et adapter `start_url` / `scope` dans `public/manifest.webmanifest`, ainsi que
le `scope` du service worker. Un déploiement à la racine d'un domaine (ou sur
Cloudflare Pages) évite entièrement ce sujet, ce qui est la raison de la
recommandation.

---

## 4. Installer sur iPhone

L'application doit être **ajoutée à l'écran d'accueil** pour bénéficier du
mode plein écran, du fonctionnement hors connexion et d'un stockage non soumis
à l'effacement automatique de Safari au bout de sept jours.

1. Ouvrir **Safari** (Chrome iOS ne propose pas l'installation) et se rendre
   sur l'URL de l'application.
2. Créer sa phrase secrète. Elle chiffre les données sur l'appareil et
   **n'est récupérable d'aucune manière** — la noter ailleurs si besoin.
3. Toucher le bouton **Partager** (le carré avec la flèche vers le haut).
4. Faire défiler, puis choisir **« Sur l'écran d'accueil »**.
5. Toucher **« Ajouter »** en haut à droite.
6. Lancer l'application depuis son icône : elle s'ouvre en plein écran, sans
   barre d'adresse, et apparaît dans le sélecteur d'applications.

L'application affiche elle-même ces étapes au bout de quelques secondes lors
d'une première visite depuis Safari iOS.

### Réglages iOS utiles

- **Réglages → Écran et luminosité → Verrouillage auto.** : mettre une valeur
  longue. L'application demande le verrouillage d'écran (`Screen Wake Lock`,
  disponible depuis iOS 16.4), mais ce réglage est le filet de sécurité.
- **Ne pas utiliser la navigation privée** : IndexedDB y est indisponible ou
  volatile, et l'application ne pourrait rien enregistrer.
- Dans les paramètres de l'application, toucher **« Demander un stockage
  persistant »** après l'installation.

---

## 5. Mise à jour

Le service worker détecte une nouvelle version et affiche un bandeau
« Une nouvelle version est prête ». L'athlète touche **Mettre à jour** : le
nouveau worker prend le contrôle et la page se recharge. Aucune donnée n'est
perdue — le coffre est indépendant du code.

---

## 6. Sauvegarde

Il n'existe **aucune copie côté serveur**. La seule sauvegarde est l'export :

**Paramètres → Données → Exporter mes données (JSON)**

Le fichier est en clair, lisible et réimportable. À conserver dans iCloud
Drive, Fichiers ou ailleurs. Un export mensuel est une bonne habitude ; c'est
ce qui protège contre un effacement du stockage par iOS, une réinitialisation
du téléphone ou une phrase secrète oubliée.
