# Limitations connues

Ce document liste ce qui **ne fonctionne pas parfaitement**, pourquoi, et le
comportement de secours retenu. Il est volontairement explicite : une
fonctionnalité qui n'est pas fiable ne doit pas être présentée comme si elle
l'était.

---

## 1. iOS et Safari

### 1.1 Le son ne fonctionne qu'au premier plan

**Ce qui se passe.** Dès que l'application passe en arrière-plan, ou que
l'écran se verrouille, iOS suspend l'exécution du JavaScript. Aucun bip, aucune
annonce vocale, aucun changement de phase audible ne se produit pendant ce
temps.

**Pourquoi.** C'est une décision de la plateforme, applicable à toutes les
applications web sur iOS. Aucun contournement fiable n'existe : les astuces à
base d'élément `<audio>` silencieux en boucle sont fragiles, cassent d'une
version d'iOS à l'autre, et consomment de la batterie pour un résultat non
garanti.

**Ce qui est fait à la place.**
- Le chronomètre repose sur des horodatages absolus, jamais sur un compteur
  décrémenté. Au retour au premier plan il **rattrape immédiatement** toutes
  les phases traversées, dans l'ordre, et affiche la bonne phase avec le bon
  temps restant. Un test le vérifie (`tests/timer.test.ts`, « reste juste après
  une suspension longue de JavaScript »).
- L'application demande le maintien de l'écran allumé (`Screen Wake Lock`,
  disponible dans Safari depuis iOS 16.4) et le redemande à chaque retour au
  premier plan.
- L'écran des paramètres affiche cette limite noir sur blanc, ainsi que le
  conseil d'allonger le verrouillage automatique dans les Réglages iOS.

**Conséquence pratique.** Pose le téléphone écran allumé, à portée de vue.
C'est de toute façon ce qu'on fait pendant une séance.

### 1.2 La vibration n'existe pas

`navigator.vibrate` n'est pas implémenté dans Safari iOS, ni dans une
application web installée. Les modes « vibration » et « son + vibration » sont
donc dégradés en son seul sur iPhone.

**Ce qui est fait.** `capabilities()` détecte l'absence et l'écran des
paramètres l'annonce sur l'option concernée. Les modes restent proposés parce
qu'ils fonctionnent sur Android et sur desktop.

### 1.3 Le stockage peut être effacé

Une application **installée sur l'écran d'accueil** n'est pas soumise à
l'effacement des données de site au bout de sept jours d'inactivité qui
s'applique à Safari : elle a son propre compteur de jours d'usage. En revanche,
iOS peut toujours libérer le stockage d'une application web sous forte pression
de stockage ou après une très longue inactivité.

**Ce qui est fait.**
- `navigator.storage.persist()` est proposé dans les paramètres. iOS peut
  refuser ; le résultat est affiché tel quel.
- L'export JSON est présenté comme **la** sauvegarde, pas comme une option
  annexe, et le texte de l'écran le dit.

**Conséquence pratique.** Utiliser l'application depuis l'écran d'accueil, pas
depuis Safari, et exporter de temps en temps.

### 1.4 Notifications : non implémentées

Les notifications web fonctionnent sur iOS 16.4+ **pour une application
installée sur l'écran d'accueil**, mais elles exigent un serveur de push
(endpoint VAPID) pour émettre. Il n'y a **pas de notification locale
programmée** dans les applications web : rien ne permet de dire « rappelle-moi
demain à 18 h » sans serveur.

Construire cela demanderait un service serveur, ce qui contredirait les
contraintes de coût nul et d'absence de serveur. La fonctionnalité est donc
**écartée**, et l'architecture n'a pas été bâtie autour d'elle.

**Solution de contournement, sans code.** Créer un rappel quotidien dans
l'application Rappels ou une automatisation Raccourcis iOS qui ouvre l'URL de
l'application à l'heure voulue.

### 1.5 Orientation

L'application est conçue en portrait. Le manifeste déclare
`"orientation": "portrait"`, ce qu'iOS ignore pour les applications web
installées : l'écran peut donc pivoter. La mise en page est fluide et reste
utilisable en paysage, mais le portrait est ce qui a été travaillé.

### 1.6 Synthèse vocale

`SpeechSynthesis` fonctionne sur iOS mais exige un geste utilisateur pour la
première émission, et la voix française dépend des voix installées sur
l'appareil. L'application amorce le moteur vocal au démarrage de la séance,
dans le même geste que le déverrouillage audio.

**Ce qui est fait.** La notation de la combinaison (`1 — 2 — 3`) est **toujours
affichée en très grand caractères** : la voix est un complément, jamais le seul
canal.

---

## 2. Absence de serveur

### 2.1 Pas de synchronisation entre appareils

Les données vivent sur un seul appareil. Utiliser l'application sur un iPhone
et un iPad donnerait deux historiques indépendants.

**Ce qui est fait.** L'export/import JSON permet un transfert manuel complet
et fidèle (un test vérifie l'aller-retour). L'architecture réserve la place
d'une synchronisation ultérieure : le coffre est déjà découpé en documents
indépendants et versionnés.

### 2.2 Phrase secrète non récupérable

Il n'existe aucun « mot de passe oublié » : la clé est dérivée de la phrase, et
la phrase n'est stockée nulle part. Perdre la phrase, c'est perdre les données.

**Ce qui est fait.** L'écran de création le dit en toutes lettres, avant que le
choix soit fait, et recommande l'export.

### 2.3 « Rester connecté » est un compromis réel

L'option mémorise la clé dans IndexedDB sous forme de `CryptoKey` non
extractible — aucun script, celui de l'application compris, ne peut relire la
matière de la clé. Mais quiconque peut déverrouiller le téléphone peut ouvrir
l'application.

**Ce qui est fait.** L'option est explicite, désactivable, et l'écran de
sécurité rappelle l'état courant. Un verrouillage manuel est disponible à tout
moment.

---

## 3. Modèle d'entraînement

### 3.1 La récupération est une estimation, pas une mesure

Les pourcentages viennent d'un modèle de charge et de décroissance
exponentielle alimenté par le volume prescrit, l'intensité des exercices et la
difficulté déclarée. Sans fréquence cardiaque, sans variabilité cardiaque, sans
sommeil, ce ne peut pas être autre chose qu'une estimation destinée à orienter
la programmation.

**Ce qui est fait.** Chaque écran qui affiche ces chiffres le dit, l'écran
Récupération explique le calcul, et le vocabulaire employé est « estimation »
partout.

### 3.2 La vitesse n'est pas mesurable

Aucun capteur n'est disponible. Le sous-score « Vitesse » mesure donc
l'**exposition** au travail de vitesse sur 28 jours, pas la vitesse réelle —
et son explication le dit explicitement plutôt que de laisser croire le
contraire.

### 3.3 Les répétitions sont déclaratives

L'application ne compte pas les répétitions : elle propose la valeur prescrite
et l'athlète la confirme ou la corrige. Un comptage automatique demanderait la
caméra ou des capteurs, hors périmètre.

### 3.4 Les repères du score sont des conventions

Les valeurs de référence (120 s de gainage, 40 pompes, 60 squats) sont des
repères d'amateur bien préparé, affichés dans l'explication de chaque
sous-score. Ce ne sont pas des normes scientifiques : ils servent à donner une
échelle stable, pas un verdict.

---

## 4. Illustrations

Les exercices sont illustrés par un squelette vectoriel à 13 articulations
interpolé entre des poses. C'est original, animé, minuscule (~6 Ko pour
l'ensemble), fonctionnel hors connexion et libre de tout droit — mais moins
lisible qu'une vidéo pour un mouvement techniquement subtil.

**Ce qui est prévu.** Chaque exercice accepte un champ `media`
(`image` / `gif` / `video`) ; le renseigner suffit pour que l'interface affiche
l'asset au lieu de l'animation vectorielle, sans toucher au code de rendu.

---

## 5. Tests

Les 74 tests couvrent les parties critiques : budget de durée, cohérence du
moteur, progression, récupération, planification, timer, stockage et
chiffrement. Ils ne couvrent **pas** le rendu des composants React — la
vérification de l'interface a été faite par pilotage de navigateur réel
(Chromium en émulation iPhone) plutôt que par tests unitaires de composants.

Un banc de tests de rendu serait le premier ajout utile si le projet devait
grandir.
