# Boxing Body Coach

Coach de préparation physique au poids du corps, spécialisé pour la boxe.
Progressive Web App locale, chiffrée, sans serveur, sans compte, sans coût.

> **20 minutes pour progresser. +10 minutes si j'ai envie d'aller plus loin.**

---

## Le cœur du produit

J'ouvre l'application → elle sait ce que je dois faire → je m'entraîne
20 minutes → elle mesure ma progression → elle adapte la suite.

Tout le reste sert cette boucle.

---

## Ce que l'application fait réellement

| Capacité | Où c'est implémenté |
| --- | --- |
| Génère une séance de 20 min adaptée au jour, au niveau, aux objectifs, à la récupération et à l'historique | `src/engines/training/` |
| Garantit **mathématiquement** que la séance tient dans son budget | `src/engines/training/duration.ts` |
| Propose un module +10 min qui complète la séance au lieu de la répéter | `src/engines/training/extensions.ts` |
| Fait progresser le long d'échelles de mouvement (pompes murales → … → pompes claquées) | `src/engines/progression/` |
| Recalibre après une coupure, sans reprendre où on s'était arrêté | `src/engines/progression/index.ts` |
| Estime la récupération par zone et équilibre les 14 groupes musculaires | `src/engines/recovery/` |
| Chronomètre fiable même quand iOS suspend le JavaScript | `src/engines/timer/engine.ts` |
| Round timer de boxe et shadowboxing avec combinaisons appelées | `src/engines/boxing/`, `src/engines/timer/` |
| Boxing Athlete Score, chaque sous-score traçable jusqu'à ses données | `src/engines/scoring/` |
| Chiffre tout sur l'appareil, sans serveur ni compte | `src/storage/`, `src/auth/` |
| Fonctionne hors connexion, installable sur l'écran d'accueil | `src/pwa/`, `public/sw.js` |

99 exercices, 10 échelles de progression, 7 archétypes de séance, 8 modules +10,
20 combinaisons de boxe, 4 presets de rounds.

---

## Démarrage

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 95 tests
npm run build      # dist/
npm run preview    # sert dist/ localement
```

Node 20 ou plus. Aucune clé d'API, aucun fichier `.env`, aucun service externe.

---

## Structure du projet

```
src/
  app/            Coquille applicative : routage, store, liaison React du timer
  domain/model/   Types métier — vocabulaire unique de toute l'application
  data/           Base d'exercices, poses vectorielles, combinaisons, presets
  engines/
    training/     Génération de séances : templates, sélection, durée, plan
    progression/  Échelles de mouvement, évaluation initiale, recalibrage
    recovery/     Estimation de fatigue et dette d'équilibre musculaire
    timer/        Chronomètre par horodatages, phases, audio
    boxing/       Rounds, shadowboxing, appels de combinaisons
    scoring/      Boxing Athlete Score, jalons, séries
  screens/        Les 19 écrans
  ui/             Design system : primitives, illustrations, graphes, icônes
  storage/        Coffre chiffré, IndexedDB, schéma et migrations
  auth/           Session d'authentification locale
  pwa/            Service worker, installation
  styles/         Tokens, base, composants
tests/            Durée, moteur, timer, stockage et chiffrement
docs/             Architecture, audit du cahier des charges, limitations
public/           Manifeste, icônes, service worker
```

Règle structurante : **l'UI ne contient aucune logique métier, les moteurs
ne connaissent ni React ni IndexedDB, et seul `src/storage/` touche au disque.**

---

## Technologies

| Choix | Version | Pourquoi |
| --- | --- | --- |
| React | 19 | Écosystème mûr, rendu prévisible |
| TypeScript | 5.9, `strict` | Le domaine est typé de bout en bout |
| Vite | 7 | Build rapide, sortie statique pure |
| Zustand | 5 | Store de 1 Ko, sans boilerplate |
| Vitest | 3 | Même résolution de modules que le build |
| CSS natif | — | Tokens et cascade suffisent ; zéro runtime |
| Web Crypto | natif | PBKDF2 + AES-GCM, clés non extractibles |
| IndexedDB | natif | Persistance locale, wrapper maison de 120 lignes |
| Web Audio | natif | Signaux synthétisés, aucun fichier audio |
| SVG inline | — | Illustrations originales, animées, ~6 Ko au total |

**Aucune dépendance de production hors React et Zustand.** Pas de bibliothèque
de graphes, d'icônes, de composants, de dates ni de routage : chaque kilo-octet
est téléchargé par l'athlète en 4G.

Poids de l’application : **~161 Ko gzippés** (JS + CSS + HTML).

---

## Coût réel

| Poste | Coût |
| --- | --- |
| Hébergement statique (Cloudflare Pages) | 0 € |
| Bande passante | 0 € — trafic statique non facturé |
| Sous-domaine `*.pages.dev` + HTTPS | 0 € |
| Base de données | 0 € — il n'y en a pas |
| Authentification | 0 € — locale, sans serveur |
| Stockage | 0 € — IndexedDB sur l'appareil |
| API, CDN, synchronisation, analytics | 0 € — aucun |
| **Total récurrent** | **0 €/mois** |

Le seul coût possible serait un nom de domaine, volontairement écarté.

---

## Déploiement

Voir [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) pour la procédure détaillée
(Cloudflare Pages, GitHub Pages, Netlify) et l'installation sur iPhone.

Version courte, Cloudflare Pages :

1. Pousser ce dépôt sur GitHub.
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Build command `npm run build`, output directory `dist`.
4. Déployer. L'URL `https://<projet>.pages.dev` est en HTTPS, gratuite et
   illimitée en bande passante statique.

---

## Sécurité et confidentialité

- **Aucune donnée ne quitte l'appareil.** Il n'y a pas de serveur applicatif,
  donc rien à intercepter et aucun secret dans le frontend.
- **Tout est chiffré au repos** : AES-GCM-256, clé dérivée par PBKDF2-SHA-256
  à 600 000 itérations depuis une phrase secrète jamais stockée.
- **Les noms d'enregistrement IndexedDB sont des HMAC** : même les clés de la
  base ne révèlent pas les dates d'entraînement.
- **Découvrir l'URL ne donne accès à rien** : un visiteur obtient une
  application vide, avec son propre stockage local.
- **Aucun tracker, analytics, cookie ni script tiers.** Le CSP du build ne
  charge rien depuis l'extérieur.

Un test vérifie qu'aucune donnée lisible n'atteint IndexedDB
(`tests/storage.test.ts`).

---

## Limitations connues

Documentées en détail dans [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).
Les trois principales :

1. **Les signaux sonores ne fonctionnent qu'au premier plan.** iOS suspend le
   JavaScript en arrière-plan et à l'écran verrouillé. Le chronomètre reste
   juste — il se resynchronise instantanément au retour — mais aucun bip ne
   sonne pendant ce temps.
2. **La vibration n'existe pas dans Safari iOS.** `navigator.vibrate` n'y est
   pas exposé. L'application le détecte et le dit, plutôt que de proposer une
   option inerte.
3. **Pas de synchronisation multi-appareils.** C'est le prix du zéro serveur.
   L'export/import JSON assure le transfert et la sauvegarde.

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — décisions techniques,
  moteur de génération, modèle de données, arbitrages
- [`docs/AUDIT.md`](docs/AUDIT.md) — les exigences du cahier des charges,
  une par une, avec leur statut et ce qui les vérifie
- [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) — mise en ligne et installation
  sur iPhone
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) — ce qui ne marche pas, pourquoi,
  et le comportement de secours

---

## Avertissement

Boxing Body Coach est une application d'entraînement général. Elle ne pose
aucun diagnostic, ne traite aucune blessure, ne remplace pas un professionnel
de santé et ne détermine pas l'aptitude médicale à la pratique sportive. Les
pourcentages de récupération sont des **estimations d'entraînement** calculées
à partir du volume prescrit et du ressenti déclaré, jamais des mesures
physiologiques. En cas de douleur, arrêter et consulter.

---

## Prochaines améliorations possibles

Dans l'ordre où je les ferais, en expliquant pourquoi.

1. **Valider sur un iPhone réel.** La vérification a été faite sur Chromium en
   émulation iPhone. Le premier geste est d'installer depuis l'écran d'accueil,
   lancer une séance, verrouiller l'écran une minute, revenir, et confirmer que
   le chronomètre est au bon endroit. Rien d'autre ne devrait précéder cela.
2. **Tests de rendu des composants.** Les moteurs sont couverts ; l'interface
   ne l'est que par pilotage de navigateur. Un banc de tests de composants
   attraperait les régressions visuelles sans relancer un navigateur.
3. **Découper `app/store.ts`.** Environ 700 lignes, cohérentes mais concentrant
   session, données et authentification. Trois tranches seraient plus lisibles.
4. **Visuels photographiques ou vidéo.** Le champ `media` est déjà là : le
   renseigner exercice par exercice remplace l'animation vectorielle sans
   toucher au code de rendu. C'est le plus gros gain de qualité perçue par
   unité d'effort.
5. **Un vrai chapitre technique de boxe.** L'application entraîne le physique
   du boxeur ; elle n'enseigne pas le geste. Un module de technique avec
   décomposition serait un produit voisin, pas une extension de celui-ci.
6. **Synchronisation multi-appareils**, si le besoin apparaît. L'architecture
   est prête (documents indépendants, versionnés). Cela introduirait un
   serveur, donc un coût et une surface d'attaque : à ne faire que pour un
   besoin réel.
7. **Apple Health.** Écrire les séances dans Santé demanderait une enveloppe
   native ; à envisager seulement si le produit sort du cadre PWA.
8. **Matériel additionnel.** L'architecture accepte déjà barre de traction,
   élastiques, corde, médecine-ball et chaise. Enrichir la base pour chacun
   élargirait le pool sans toucher au moteur.
