# ImmeubleAssur.com

Site courtier specialise assurance immeuble, copropriete, PNO, SCI et syndic.

## Stack

- Site statique HTML/CSS/JS, deploye en production autonome sur serveur Windows local; Cloudflare Pages reste un secours manuel.
- Cloudflare Pages Function `functions/api/leads.js` pour les demandes de devis.
- Cloudflare Pages Function `functions/api/admin/leads.js` pour consulter les derniers leads avec `ADMIN_API_TOKEN`, valeur estimee, SLA de rappel et suivi commercial.
- Notification email des nouveaux leads via SMTP STARTTLS (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_TO`).
- Passe `scripts/seo-growth-pass.js`: liens canoniques propres, JSON-LD, tracking CTA, sitemap propre, injection GA4 optionnelle et registre de 2500 actions SEO/CRO.
- Passe `scripts/lead-friction-pass.js`: registre de 1000 actions CRO/SEO orientees friction formulaire, validation, CTA, preuves et maillage.
- Filtre anti-spam leads: honeypot, signaux JS, vitesse de soumission, repetition IP/email/telephone, contenu suspect et journalisation `lead_spam_blocked`.
- Turnstile actif: cle publique integree au build, override possible avec `TURNSTILE_SITE_KEY`, verification serveur avec `TURNSTILE_SECRET_KEY`.
- Usines SEO: `scripts/seo-content-factory.js`, `scripts/lead-growth-factory.js`, `scripts/money-intent-factory.js`.
- Autopilote editorial `scripts/editorial-autopilot.js`: generation de veille, newsletter, numero publiable, plan articles/FAQ/villes/news et export D1.
- Veille sources publiques: flux RSS/pages publiques avec attribution, sans recopie d'articles tiers ni scraping des resultats Google.
- Connecteurs IA optionnels: OpenAI, Claude/Anthropic, Gemini, OpenRouter et HuggingFace via variables d'environnement; fallback local si aucune cle n'est configuree.
- Systeme newsletter: page d'inscription, endpoint `/api/newsletter`, desinscription, tables D1 abonnes/issues/evenements, endpoint admin `/api/admin/newsletter` et panneau admin de pilotage/envoi.
- Autopilote media `scripts/media-autopilot.js`: selection de visuels Pexels avec attribution, rapports JSON/D1 et injection responsive quand `PEXELS_API_KEY` est configuree.
- Intelligence SERP `scripts/search-intelligence.js`: suivi des positions via SerpApi, concurrents visibles, recommandations par requete et export D1, sans scraping direct des pages Google.
- Observabilite integrations: endpoint admin /api/admin/integrations et panneau admin pour verifier IA, Pexels, SerpApi, Google, SMTP, Turnstile et D1 sans exposer les valeurs de secrets.
- Pipeline contenu admin: endpoint `/api/admin/content` et panneau admin pour suivre pages faibles, opportunites SEO, derniers runs IA/SEO/SerpApi/media et veille editoriale.
- Bouclier anti-spam admin: endpoint `/api/admin/spam` et panneau admin pour suivre blocages, raisons, pages ciblees, sources masquees et erreurs de validation.
- Centre de relance commerciale: endpoint `/api/admin/sales` et panneau admin pour piloter SLA, leads chauds, pipeline estime, scripts de rappel et brouillons email.
- Attribution acquisition: endpoint `/api/admin/attribution` et panneau admin pour relier sources, landing pages, campagnes, besoins, conversions et valeur estimee en agregats.
- Autopilote `scripts/seo-autopilot.js`: audit HTML, opportunites, PageSpeed Insights, Search Console si secrets Google configures, boucle Google feedback.
- Boucle Google APIs: Search Analytics pour requetes/CTR/position moyenne, URL Inspection pour etat d indexation des pages prioritaires et Sitemaps API pour signaler `sitemap.xml`.
- Audit editorial `scripts/content-quality-check.js`: garde-fous people-first, anti-duplication, anti-bourrage et anti-contenu manipulatif.
- Audit conversion `scripts/conversion-intelligence-check.js`: score des pages a intention commerciale, maillage devis, CTA, modules PNO/CNO et actions dashboard.
- Tests CRO `scripts/cro-experiment-check.js`: variantes CTA mesurees par session, propagation lead/GA4 et reporting admin.
- SQLite local avec le schema `schema.sql`; Cloudflare D1 n'est plus requis en production autonome.
- Workflow GitHub Actions Cloudflare Pages conserve en declenchement manuel uniquement.

## Demarrage local

```powershell
npm install
npm run generate
npm run check
npm run dev
```

## Base de donnees

1. Creer la base D1:

```powershell
wrangler d1 create immeubleassur-db
```

2. Remplacer `database_id` dans `wrangler.toml`.
3. Initialiser le schema:

```powershell
npm run db:remote
```

## Production autonome sur 192.168.1.70

Le site peut fonctionner sans Cloudflare Pages Functions et sans Cloudflare D1 en mode serveur local. Dans ce mode, Node sert les fichiers `public/`, expose les routes `/api/*`, emule le binding D1 sur SQLite et envoie les emails via SMTP local.

Cloudflare D1 n'est plus requis pour ce mode: la base active devient le fichier SQLite defini par `LOCAL_SQLITE_DB`, par exemple `F:\immeubleassur-data\immeubleassur.sqlite`. Le snapshot D1 deja recu sur `F:\immeubleassur-d1` sert uniquement a initialiser ou restaurer la base locale.

Variables principales sur le serveur:

```powershell
LOCAL_SITE_HOST=0.0.0.0
LOCAL_SITE_PORT=8790
LOCAL_SQLITE_DB=F:\immeubleassur-data\immeubleassur.sqlite
LOCAL_SQLITE_BACKUP_DIR=F:\immeubleassur-backups\sqlite
LOCAL_SQLITE_BACKUP_KEEP=30
LOCAL_SQLITE_BACKUP_MAX_AGE_HOURS=8
LOCAL_PRODUCTION_MONITOR_REPORT=F:\immeubleassur-monitor\latest.json
LOCAL_MONITOR_ALERTS=0
LOCAL_MONITOR_ALERT_TO=team@immeubleassur.com
LOCAL_MONITOR_ALERT_COOLDOWN_MINUTES=60
LOCAL_MONITOR_ALERT_STATE=F:\immeubleassur-monitor\alert-state.json
LOCAL_LEAD_SLA_REPORT=F:\immeubleassur-monitor\lead-sla-latest.json
LOCAL_LEAD_SLA_ALERTS=0
LOCAL_LEAD_SLA_ALERT_TO=team@immeubleassur.com
LOCAL_LEAD_SLA_ALERT_COOLDOWN_MINUTES=60
LOCAL_LEAD_SLA_ALERT_STATE=F:\immeubleassur-monitor\lead-sla-alert-state.json
LOCAL_LEAD_SLA_MAX_ROWS=500
SITE_ORIGIN=https://immeubleassur.com
ADMIN_API_TOKEN=secret-admin
SMTP_HOST=mail.xcr.fr
SMTP_PORT=587
SMTP_USER=team@immeubleassur.com
SMTP_PASS=
SMTP_FROM=team@immeubleassur.com
SMTP_TO=team@immeubleassur.com
```

Commandes utiles:

```powershell
npm run db:sqlite:restore -- --snapshot F:\immeubleassur-d1 --db F:\immeubleassur-data\immeubleassur.sqlite --replace
npm run db:sqlite:backup -- --db F:\immeubleassur-data\immeubleassur.sqlite --out F:\immeubleassur-backups\sqlite
npm run production:monitor -- --origin https://immeubleassur.com --db F:\immeubleassur-data\immeubleassur.sqlite --backup-dir F:\immeubleassur-backups\sqlite --out F:\immeubleassur-monitor\latest.json
npm run leads:sla:monitor -- --db F:\immeubleassur-data\immeubleassur.sqlite --out F:\immeubleassur-monitor\lead-sla-latest.json
npm run serve:local
npm run db:sqlite:import-reports
npm run local:autarky:check
```

Pour la mise en ligne publique sans Pages/D1, la Livebox redirige les ports 80/443 vers le serveur Windows, Caddy termine HTTPS et relaie vers Node sur 8790. `/health` reste public mais minimal; le diagnostic detaille est protege par `/api/admin/runtime-health` avec `ADMIN_API_TOKEN`. Le moniteur production:monitor controle la page publique, /health, le filtre telemetry, SQLite et la fraicheur des sauvegardes; il peut envoyer une alerte SMTP si LOCAL_MONITOR_ALERTS=1. Le moniteur leads:sla:monitor lit SQLite en local, detecte les demandes ouvertes hors delai de rappel, genere un rapport sans coordonnees prospect et peut alerter team@immeubleassur.com avec cooldown.

## Synchronisation vers 192.168.1.70

Section historique/migration: Cloudflare D1 ne doit plus etre considere comme la base active en production autonome. Le serveur `192.168.1.70` peut encore recevoir ou restaurer un snapshot D1 si un retour arriere ou une migration est necessaire. La synchronisation cree un snapshot compresse avec schema, manifest et fichiers JSONL par table; les donnees ne sont jamais ajoutees au depot Git.

Sur le serveur de donnees:

```powershell
$env:LOCAL_DB_SYNC_TOKEN="remplacer-par-un-secret-long"
$env:LOCAL_DB_SYNC_DIR="D:\immeubleassur-d1"
npm run db:receiver
```

Depuis le poste/projet qui a acces a Cloudflare:

```powershell
$env:LOCAL_DB_SYNC_URL="http://192.168.1.70:8789/sync/d1"
$env:LOCAL_DB_SYNC_TOKEN="le-meme-secret"
npm run db:sync:local
```

Commandes utiles:

```powershell
npm run db:sync:dry-run
npm run db:sync:check
```

Variables optionnelles: `D1_SYNC_TABLES` pour limiter les tables, `D1_SYNC_ROW_LIMIT` pour tester sur un extrait, `D1_SYNC_OUTPUT_DIR` pour changer le dossier local de snapshots. Le recepteur expose aussi `/health` pour verifier qu'il ecoute avant d'envoyer.

## Publication Cloudflare

Ajouter les secrets GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GA4_MEASUREMENT_ID` si le tag Google doit etre injecte au build
- `TURNSTILE_SITE_KEY` optionnel pour remplacer la cle publique Turnstile integree au build

Ajouter aussi les variables Cloudflare Pages:

- `ADMIN_API_TOKEN`
- `TURNSTILE_SECRET_KEY` pour verifier les formulaires cote serveur si Turnstile est active
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_TO`
- GA4 serveur: `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `GA4_REGION=eu`

Le workflow `.github/workflows/cloudflare-pages.yml` est volontairement manuel (`workflow_dispatch`) pour eviter de redeployer Pages a chaque push. L'hebergement actif reste le serveur local.

## SEO continu

Commandes utiles:

```powershell
npm run seo:content
npm run content:quality
npm run seo:audit
npm run seo:apis
npm run editorial:autopilot
npm run media:autopilot
npm run search:intelligence
```

Secrets optionnels pour GitHub Actions / local:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL` (ex: `sc-domain:immeubleassur.com`)
- `PAGESPEED_API_KEY` (optionnel)
- `GOOGLE_URL_INSPECTION_LIMIT=8`
- `GOOGLE_URL_INSPECTION_URLS=https://immeubleassur.com/,https://immeubleassur.com/devis-assurance-immeuble`
- `GA4_MEASUREMENT_ID` (tag public au build)
- `OPENAI_API_KEY`, `OPENAI_MODEL` optionnels pour synthese editoriale
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` optionnels pour Claude
- `GEMINI_API_KEY`, `GEMINI_MODEL` optionnels pour Gemini
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` optionnels pour OpenRouter
- `HUGGINGFACE_API_KEY`, `HUGGINGFACE_MODEL` optionnels pour HuggingFace
- `PEXELS_API_KEY` optionnel pour les visuels avec attribution
- `SERP_API_KEY` optionnel pour le suivi de positions via SerpApi
- `NEWSLETTER_SEND_LIMIT` pour limiter les envois par declenchement

Le workflow `.github/workflows/seo-autopilot.yml` lance l'audit chaque nuit. Le systeme n'utilise pas de scraping automatise des resultats Google et n'utilise pas l'Indexing API pour les pages immeuble, car Google la reserve aux contenus compatibles comme `JobPosting` ou `BroadcastEvent`.

La newsletter utilise SMTP deja configure cote Pages. Les envois sont declenches via `/api/admin/newsletter` ou le panneau `/admin.html` avec `ADMIN_API_TOKEN`; les abonnes disposent d'un lien de desinscription individuel. La reponse d'envoi expose des compteurs agreges, pas la liste des emails.

Le panneau /admin.html peut aussi appeler /api/admin/integrations avec le meme token. Il signale les variables absentes par leur nom uniquement; les cles doivent rester dans GitHub Secrets ou Cloudflare Pages, jamais dans le depot.

Le panneau /admin.html appelle aussi `/api/admin/content` pour prioriser les contenus a renforcer a partir de D1: qualite, opportunites, veille et derniers runs techniques.

Le panneau /admin.html appelle aussi `/api/admin/spam` pour suivre les robots et les blocages sans exposer les IP brutes; seules des empreintes masquees sont retournees.

Le panneau /admin.html appelle aussi `/api/admin/sales` pour prioriser les relances commerciales, les retards SLA, les dossiers a forte valeur et les scripts de rappel.

Le panneau /admin.html appelle aussi `/api/admin/attribution` pour comprendre quels canaux, campagnes et pages generent les leads les plus qualifies. La reponse est agregee et ne retourne aucun contact nominatif.

## Politique contenu IA

L'automatisation aide a structurer, enrichir et auditer les pages. Elle ne doit pas produire de contenu destine a tromper Google, masquer du texte IA, dupliquer massivement des pages ou manipuler le classement. Les controles favorisent le contenu utile, specifique, verifiable et oriente lead qualifie.
