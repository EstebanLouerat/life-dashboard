# Life Dashboard

App Android perso : suivi quotidien (eau, sommeil, traitements), courses de la semaine et séances de sport générées par Claude, recherche d'appart, wishlist.

```
apps/mobile        App Expo (React Native, TypeScript)
apps/api           Backend Next.js qui appelle Claude
packages/contracts Schémas zod partagés app ↔ backend
```

## Démarrer (Windows)

### 1. Installer
```bash
npm install
```

### 2. Lancer le backend
```bash
copy apps\api\.env.example apps\api\.env.local
```
Dans `apps/api/.env.local` :
- `ANTHROPIC_API_KEY` : clé créée sur console.anthropic.com
- `APP_KEY` : une longue chaîne aléatoire (tu la recopieras dans l'app)

```bash
npm run api
```
Le backend écoute sur le port 3000 de ton PC. Autorise Node.js dans le pare-feu Windows (réseau privé) pour que le téléphone puisse le joindre.

### 3. Installer l'app sur ton téléphone
Prérequis : Android Studio (SDK Android) et ton téléphone branché en USB avec le **débogage USB** activé (Paramètres → À propos → appuyer 7 fois sur « Numéro de build », puis Options développeur).

```bash
cd apps/mobile
npx expo run:android
```
Ça compile une version de développement, l'installe sur le téléphone et lance le serveur Expo. Ensuite, chaque modification du code se recharge en direct.

### 4. Connecter l'app au backend
Onglet **Plus › Réglages**, section Serveur :
- Adresse du serveur : `http://<IP-de-ton-PC>:3000` (trouve l'IP avec `ipconfig`, ligne « Adresse IPv4 »)
- Clé d'accès : la valeur d'`APP_KEY`
- « Tester la connexion » doit afficher « Connecté » dans la ligne État

## Plus tard : sans PC allumé
Déployer `apps/api` sur Vercel (gratuit), y mettre les mêmes variables d'environnement, puis utiliser l'URL `https://…vercel.app` dans l'app. Une APK de release exige une URL en HTTPS.

## Travailler avec Claude Code
Le skill projet `.claude/skills/life-dashboard-conventions` est chargé automatiquement : il décrit l'archi, les règles et l'état de chaque module.
