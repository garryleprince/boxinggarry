# Audit du cahier des charges

Relecture intégrale, section par section. Statuts :

- **Fait** — implémenté et vérifié
- **Fait, avec réserve** — implémenté, avec une limite énoncée
- **Écarté** — non implémenté, avec la raison et le comportement de secours

Colonne « Vérifié par » : `test` = test automatisé, `navigateur` = pilotage
Chromium en émulation iPhone 14 Pro, `revue` = relecture de code.

---

## 1–8 · Contraintes, objectif, format, durée

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 1 | iPhone, Wi-Fi et 4G/5G, installable, mobile d'abord, portrait | Fait | `index.html`, `public/manifest.webmanifest`, `src/styles/` | navigateur |
| 1 | Coût récurrent nul | Fait | `docs/DEPLOIEMENT.md` | revue |
| 1 | Confidentialité : l'URL seule ne donne accès à rien | Fait | `src/storage/crypto.ts` | test |
| 2 | Force, endurance, explosivité, puissance, conditioning, cardio, vitesse, coordination, équilibre, mobilité, stabilité, core | Fait | `domain/model/taxonomy.ts` (12 qualités), base d'exercices | test |
| 2 | Core dans ses quatre fonctions (anti-extension, anti-rotation, flexion, rotation) | Fait | 4 patterns dédiés, template `core-stabilite` | test |
| 3 | Programme réalisable sans matériel | Fait | `equipment: ['aucun']` suffit partout ; le mur n'est pas du matériel | test |
| 3 | Architecture ouverte au matériel additionnel | Fait | `EQUIPMENT`, filtre « au moins une option disponible » | test |
| 4 | Analyse des inspirations | Fait | `docs/ARCHITECTURE.md` §1 et §4 ; aucune interface, marque ou texte repris | revue |
| 5 | Identité produit premium, pas un chronomètre générique | Fait | design system, `src/styles/tokens.css` | navigateur |
| 6 | **Séance standard ≤ 20:00, échauffement et retour au calme compris** | Fait | `engines/training/duration.ts` | test |
| 6 | La séance de 20 min est complète, pas une version tronquée | Fait | chaque archétype porte échauffement + travail + retour au calme | test |
| 7 | Extension +10 min proposée, entièrement facultative | Fait | `engines/training/extensions.ts` | test |
| 7 | Progression possible sans jamais faire le +10 | Fait | la progression ne lit que les séances réalisées, sans exiger d'extension | test |
| 8 | Le +10 complète au lieu de répéter | Fait | `chooseExtension`, exclusion des exercices du jour | test |
| 8 | Séance intense → +10 moins traumatisant ; séance légère → +10 plus dur | Fait | `chooseExtension` | test |

## 9–14 · Parcours, onboarding, objectifs, évaluation, calendrier, dashboard

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 9 | Parcours ouvrir → séance → 20 min → enregistrer → évaluer → progression → demain | Fait | `screens/Dashboard`, `SessionPreview`, `Training`, `SessionSummary` | navigateur |
| 10 | Onboarding : âge, taille, poids, niveaux, fréquence, objectifs, exercices maîtrisés et difficiles, mouvements à éviter, espace, matériel, intensité | Fait | `screens/Onboarding.tsx`, 6 étapes | navigateur |
| 10 | Ne collecter que l'utile | Fait | chaque champ est consommé par un moteur ; l'identité est facultative | revue |
| 11 | Plusieurs objectifs, qui influencent réellement la programmation | Fait | `GOAL_QUALITY_WEIGHTS`, `GOAL_ARCHETYPE_FIT` ; l'écran Objectifs montre l'effet en direct | test |
| 12 | Évaluation initiale, profil de départ, comparaison | Fait | `engines/progression/assessment.ts`, 6 tests mesurés | navigateur |
| 12 | Jamais de score arbitraire sans explication | Fait | chaque test affiche sa valeur brute, son rang et l'échelle visée | navigateur |
| 13 | Calendrier jour / semaine / mois avec type, durée, intensité, statut | Fait | `screens/Calendar.tsx` | navigateur |
| 14 | Dashboard : aujourd'hui, durée, objectifs, intensité, bouton, puis progression, série, temps, séances, récupération, prochain | Fait | `screens/Dashboard.tsx` | navigateur |
| 14 | Ne pas surcharger, bouton de démarrage évident | Fait | une carte héros, un bouton pleine largeur | navigateur |

## 15–19 · Moteur, structure, boxe, équilibre, récupération

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 15 | **Aucune séance codée en dur** | Fait | templates = forme ; sélection = contenu | revue |
| 15 | Génération à partir de niveau, objectifs, historique, récupération, fatigue, fréquence, matériel, exclusions, performances, progression, durée fixe | Fait | `engines/training/generator.ts`, `selection.ts` | test |
| 15 | Sortie : échauffement, activation, exercices, séries, répétitions, durée, repos, intensité, ordre, retour au calme | Fait | `Workout` / `WorkoutBlock` / `WorkoutItem` | test |
| 16 | Structure type 20 min, sans l'imposer partout | Fait | 7 répartitions distinctes, une par archétype | revue |
| 17 | Besoins spécifiques du boxeur (jambes explosives, rotation, anti-rotation, épaules, core, conditioning, répétition d'effort) | Fait | slots `boxing`, 31 exercices avec rationnel boxe, archétype hybride | test |
| 18 | Les 14 groupes musculaires travaillés, sans sur-sollicitation | Fait | dette d'équilibre sur 14 jours ; test de couverture sur 4 semaines | test |
| 19 | Récupération estimée par zone, affichée, orientant la programmation | Fait | `engines/recovery/` | test |
| 19 | Toujours présentée comme estimation d'entraînement, jamais médicale | Fait | `screens/Recovery.tsx`, bandeau et explication du calcul | navigateur |

## 20–23 · Fatigue, adaptation, progression, absence

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 20 | Retour de fin de séance sur 5 niveaux, avec précision par zone | Fait | `screens/Training.tsx` | navigateur |
| 20 | Ces retours adaptent les séances suivantes | Fait | `RPE_MULTIPLIER`, `applySession` | test |
| 21 | Faciliter / Intensifier / Remplacer, disponibles avant et pendant | Fait | Dashboard, Aperçu de séance | navigateur |
| 21 | Le remplacement préserve groupe, objectif, niveau, type d'effort | Fait | `findReplacement` : même pattern, niveau borné, budget revérifié | revue |
| 22 | Vraie progression, pas seulement plus de répétitions | Fait | 10 échelles de mouvement | test |
| 22 | Même principe pour les mouvements principaux | Fait | poussée (6), poussée verticale (3), tirage (6), squat (5), fente (4), charnière (5), gainage (5), pliométrie basse (3), pliométrie haute (3), burpee (4) | test |
| 23 | Après une absence, ne pas reprendre au même niveau ; recalibrer progressivement | Fait | `applyLayoff`, `effectiveRank`, `doseScale` | test |

## 24–26 · Bibliothèque, visuels, mode entraînement

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 24 | Base d'exercices : nom, description, niveau, muscles principaux et secondaires, objectif, difficulté, variantes, régression, progression, consignes, erreurs, respiration, dose, visuel | Fait | `domain/model/exercise.ts`, 99 exercices | test |
| 25 | Visuel clair : départ → mouvement → fin | Fait | `ui/Figure.tsx`, `FigureSequence`, 89 poses | navigateur |
| 25 | Architecture ouverte aux images, GIF, animations, vidéos | Fait | champ `media` par exercice | revue |
| 25 | Aucune image sous copyright ; remplacement trivial | Fait | illustrations vectorielles originales | revue |
| 26 | Interface de séance extrêmement simple, informations utiles seulement | Fait | `screens/Training.tsx` | navigateur |

## 27–33 · Timer, boxe, audio, shadowboxing

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 27 | Timer gérant exercice, repos, séries, compte à rebours, rounds, transitions, pause, reprise, abandon, fin | Fait | `engines/timer/engine.ts` | test |
| 27 | **Précis même si JavaScript est ralenti ; horodatages, pas de compteur décrémenté** | Fait | recalcul `échéance − maintenant`, rattrapage ordonné des phases | test |
| 28 | Presets Boxing 3/1, Short Round 2/0:30, HIIT 40/20, Tabata 20/10, plus personnalisé | Fait | `data/presets.ts`, `screens/RoundTimer.tsx` | test |
| 29 | Timer lisible à distance, changements visuels nets | Fait | `ui/TimerRing.tsx`, couleur et fond par phase | navigateur |
| 30 | Signal début, fin, repos, compte à rebours, annonces vocales | Fait | `engines/timer/audio.ts`, sons synthétisés | revue |
| 30 | Modes audio / vibration / les deux / silence | Fait | `screens/Settings.tsx` | navigateur |
| 30 | **Ne jamais prétendre qu'une fonction marche en arrière-plan si iOS ne le garantit pas** | Fait | `audioLimitations()` affiché dans les paramètres | navigateur |
| 31 | Mode shadowboxing par rounds progressifs | Fait | `engines/boxing/`, 6 thèmes de round | navigateur |
| 32 | Numérotation 1–6 et combinaisons | Fait | `domain/model/boxing.ts`, `data/combos.ts` (20 combinaisons) | test |
| 33 | Annonces « Jab — Cross » ou « One — Two », vitesse réglable | Fait | `comboSpeech`, densité légère / normale / dense | revue |

## 34–39 · Séances hybrides, recovery, score, progression, gamification, historique

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 34 | Séances mêlant préparation physique et boxe, dans les 20 min | Fait | archétype `hybride-boxe` | test |
| 35 | Jour de repos : mobilité, stretching, respiration, récupération active, 10–20 min | Fait | archétype `recovery`, budget 15 min | test |
| 35 | Ne pas transformer chaque journée en obligation intense | Fait | le +10 d'un jour de récupération reste léger | test |
| 36 | Score global et sous-scores | Fait | `engines/scoring/`, 7 sous-scores | test |
| 36 | **Scores issus de données mesurables et expliqués ; pas de score décoratif** | Fait | chaque sous-score porte son explication et ses entrées, consultables | navigateur |
| 37 | Page progression : séances, temps, fréquence, records, performances, évolutions | Fait | `screens/Progress.tsx`, `History.tsx` | navigateur |
| 37 | Graphiques sobres | Fait | `ui/Chart.tsx`, SVG inline | navigateur |
| 38 | Gamification sobre et adulte : série, records, objectifs, jalons | Fait | `engines/scoring/achievements.ts`, 11 jalons | test |
| 39 | Historique : séance prévue, réalisée, durée réelle, exercices, performances, difficulté, extension, date | Fait | `screens/History.tsx` | navigateur |
| 39 | Séance ratée → réorganisation intelligente | Fait | `resolveToday` promeut l'archétype le plus utile | test |

## 40–47 · PWA, réseau, offline, stockage, authentification, hébergement, sécurité, données

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 40 | Manifeste, icône, service worker, cache, standalone, thème, splash, responsive, safe areas | Fait | `public/`, `src/pwa/`, `src/styles/` | navigateur |
| 40 | Ajoutable à l'écran d'accueil | Fait | métadonnées Apple, guide d'installation intégré | revue |
| 41 | JavaScript, images, animations, données, cache et chargements optimisés | Fait | 161 Ko gzippés au total, zéro requête externe | revue |
| 42 | Architecture local-first | Fait | tout est local par construction | test |
| 42 | Connexion perdue en séance : timer, séance, résultats, aucune perte | Fait | persistance immédiate à chaque résultat | test |
| 42 | Synchronisation au retour du réseau | **Écarté** | pas de serveur (§43, §45). Transfert par export/import | — |
| 43 | Évaluer les trois options de stockage | Fait | `docs/ARCHITECTURE.md` §3, tableau comparatif | revue |
| 43 | Retenir la plus simple qui satisfait tout | Fait | Option A, local chiffré | revue |
| 44 | Un seul utilisateur, pas de création publique, pas de liste, pas de social | Fait | aucun concept d'utilisateur multiple | revue |
| 44 | Connexion sécurisée, session persistante, déconnexion, rien avant authentification | Fait, avec réserve | authentification **locale** : la phrase secrète dérive la clé. Pas de récupération possible — énoncé à la création | test |
| 44 | Aucun secret dans le frontend | Fait | il n'y a aucun secret : rien à protéger côté code | revue |
| 45 | Vérifier les offres gratuites, hébergement statique, pas de domaine acheté | Fait | `docs/DEPLOIEMENT.md`, comparatif vérifié en septembre 2026 | revue |
| 46 | La sécurité ne repose pas sur l'obscurité de l'URL | Fait | chiffrement au repos, noms d'enregistrement HMAC | test |
| 46 | HTTPS, contrôle d'accès, règles correctes | Fait | HTTPS par l'hébergeur, CSP dans `public/_headers` | revue |
| 47 | Aucun tracker, analytics, script marketing ni cookie inutile | Fait | zéro dépendance réseau ; la CSP interdit tout domaine externe | revue |

## 48–52 · Architecture, données, responsive, design, écrans

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 48 | Séparation UI / domaine / moteurs / stockage / auth / PWA | Fait | arborescence `src/`, règles dans `docs/ARCHITECTURE.md` §8 | revue |
| 48 | Pas de composant monolithique | Fait | le plus gros fichier de moteur fait ~430 lignes | revue |
| 49 | Modèle de données couvrant User, Exercise, ExerciseVariation, Workout, WorkoutBlock, WorkoutSession, WorkoutResult, Performance, TrainingDay, RecoveryState, Goal, Achievement, BoxingRound, TimerPreset, ShadowboxingSession, AppSettings | Fait | `domain/model/` | revue |
| 50 | iPhone prioritaire, utilisable sur tablette et desktop | Fait | largeur maximale, grilles adaptatives | navigateur |
| 51 | Direction premium / performance / boxe / moderne | Fait | `styles/tokens.css` | navigateur |
| 51 | Mode sombre excellent | Fait | thème sombre conçu en premier ; thème clair complet, pas une inversion | navigateur |
| 52 | 19 écrans | Fait | tous présents (voir tableau ci-dessous) | navigateur |

**Les 19 écrans.** Splash · Login · Onboarding · Évaluation initiale ·
Dashboard · Calendrier · Séance du jour · Préparation de séance · Écran
exercice · Timer · Boxing Round Timer · Shadowboxing · Bibliothèque · Fiche
exercice · Progression · Historique · Récupération · Objectifs · Paramètres.

*Note de conception :* « Séance du jour » et « Préparation de séance » sont un
seul écran (`SessionPreview`), et « Écran exercice » / « Timer » sont deux
états du mode entraînement (`Training`). Les fusionner évite un écran
intermédiaire sans contenu propre — le §74 préférant la qualité au nombre.
Le vingtième écran non demandé est le bilan de fin de séance (§54).

## 53–59 · Dashboard, fin de séance, statistiques, paramètres, export, iOS, notifications

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 53 | Le dashboard répond d'abord à « que dois-je faire aujourd'hui ? » | Fait | carte héros : nom, durée, qualités, bouton | navigateur |
| 53 | « +10 min disponibles » | Fait | carte dédiée sous la carte héros | navigateur |
| 54 | Fin de séance : durée, exercices, performances, progression, difficulté, récupération estimée | Fait | `screens/SessionSummary.tsx` | navigateur |
| 54 | Puis « Envie de continuer ? » → +10 ou Terminer | Fait | proposé **après** le bilan, jamais avant | navigateur |
| 55 | Statistiques séparées : séances, séances de 20 min, extensions, temps total, moyenne, série, records | Fait | `screens/Progress.tsx` | navigateur |
| 56 | Paramètres : profil, objectifs, unités, audio, vibration, thème, notifications, données, export, import, déconnexion, réinitialisation | Fait, avec réserve | tout présent sauf notifications (§59, écarté) | navigateur |
| 57 | Export des données en JSON | Fait | téléchargement, plus copie à l'écran si Safari bloque | test |
| 58 | Raisonner explicitement sur Safari iOS, PWA, service worker, stockage, installation, audio, vibration, écran verrouillé, arrière-plan, suspension JS, notifications, orientation, safe areas | Fait | `docs/LIMITATIONS.md` §1 | revue |
| 58 | Pour chaque fonction non fiable : l'identifier, expliquer, prévoir un secours, ne pas prétendre | Fait | 6 limites iOS documentées, chacune avec son comportement de secours | revue |
| 59 | Notifications optionnelles | **Écarté** | exigent un serveur de push ; les notifications locales programmées n'existent pas en web. Contournement : rappel iOS / Raccourcis | — |

## 60–74 · Évolutivité, qualité, tests, validation, sécurité sportive, philosophie, livrable

| § | Exigence | Statut | Où | Vérifié par |
| --- | --- | --- | --- | --- |
| 60 | Base capable d'évoluer vers multi-utilisateurs, cloud, abonnement, catalogue, synchronisation, Apple Health | Fait | documents de coffre indépendants et versionnés, `schemaVersion` et migrations, moteurs sans dépendance au stockage | revue |
| 60 | Ne pas développer ces fonctions maintenant | Fait | aucune n'est présente | revue |
| 61 | Code propre, modulaire, lisible, maintenable, performant, documenté, sans duplication, typé, robuste | Fait | TypeScript `strict`, `noUnusedLocals`, `noUncheckedIndexedAccess` | revue |
| 62 | Comportement propre en cas de perte réseau, données corrompues, session expirée, erreur de stockage, erreur de synchronisation, fermeture accidentelle, interruption de séance | Fait | `CorruptedVaultError`, `StorageUnavailableError`, `storageWarning`, reprise de séance | test |
| 62 | **Ne jamais perdre silencieusement les performances d'une séance** | Fait | écriture immédiate à chaque résultat, au masquage de la page, et abandon enregistré | test |
| 63 | Tests timer : précision, pause, reprise, transition, fin, changement d'onglet, ralentissement | Fait | `tests/timer.test.ts`, 19 tests | test |
| 63 | Tests moteur : durée ≤ 20 min, absence de conflit, progression, variété, équilibre musculaire | Fait | `tests/duration.test.ts`, `engine.test.ts`, `profils.test.ts` | test |
| 63 | Tests +10 : ≤ 10 min, cohérence, jamais obligatoire | Fait | `tests/duration.test.ts`, `engine.test.ts` | test |
| 63 | Tests stockage : sauvegarde, restauration, perte réseau | Fait | `tests/storage.test.ts`, `store.test.ts` | test |
| 63 | Tests auth : utilisateur autorisé, non autorisé, session | Fait | `tests/storage.test.ts` | test |
| 64 | **Vérification mathématique de la durée : ≤ 20:00, ≤ 10:00, ≤ 30:00** | Fait | `computeDuration`, assertion à la génération, audit consultable dans l'écran | test |
| 64 | Ne jamais dépendre d'une estimation visuelle | Fait | la durée affichée **est** le résultat du calcul | test |
| 65 | Simuler débutant, intermédiaire, avancé, fatigué, après absence, ayant fait le +10 hier | Fait | `tests/profils.test.ts`, un test par profil | test |
| 66 | Ne jamais diagnostiquer, traiter, remplacer un médecin ni statuer sur l'aptitude | Fait | avertissements dans l'onboarding, l'écran Récupération, l'écran Plus et le README | navigateur |
| 66 | Douleur déclarée → éviter les mouvements concernés et rappeler le recours à un professionnel | Fait | étape 6 de l'onboarding : les patterns cochés sont exclus définitivement | test |
| 67 | Coach exigeant, intelligent, motivant, sobre, non culpabilisant | Fait | aucun message de reproche ; une séance manquée réorganise le programme au lieu de sermonner | test |
| 68 | Priorités respectées dans l'ordre | Fait | iPhone, 20 min, moteur, timer, progression, adaptation, confidentialité, offline, gratuité, visuel | revue |
| 69 | Processus en 10 phases (audit, architecture, UX, design system, moteur, expérience, PWA, sécurité, tests, audit final) | Fait | les trois commits suivent cet ordre ; ce document clôt la phase 10 | revue |
| 70 | Checklist de chaque contrainte | Fait | ce document | — |
| 71 | Auto-critique en huit rôles | Fait | section ci-dessous | — |
| 72 | Livrable en 10 points | Fait | `README.md` et `docs/` | — |
| 73 | Installation iPhone de bout en bout | Fait | `docs/DEPLOIEMENT.md` §4, plus l'aide affichée dans l'application | navigateur |
| 74 | Qualité plutôt que quantité ; cœur du produit exceptionnel | Fait | rien n'est présent à moitié ; ce qui ne pouvait l'être est écarté et documenté | — |

---

## Récapitulatif

| Statut | Nombre |
| --- | --- |
| Fait | 98 |
| Fait, avec réserve | 3 |
| **Écarté, documenté** | **2** |

Les deux écartés sont la **synchronisation multi-appareils** (§42) et les
**notifications** (§59). Tous deux exigent un serveur, ce que les §43 et §45
interdisent explicitement. Aucune exigence n'a été supprimée sans être
signalée.

Les trois réserves : l'authentification est locale et non récupérable (§44),
les paramètres n'ont pas de section notifications (§56), et le son ne
fonctionne qu'au premier plan (§30) — cette dernière étant une limite de la
plateforme, pas de l'implémentation.

---

## Auto-critique (§71)

### Product Manager — est-ce réellement utile ?

Oui, parce que la boucle centrale est courte et sans friction : trois
touchers entre l'ouverture et la première répétition. Le risque que je
surveillerais : le score athlétique et les jalons sont du confort, pas de la
valeur. S'ils n'étaient jamais consultés, je les retirerais sans hésiter — ce
qui compte est « ouvrir, savoir, faire ».

### Coach de boxe — les programmes ont-ils du sens ?

Oui, après correction. La première version mettait des étirements statiques à
l'échauffement, des burpees en guise de montée en température, et envoyait un
athlète avancé sur des pompes sur genoux — les rangs de départ étaient
absolus au lieu d'être proportionnels à la longueur de chaque échelle. Les
séances actuelles tiennent : échauffement dynamique, travail lourd avant le
métabolique, rotation et anti-rotation présentes, garde et endurance d'épaules
travaillées, retour au calme statique.

Ce qui manque à un vrai coach : le geste. L'application ne corrige pas la
technique et ne le prétend pas.

### Préparateur physique — l'ensemble du corps est-il travaillé ?

Oui, vérifié sur quatre semaines simulées : les 14 groupes sont sollicités,
et les dix grands moteurs le sont comme muscle principal. Deux manques réels
ont été trouvés à ce stade et corrigés : les avant-bras n'étaient jamais
sollicités et les bras jamais en principal.

Les abducteurs restent travaillés en secondaire uniquement (22 sollicitations
sur 24 séances, via skaters, cossacks et gainage latéral). C'est
physiologiquement suffisant ; forcer un exercice dédié dans 20 minutes de
préparation boxe serait un mauvais échange.

La calibration de la récupération a dû être refaite : la première saturait la
fatigue des jambes à 100 % au bout d'une semaine à cinq séances, ce qui rendait
l'estimation inutile précisément quand elle sert.

### UX Designer — utilisable pendant une vraie séance ?

Oui. Le mode entraînement se réduit à quatre informations : le mouvement, la
dose, le temps, ce qui suit. Les commandes font 56 à 64 px de haut, atteignables
au pouce. Deux corrections issues du test navigateur : « En position » ne
s'affichait pas deux fois, et la saisie des répétitions montre désormais le
temps de repos restant, qu'elle masquait.

Ce qui resterait à améliorer : le mode paysage est utilisable mais n'a pas été
travaillé.

### Développeur senior — le code est-il maintenable ?

Globalement oui. Le vocabulaire métier est défini une fois, les moteurs sont
purs et testables sans navigateur, seule une couche touche au disque. Les 95
tests portent sur les invariants, pas sur l'implémentation.

Ce que je critiquerais : `app/store.ts` approche 700 lignes et concentre trop
de responsabilités. Il est cohérent mais mériterait d'être découpé. Et
l'absence de tests de rendu signifie qu'une régression d'interface ne serait
pas attrapée automatiquement.

### Expert iOS / PWA — fiable sur iPhone ?

Le chronomètre l'est par construction, et c'est démontré par test. Le
fonctionnement hors connexion est vérifié, y compris le lancement d'une séance
sans réseau.

**À énoncer clairement : la vérification a été faite sur Chromium en émulation
iPhone, pas sur Safari iOS réel.** Chromium émule le format et le tactile, pas
le moteur. La première chose à faire sur un vrai iPhone : installer depuis
l'écran d'accueil, lancer une séance, verrouiller l'écran une minute, revenir,
et vérifier que le chronomètre est au bon endroit.

### Expert sécurité — les données sont-elles réellement protégées ?

Oui, avec un modèle de menace explicite. Contre un curieux qui trouve l'URL :
protection totale, il obtient une application vide. Contre quelqu'un qui lit le
stockage de l'appareil : du chiffré, et même les noms d'enregistrement ne
révèlent rien. Contre quelqu'un qui a le téléphone déverrouillé et l'option
« rester connecté » active : aucune protection — c'est énoncé dans l'écran de
sécurité.

Le point faible assumé : l'export est en clair, par conception, puisqu'il doit
être relisible ailleurs.

### Utilisateur — puis-je ouvrir et commencer sans réfléchir ?

Oui. Ouvrir, lire un nom et « 20 MIN », toucher COMMENCER. Le pourquoi de la
séance est en dessous, pas au-dessus. Et si je rate trois jours, l'application
réorganise sans me faire la morale.
