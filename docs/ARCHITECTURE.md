# Architecture

Ce document explique les décisions techniques, pourquoi elles ont été prises,
et les arbitrages écartés.

---

## 1. Analyse du cahier des charges : contradictions relevées

Le cahier des charges demande de signaler toute contradiction (§ « Ne supprime
aucune exigence de ce document sans me le signaler »). Sept points ont dû être
arbitrés.

### 1.1 « Authentification » contre « pas de serveur » et « 0 € »

Le §44 demande une authentification avec session persistante et déconnexion,
et « aucune donnée accessible avant authentification ». Le §43 demande de ne
pas construire de backend si le stockage local suffit, et le §45 impose 0 €.

**Arbitrage retenu.** Une authentification **locale** : une phrase secrète
dérive, par PBKDF2-SHA-256 à 600 000 itérations, la clé AES-GCM-256 qui chiffre
le coffre sur l'appareil. Aucune donnée n'est lisible avant déverrouillage,
la session persiste (option explicite), la déconnexion existe.

Cela satisfait l'intention du §44 — *mes données ne sont pas accessibles* — et
va plus loin que ce qu'un backend gratuit offrirait : il n'y a pas de base
distante à compromettre, pas de secret dans le frontend, et découvrir l'URL ne
donne accès qu'à une application vide. La différence honnête à énoncer : ce
n'est pas une authentification **serveur**, et il n'y a donc pas de
récupération de mot de passe.

### 1.2 « Synchronisation quand la connexion revient » (§42) contre l'absence de serveur

Sans serveur, il n'y a rien avec quoi synchroniser. **Non implémenté.** Le
transfert et la sauvegarde passent par l'export/import JSON (§57). L'ossature
est prête : le coffre est découpé en documents indépendants et versionnés, ce
qui rend l'ajout d'une synchronisation ultérieure mécanique.

### 1.3 Notifications (§59) contre 0 € et absence de serveur

Les notifications web iOS exigent un serveur de push. Les notifications
**locales programmées** n'existent pas pour une application web. Le §59 les
déclare optionnelles et demande de ne pas bâtir l'architecture autour.
**Non implémenté**, avec une solution de contournement documentée
(rappel iOS / Raccourcis).

### 1.4 Signaux sonores et arrière-plan (§30)

iOS suspend le JavaScript en arrière-plan. Le §30 demande explicitement de ne
pas prétendre qu'une fonctionnalité marche si Safari ne le garantit pas.
**Le chronomètre est conçu pour être juste malgré cela** (horodatages absolus,
rattrapage des phases au retour), les signaux sonores sont annoncés comme
fonctionnant au premier plan uniquement, et le maintien d'écran est demandé.

### 1.5 La structure de séance du §16 ne laisse pas de place aux transitions

L'exemple du §16 (3 + 5 + 5 + 5 + 2 minutes) fait exactement 20:00, sans une
seconde pour changer de position entre les blocs. **Le moteur budgète les
transitions explicitement** : 8 secondes entre blocs, et 5 à 6 secondes pour
se mettre en place avant chaque exercice. Les parts de chaque bloc sont donc
calculées sur le budget *utilisable*, pas sur les 20 minutes brutes. Le §16
précise de ne pas imposer cette structure à toutes les séances, ce qui est
respecté : chaque archétype a sa propre répartition.

### 1.6 Le score athlétique (§36) demande de la vitesse mesurable

Un téléphone posé au sol ne mesure pas la vitesse d'exécution. Plutôt que
d'inventer un chiffre, le sous-score « Vitesse » mesure l'**exposition** au
travail de vitesse et le dit dans son explication. Le §36 exigeant que les
scores proviennent de données mesurables et soient expliqués, c'est la seule
lecture honnête.

### 1.7 « 20 minutes maximum » et le jour de repos (§35)

Un jour de récupération à 20 minutes serait contraire au §35 (« 10–20 minutes
maximum », « ne pas transformer chaque journée en obligation d'entraînement
intense »). Le budget des séances *recovery* est donc de **15 minutes**, et
chaque séance porte son propre budget (`Workout.budgetSec`) plutôt qu'un 20:00
codé en dur.

---

## 2. Choix de la plateforme

### PWA plutôt que natif

Le §« Format » autorise la PWA si le cahier des charges est satisfait. Elle
l'est, et elle apporte :

- **0 €** : pas de compte développeur Apple à 99 €/an, pas de revue App Store.
- **Installation immédiate** : Safari → Partager → Sur l'écran d'accueil.
- **Mise à jour instantanée** : un `git push` suffit.
- **Une seule base de code** pour iPhone, iPad et desktop (§50).

Ce que le natif aurait apporté et qui manque : audio en arrière-plan fiable,
notifications locales programmées, vibration, HealthKit. Les deux premiers sont
documentés comme limitations assumées ; les deux derniers ne sont pas au
périmètre v1.

### Pas de framework méta (Next, Remix)

L'application n'a ni rendu serveur, ni routes API, ni SEO à travailler. Un
build Vite statique est plus simple, plus léger et se déploie n'importe où.

### Routage par hash

Un routeur d'historique exige des règles de réécriture côté hébergeur. Le
routage par hash fonctionne à l'identique depuis un lancement écran d'accueil,
depuis un démarrage à froid et hors connexion, sans configuration. Coût : des
URL en `#/`, sans importance pour une application personnelle.

---

## 3. Stockage : les trois options évaluées

Le §43 demande d'évaluer sérieusement trois options.

| | Option A — local seul | Option B — serverless gratuit | Option C — auth + BDD gratuites |
| --- | --- | --- | --- |
| Confidentialité | **Excellente** : rien ne sort de l'appareil | Moyenne : les données transitent et reposent chez un tiers | Moyenne, avec en plus un compte à sécuriser |
| Persistance | Bonne si installée ; l'export est la sauvegarde | Bonne | Bonne |
| iPhone | Native via IndexedDB | Identique | Identique |
| Hors connexion | **Total par construction** | Demande un cache et une file de synchronisation | Idem, plus la gestion de session expirée |
| Synchronisation | Aucune (export/import) | Possible | Possible |
| Coût | **0 € garanti** | 0 € tant que les quotas tiennent | 0 € tant que les quotas tiennent |
| Complexité | **Faible** | Moyenne | Élevée |
| Surface d'attaque | Le seul appareil | + API, + hébergeur | + API, + BDD, + fournisseur d'identité |

**Option A retenue.** Le §43 conclut explicitement : « Ne crée pas un backend
complexe si le stockage local suffit. » Il suffit — pour un utilisateur, sur un
appareil, avec un besoin de confidentialité élevé. Les options B et C
ajouteraient une dépendance, un risque de quota, une surface d'attaque et une
complexité de synchronisation, pour un seul bénéfice réel : le multi-appareils,
que l'export/import couvre suffisamment en v1.

### Organisation du coffre

Trois documents chiffrés indépendants, chacun sous un nom d'enregistrement
HMAC :

| Document | Contenu | Fréquence d'écriture |
| --- | --- | --- |
| `core` | profil, réglages, progression, récupération, records, résumés de séances, jalons | à chaque changement (~50 Ko) |
| `session:<id>` | une séance complète avec son programme et ses performances | une fois, à la fin |
| `active` | la séance en cours et la position du chronomètre | à chaque résultat, et toutes les 5 s |

Ce découpage évite de réécrire tout l'historique à chaque répétition
enregistrée, tout en gardant l'écriture atomique par document.

---

## 4. Le moteur de génération

C'est le cœur du produit (§15). Rien n'est codé en dur : un *template* fixe la
**forme** d'une séance, le moteur choisit le **contenu**.

```
Profil + Progression + Récupération + Historique + Date
                        │
                        ▼
              resolveToday()          ← quel type de séance aujourd'hui
                        │
                        ▼
              TEMPLATES[archétype]    ← blocs, parts de budget, rôles de slot
                        │
                        ▼
   pour chaque slot : filtres durs → score pondéré → tirage graine
                        │
                        ▼
              prescription par densité travail/repos
                        │
                        ▼
              fitToBudget()           ← arithmétique, bornée, déterministe
                        │
                        ▼
              assert durée ≤ budget   ← lève une erreur sinon
```

### Filtres durs (jamais négociables)

Exclusions déclarées, patterns interdits, matériel absent, espace insuffisant,
impact articulaire au-delà du plafond de fatigue, technicité au-delà du
plafond du slot, et un plafond de niveau pour les exercices hors échelle.

Un détail qui a demandé une correction : le plafond d'impact d'un *slot*
**restreint** le plafond lié à la fatigue, il ne l'élargit jamais. Sans cela,
un athlète épuisé recevait de la pliométrie parce qu'un template l'autorisait.

### Score (chaque composante entre 0 et 1)

| Composante | Poids | Ce qu'elle capture |
| --- | --- | --- |
| Objectifs | 2,2 | recoupement entre les qualités de l'exercice et les objectifs |
| Niveau | 1,6 | position sur l'échelle de mouvement, ou écart au niveau global |
| Récupération | 1,4 | fraîcheur des zones sollicitées |
| Variété | 1,5 | pénalité forte sur ce qui a été fait ces derniers jours |
| Équilibre | 1,2 | dette des groupes musculaires sur 14 jours |
| Spécificité boxe | 0,9 | l'exercice a-t-il un rationnel boxe explicite |
| Préférences | 0,8 | exercices maîtrisés ou déclarés difficiles |
| Adéquation au slot | 0,6 | le slot demande-t-il justement cette qualité |

Le tirage final est pondéré par `score⁶` parmi les cinq meilleurs candidats :
assez concentré pour ne jamais choisir mal, assez ouvert pour que deux lundis
ne soient pas identiques. La graine dérive de la date, donc rouvrir
l'application le même jour montre la même séance.

### Progression par échelle de mouvement

Dix échelles (poussée, poussée verticale, tirage, squat, fente, charnière,
gainage, pliométrie basse, pliométrie haute, burpee). Le moteur ne propose que
l'échelon atteint et celui juste en dessous — jamais le suivant, qui s'obtient
par la progression, pas par le hasard. Si les deux sont inéligibles (matériel
manquant), il redescend l'échelle jusqu'à trouver, puis remonte : un tabouret
absent ne doit pas vider un bloc entier.

La pliométrie haute a été séparée de l'échelle de poussée en cours de
développement : atteindre les pompes explosives ne doit pas exiger d'avoir
d'abord gravi toute l'échelle de force jusqu'aux pompes diamant.

### Ajustement au budget

Trois phases, toutes bornées et déterministes :

1. **Réduction** — si la séance dépasse : on rogne la plus longue prescription
   au-dessus de son plancher, puis les repos, puis un tour. Perdre un tour
   coûte plus que perdre deux répétitions, d'où cet ordre.
2. **Remplissage du travail** — on remonte chaque prescription vers sa dose de
   référence (celle pour laquelle l'exercice est conçu), tant que le budget le
   permet. Une série de cinq pompes rallongée d'une minute de repos n'est pas
   une série de force.
3. **Remplissage du repos** — le reliquat devient du repos, plafonné, puis
   éventuellement de la dose au-delà de la référence.

Les doses d'exercices intenses sont plafonnées plus bas (1,25 × la référence
contre 1,7) : quatre-vingts squats sautés ne sont pas une séance de puissance,
c'est une séance de conditioning avec une moins bonne mécanique.

---

## 5. Le chronomètre

`src/engines/timer/engine.ts` — une classe sans DOM, sans React, avec une
horloge injectable.

**Pourquoi pas un compteur décrémenté.** iOS ralentit ou suspend le JavaScript
d'un onglet en arrière-plan. Un compteur perd silencieusement chaque seconde
manquée. Ici le temps restant est toujours recalculé comme
`échéance − maintenant`.

**Rattrapage.** `tick()` ferme en boucle toutes les phases dont l'échéance est
passée, dans l'ordre, en chaînant les échéances (la phase suivante est réputée
avoir démarré à l'échéance de la précédente, pas « maintenant »). Sans ce
chaînage, une suspension de dix minutes n'avançait que d'une seule phase.

**Instantané gelé.** `serialise()` enregistre le temps **restant**, pas
l'échéance absolue. Rouvrir l'application vingt minutes plus tard reprend là où
la séance s'est arrêtée, au lieu de consommer le reste de la séance comme si
l'athlète s'était entraîné pendant ce temps.

**Fin de phase informative.** L'événement porte `reason` (`elapsed` / `skip`) et
`completedSec`. Sans cela, une phase passée était enregistrée comme réalisée
en entier.

---

## 6. Modèle de récupération

Estimation, jamais mesure (§19, §66).

```
charge_zone = Σ (temps_de_travail × intensité/3 × part_du_muscle)
fatigue    += charge_zone × multiplicateur_ressenti / capacité_zone
fatigue(t)  = fatigue₀ × 0,5^(jours / demi-vie)
```

Demi-vies : jambes 1,7 j · haut du corps 1,5 j · core 1,1 j · cardio 0,9 j.

Les capacités ont été **calibrées sur les charges réellement produites** par le
moteur, mesurées archétype par archétype. La première calibration saturait la
fatigue des jambes à 100 % au bout d'une semaine à cinq séances, ce qui rendait
l'estimation inutile précisément quand elle sert. Les capacités actuelles
donnent : une séance exigeante ≈ 0,40 de fatigue sur la zone dominante (≈ 70 %
de récupération le lendemain matin), et un bloc soutenu de cinq séances par
semaine se stabilise autour de 0,55 au pire.

Le travail de mobilité compte pour 10 % de sa charge : les cercles
articulaires et les étirements sont le remède à la fatigue, pas sa source. Le
compter à taux plein faisait lire un jour de récupération comme un jour
d'entraînement.

---

## 7. Illustrations

Un squelette de 13 articulations dessiné dans un `viewBox` de 100 × 100, animé
d'une pose à l'autre et rendu en SVG inline. Quatre-vingt-neuf poses couvrent
toute la base d'exercices, pour quelques kilo-octets.

Pourquoi pas des images ou des GIF : le poids sur réseau mobile, la
disponibilité hors connexion dès la première ouverture, et surtout les droits —
aucune illustration sous copyright n'est utilisée. Un champ `media` par
exercice permet de basculer vers une photo, un GIF ou une vidéo sans toucher
au code de rendu (§25).

### Le dessin dit le mouvement, le squelette dit le corps

Les poses sont écrites à la main, comme treize paires de coordonnées. C'est
rapide à écrire et ça décrit bien l'intention — mais ça ne décrit aucun corps :
rien n'empêche le même avant-bras de mesurer 4 unités dans un dessin et 16 dans
un autre, ni un bonhomme d'avoir une cuisse plus longue que l'autre.

Les coordonnées sont donc traitées comme l'**intention** : elles fixent l'angle
de chaque articulation, et un mouvement n'est rien d'autre que cela. Le corps,
lui, est reconstruit par-dessus sur un jeu unique d'os aux proportions
anatomiques usuelles (rapports de Drillis & Contini, mis à l'échelle pour que
la pose la plus étendue — bras tendus au-dessus de la tête — tienne dans le
cadre). Le mouvement traverse intact ; le corps cesse de changer de forme d'un
exercice à l'autre.

Conséquence assumée : le bonhomme debout est environ un dixième plus petit
qu'avant, parce que ses bras ont désormais la bonne longueur et que sa portée
bras levés doit tenir dans le même cadre.

### Poser la figure au sol

Le sol est à `y = 96`. Les points d'appui sont lus sur le dessin — ce qui touche
le point le plus bas touche le sol, avec une bande plus large pour les mains et
les pieds quand ce sont eux qui portent — puis la figure est descendue jusqu'à
ce que ses appuis s'équilibrent sur le sol, et chaque membre porteur va
chercher lui-même l'unité ou deux qui restent (cinématique inverse à deux os,
en gardant le sens de flexion du dessin).

Deux pièges, tous deux rencontrés et tous deux couverts par des tests :

- La hauteur doit venir de **où le dessin a mis les mains et les pieds**, jamais
  de la portée maximale des membres. Placer les appuis à bout de bras tend tous
  les membres porteurs : le bas d'une pompe ressort coudes verrouillés, donc
  identique au haut, et la répétition disparaît.
- Certaines poses ne touchent pas le sol du tout, et les replaquer supprime le
  mouvement. Les sauts, la traction — ancrée par les mains sur une barre fixe,
  pour que ce soit le corps qui monte — et le relevé de mollets, dont tout le
  mouvement est justement de décoller, sont ancrés en hauteur (`ANCHORS`).

### Cadencer

Une répétition n'est pas une interpolation linéaire en boucle. Trois choses
séparent un schéma qui tressaute d'un coach qui montre :

- **La boucle est fermée.** La dernière image *est* la première, donc la figure
  ne se téléporte pas au départ à chaque tour. Une séquence qui repasse par une
  même pose (gainage → touche → gainage → touche) boucle telle quelle ; les
  autres font l'aller-retour.
- **Le temps suit la distance parcourue.** Passer par une position
  intermédiaire ne coûte plus autant qu'une descente complète.
- **Les fins de course sont tenues**, et la figure y entre et en sort avec une
  vitesse *et* une accélération nulles. Sans pause, le mouvement se lit comme un
  tremblement plutôt que comme des répétitions comptables.

La descente est plus lente que la remontée : le sens est déduit de la hauteur
du tronc, pas de l'ordre d'écriture des poses, parce que la bibliothèque écrit
tantôt le haut d'abord, tantôt le bas. Et la durée d'une répétition est celle
que l'exercice prescrit (`secondsPerRep`), bornée à une plage regardable : un
Nordic curl à 6 s se voit lentement, une montée de genoux à 1,4 s vivement.

### Interpoler des angles, pas des points

Interpoler les positions des articulations raccourcit les os en cours de route —
mesuré jusqu'à 99 % sur un avant-bras au milieu d'un squat. Les poses sont donc
interpolées en **angles articulaires relatifs au parent** (un coude mesuré
contre son propre bras est un angle de flexion, et interpoler une flexion est
la façon dont un vrai bras bouge), puis reconstruites. Les os gardent leur
longueur au millionième près à chaque image.

### Ce que ça coûte

Normaliser un dessin prend une fraction de milliseconde, et c'est fait à la
première utilisation, pas à l'import : une séance qui montre six exercices paie
six dessins, pas quatre-vingt-neuf. L'animation est écrite directement dans les
attributs SVG sur une seule boucle `requestAnimationFrame` partagée — pas de
rendu React soixante fois par seconde, ce qui sur téléphone fait la différence
entre une démonstration et un à-coup.

### Vérification

`tests/poses.test.ts` mesure ce qui était cassé : os de longueur constante dans
toute la bibliothèque, côtés gauche et droit identiques, appuis réellement au
sol, poses dans le cadre, boucle sans rupture, os rigides pendant tout le
mouvement, temps d'arrêt en fin de course, descente plus lente que la remontée,
et aucune séquence aplatie par la mise au sol. `npm run figures` écrit une
planche contact SVG pour regarder le résultat — un test ne remplace pas l'œil.

---

## 8. Découpage des modules

```
ui ──────────► app ──────────► engines ──────────► data
                │                  │
                └──► storage ◄─────┘
```

Règles tenues :

- **L'UI ne contient aucune logique métier.** Les écrans lisent un état dérivé
  et appellent des actions.
- **Les moteurs ne connaissent ni React ni IndexedDB.** Ils sont des fonctions
  et des classes pures, testables sans navigateur.
- **Seul `storage/` touche au disque**, et seul `storage/crypto.ts` manipule des
  clés.
- **`domain/model/` est le vocabulaire unique.** Muscles, patterns, qualités et
  matériel y sont définis une fois ; tout le reste s'y réfère.

Le store (`app/store.ts`) est le seul endroit où les trois se rencontrent.
C'est aussi là qu'un bug de couture s'est glissé — `derive()` lisait l'état
d'avant la mise à jour, laissant le tableau de bord vide après chaque
rechargement — d'où un banc de tests dédié à ce niveau.

---

## 9. Ce qui reste ouvert

- Pas de tests de rendu des composants : l'interface a été vérifiée par
  pilotage de navigateur réel plutôt que par tests unitaires.
- `store.ts` approche 700 lignes. Il reste cohérent, mais un découpage en
  tranches (session, données, authentification) serait le prochain geste si le
  produit grandit.
- Le plan hebdomadaire est recalculé à la volée à chaque affichage. C'est
  instantané à cette échelle ; une mémoïsation serait nécessaire seulement avec
  un historique de plusieurs milliers de séances.
