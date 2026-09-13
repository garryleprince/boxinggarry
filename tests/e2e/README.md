# Vérification navigateur

Les tests unitaires (`npm test`) couvrent les moteurs, le chronomètre, le
stockage et le chiffrement. Ce script couvre ce qu'ils ne peuvent pas : le
parcours réel dans un navigateur.

```bash
npm run build
npx vite preview --port 4173 &
node tests/e2e/parcours.mjs
```

Ce qu'il vérifie :

1. création du coffre chiffré et onboarding complet ;
2. séance du jour à 20 minutes exactement, un jour d'entraînement ;
3. audit de minutage cohérent avec le budget ;
4. déroulement complet de la séance, saisie des performances, bilan ;
5. proposition du +10 **après** le bilan, jamais avant ;
6. reprise d'une séance interrompue, chronomètre au bon endroit ;
7. démarrage hors connexion ;
8. lancement d'une séance sans réseau.

Le script échoue avec un code non nul si l'une de ces propriétés est fausse,
et signale toute erreur de console.

**Playwright n'est pas une dépendance du projet.** Installe-le à la demande :

```bash
npm i -D playwright
```

Sur un environnement où Chromium est déjà présent, renseigne son chemin dans
`executablePath` en haut du script.
