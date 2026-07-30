# ImmeubleAssur.com

Site specialise en assurance immeuble, PNO, CNO, copropriete, SCI, syndic et multirisque immeuble. La production cible est autonome: serveur Windows local, Node.js, SQLite, Caddy et SMTP `mail.xcr.fr`.

## Stack active

- Site statique HTML/CSS/JS dans `public/`.
- Serveur local Node `scripts/local-production-server.js` qui sert `public/` et expose les routes `/api/*`.
- Base active SQLite definie par `LOCAL_SQLITE_DB`.
- Schema applicatif dans `schema.sql`.
- Emails via SMTP local `mail.xcr.fr`.
- Anti-fraude local: honeypot, signaux JS, jeton de session, temps de saisie, interactions et historique IP/email/telephone. Turnstile Cloudflare peut etre ajoute en couche anti-robot optionnelle.
- Automatisation SEO/contenu: articles, FAQ, villes, veille, newsletter, media, Search Console, PageSpeed, SerpApi et rapports JSON locaux quand les API sont configurees.

Aucune dependance Supabase, Cloudflare D1, Cloudflare Pages ou Wrangler n'est requise pour le runtime de production autonome. Cloudflare Turnstile est optionnel: si `TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY` sont absentes, les formulaires restent proteges par le filtre local.

## Production locale

Sur le serveur de donnees `192.168.1.70`, la base active doit etre un fichier SQLite, par exemple:

```text
F:\immeubleassur-data\immeubleassur.sqlite
```

Le serveur Node ecoute sur `LOCAL_SITE_PORT` (8790 par defaut). Caddy termine HTTPS sur 80/443 et relaie vers Node. Le diagnostic public minimal est `/health`; le diagnostic detaille est protege par `/api/admin/runtime-health` avec `ADMIN_API_TOKEN`.

Commandes utiles:

```bash
npm run serve:local
npm run db:sqlite:backup
npm run db:sqlite:restore
npm run db:sqlite:import-reports
npm run production:monitor
npm run local:autarky:check
npm run check
```

## Base de donnees

La base se manage comme un fichier SQLite local:

- schema: `schema.sql`
- ouverture runtime: `scripts/local-sqlite-db.js`
- sauvegarde: `npm run db:sqlite:backup`
- restauration: `npm run db:sqlite:restore`
- import des rapports SEO/conversion: `npm run db:sqlite:import-reports`

Les donnees, sauvegardes, `.env.local`, credentials et fichiers `.sqlite` sont ignores par Git.

## Automatisations

Les scripts principaux sont:

```bash
npm run generate
npm run seo:audit
npm run conversion:intelligence
npm run seo:apis
npm run content:diversity
npm run seo:cannibalization
npm run seo:intent:differentiate
npm run seo:angles
npm run seo:links
npm run conversion:bridge
npm run editorial:autopilot
npm run media:autopilot
npm run search:intelligence
npm run conversion:funnel:monitor
npm run conversion:actions:sync
npm run seo:backlog:monitor
npm run leads:sla:monitor
npm run leads:quality:monitor
npm run antifraud:local
npm run turnstile:hybrid
npm run live:api:readiness
```

Le rapport `conversion:intelligence` classe les pages par intention visible (`slug`, titre, description, H1) pour separer villes, PNO/CNO, devis, prix, syndic/copropriete, sinistres, SCI/bailleurs, travaux et veille sans lire les blocs CTA globaux.

Les workflows GitHub Actions generent et valident les rapports, mais ne publient pas sur une plateforme externe et n'ecrivent pas dans une base externe.

## Variables d'environnement

Copier `.env.example` vers `.env.local` sur le serveur puis renseigner uniquement les secrets utiles. Ne jamais commiter `.env.local`.

Variables critiques:

```text
ADMIN_API_TOKEN=
LOCAL_SQLITE_DB=F:\immeubleassur-data\immeubleassur.sqlite
SMTP_HOST=mail.xcr.fr
SMTP_PORT=587
SMTP_USER=team@immeubleassur.com
SMTP_PASS=
SMTP_FROM=team@immeubleassur.com
SMTP_TO=team@immeubleassur.com
SITE_ORIGIN=https://immeubleassur.com
```

Variables optionnelles pour l'optimisation continue: Google Search Console, PageSpeed, URL Inspection (`GOOGLE_URL_INSPECTION_LIMIT`), GA4, SerpApi, Pexels, OpenAI, Anthropic, Gemini, OpenRouter et HuggingFace. Pour retrouver la verification automatique Cloudflare sur les formulaires, renseigner aussi `TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY`.

La procedure d'activation sans exposition de secrets est documentee dans `docs/live-api-readiness.md`. Le controle `npm run live:api:readiness` publie uniquement les statuts et les noms de variables manquantes.

## Admin

`/admin.html` permet de consulter les leads, newsletter, contenu SEO, attribution, anti-spam, relances, runtime et backlog SEO. Les endpoints admin exigent `ADMIN_API_TOKEN`.

Le panneau integrations affiche les secrets par nom uniquement, jamais leurs valeurs.

## DNS et independance

Le runtime et la base sont locaux. Comme l'IP publique est fixe (`80.15.56.123`), aucun DDNS n'est necessaire. Le point DNS doit etre traite separement chez le registrar pour une autarcie complete.

Etat constate le 2026-07-29:

- A record public: `80.15.56.123`
- nameservers: `arely.ns.cloudflare.com` et `rocky.ns.cloudflare.com`

Tant que ces nameservers restent actifs, Cloudflare reste l'autorite DNS du domaine, ce qui est le compromis retenu maintenant. On ne revient pas vers IONOS comme cible DNS. Pour l'autarcie complete a terme, il faudra mettre en place un DNS secondaire/autoritaire hors Cloudflare dans le futur datacenter, recopier `dns/registrar-records.json`, puis changer les nameservers chez le registrar. Controle normal: `npm run dns:autarky`. Controle final apres migration: `npm run dns:autarky:strict`.
