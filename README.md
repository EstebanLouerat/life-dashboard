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
Pendant le développement : **Expo Go** (`npm run mobile`, puis scanner le QR code).

Version installable, compilée dans le cloud par EAS (aucun SDK Android en local). Depuis `apps/mobile` :

```bash
npx eas-cli login
```
```bash
npx eas-cli build --platform android --profile preview
```
Le premier build demande de créer le projet Expo et ajoute son `projectId` dans `app.json` : commite ce changement. À la fin, EAS donne un lien et un QR code vers l'APK à installer sur le téléphone. Le profil `preview` sert aussi pour iOS (`--platform ios`), mais il produit une app pour le simulateur iOS, qui ne tourne que sur un Mac.

Une APK compilée bloque le HTTP simple : elle ne joint le backend qu'en HTTPS (voir « Plus tard »). Les données locales (eau, sommeil, traitements, import JSON) marchent sans backend.

### 4. Connecter l'app au backend
Onglet **Plus › Réglages**, section Serveur :
- Adresse du serveur : `http://<IP-de-ton-PC>:3000` (trouve l'IP avec `ipconfig`, ligne « Adresse IPv4 »)
- Clé d'accès : la valeur d'`APP_KEY`
- « Tester la connexion » doit afficher « Connecté » dans la ligne État

## Plus tard : sans PC allumé
Déployer `apps/api` sur Vercel (gratuit), y mettre les mêmes variables d'environnement, puis utiliser l'URL `https://…vercel.app` dans l'app. Une APK de release exige une URL en HTTPS.

## Travailler avec Claude Code
Le skill projet `.claude/skills/life-dashboard-conventions` est chargé automatiquement : il décrit l'archi, les règles et l'état de chaque module.
