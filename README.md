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
npm run production:runtime-reports
npm run brokerage:cases
npm run brokerage:contract
npm run brokerage:smoke
npm run client:contracts
npm run client:contracts:contract
npm run client:contracts:smoke
npm run production:watchdog
npm run production:watchdog:node
npm run local:autarky:check
npm run check
```

Le watchdog Node `scripts/local-site-watchdog.js` est utilise par la tache planifiee Windows.
La tache `ImmeubleAssur Runtime Reports` est installable avec `scripts/install-local-runtime-task.ps1`; elle execute `scripts/local-runtime-task.ps1` toutes les 15 minutes sous `SYSTEM`, avec instance unique et demarrage apres indisponibilite. Le cycle rafraichit ensuite uniquement les connecteurs live prets via `scripts/live-ready-connectors-runner.js`, avec fallback local et cooldown SerpApi. Lorsqu un connecteur Search Console ou PageSpeed est pret, un pass SEO Google unique est execute pour eviter les requetes dupliquees. La tache planifiee active `LOCAL_RUNTIME_ONLY=1`: les sorties live sont ecrites dans `F:\immeubleassur-runtime` et les pages du depot restent inchangees jusqu a une publication controlee. Le watchdog PowerShell `scripts/windows-local-site-watchdog.ps1` reste disponible en secours manuel. Il sert au maintien en ligne: il teste `http://127.0.0.1:8790/health` et le contrat de headers HTTP runtime sur `/`, arrete les processus Node applicatifs bloques ou obsoletes si necessaire, relance `scripts/local-production-server.js` en processus detache et ecrit un rapport JSON local. En production, il est prevu en tache planifiee au demarrage et toutes les 5 minutes.

Le cycle `npm run production:runtime-reports` met a jour les rapports operationnels sans modifier Git: les sorties dynamiques publiques sont ecrites dans `data/runtime-assets/` et servies en priorite par `scripts/local-production-server.js` pour `/assets/*.json`. Le fichier suivi `public/assets/local-growth-ops-latest.json` reste un fallback de build; le serveur publie l'overlay runtime quand il existe.


## Dossiers courtage et espace client

Le workflow courtier synchronise les leads ouverts en dossiers exploitables avec `npm run brokerage:cases`. Chaque dossier stocke les pieces demandees, la readiness assureur, les brouillons de mails, les consultations assureurs, le lien d'espace client et une timeline d'audit. Les emails restent en `draft_review` jusqu'a validation humaine explicite; l'envoi SMTP est refuse tant qu'un brouillon n'est pas approuve.

La synchronisation `npm run mail:sync` ouvre la boite IMAP en lecture seule, importe uniquement les en-tetes des messages recents et rattache les objets contenant une reference `DOS-*` au dossier correspondant. Chaque reponse est marquee `received_pending_review`, ajoutee a la timeline et exposee dans l'admin; aucune reponse automatique ni envoi n'est declenche. Le cycle `npm run production:runtime-reports` execute aussi cette synchronisation.

Le cycle runtime prepare aussi les rappels contractuels de renouvellement et d appels de prime dans `draft_review`, dedupliques par echeance, sans envoi automatique; la validation humaine reste obligatoire.

- Admin: `/admin.html`, section `Dossiers courtage` via `/api/admin/cases`.
- Client mobile: `/espace-client.html?token=...` via `/api/client/case`.
- Assureurs partenaires: les consultations se traitent depuis l'admin avec approbation humaine, envoi ou marquage manuel, brouillon de relance et retour offre/refus trace en timeline.
- Espace assureur: `/espace-assureur.html?token=...` via `/api/partner/consultation` donne au partenaire un resume risque sans email/telephone client et permet question, offre ou refus traces.
- Offre client: apres offre assureur quotee, l'admin prepare une proposition en `draft_review`, la publie apres revue humaine, puis le client l'accepte explicitement dans `/espace-client.html`; l'acceptation passe le dossier en `contract_active` et le lead en `won`.
- Controle: `npm run brokerage:contract` verifie validation humaine, consentement, portails tokenises, timeline, consultations assureurs relues et absence d'automatisation marketing/cross-sell sans opt-in explicite. `npm run brokerage:smoke` teste le parcours lead -> dossier -> portail client -> validation mail -> portail assureur -> offre client publiee -> acceptation explicite -> timeline sur SQLite temporaire.
- Apres contrat gagne: `npm run client:contracts` cree l'espace contrat client pour les dossiers `contract_active` ou les leads `won`: documents de contrat, echeancier de prime, parc assure, demandes client, consentements revocables et parrainages en revue humaine.
- Centre admin contrats: `/admin.html`, section `Dossiers courtage`, affiche les operations contrats et permet la prise/resolution des demandes client, la validation humaine des parrainages et le marquage manuel des echeances de prime.
- Controle contrat client: `npm run client:contracts:contract` verifie les garde-fous opt-in/revocation/absence de collecte intrusive. `npm run client:contracts:smoke` teste sur SQLite temporaire le parcours contrat -> consentement explicite -> parrainage -> paiement -> parc -> actions admin -> timeline.
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
npm run conversion:editorial-rescue
npm run lead:intent
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
npm run security:headers
npm run live:api:readiness
npm run live:ready
npm run source:quality
npm run growth:ops:runtime
```

Le rapport `editorial-cluster-rescue` ajoute des blocs visibles et mesures sur les grappes editoriales faibles (veille, travaux, locaux commerciaux, copropriete, assurance immeuble) afin de transformer une lecture SEO en parcours devis sans texte cache. Le rapport `conversion:intelligence` classe les pages par intention visible (`slug`, titre, description, H1) pour separer villes, PNO/CNO, devis, prix, syndic/copropriete, sinistres, SCI/bailleurs, travaux et veille sans lire les blocs CTA globaux. Le controle `lead:intent` verifie que les liens SEO `?intent=...` pre-remplissent le formulaire et restent transmis a l API, aux emails et a GA4.

Les workflows GitHub Actions generent et valident les rapports, mais ne publient pas sur une plateforme externe et n'ecrivent pas dans une base externe.

## Variables d'environnement

Copier `.env.example` vers `.env.local` sur le serveur puis renseigner uniquement les secrets utiles. Ne jamais commiter `.env.local`.

Variables critiques:

```text
ADMIN_API_TOKEN=
LOCAL_SQLITE_DB=F:\immeubleassur-data\immeubleassur.sqlite
LOCAL_RUNTIME_ASSETS_ROOT=F:\immeubleassur-runtime
LOCAL_RUNTIME_REPORTS_ROOT=F:\immeubleassur-runtime\reports
SMTP_HOST=mail.xcr.fr
SMTP_PORT=587
SMTP_USER=team@immeubleassur.com
SMTP_PASS=
SMTP_FROM=team@immeubleassur.com
SMTP_TO=team@immeubleassur.com
SITE_ORIGIN=https://immeubleassur.com
```

Variables optionnelles pour l'optimisation continue: Google Search Console, PageSpeed, URL Inspection (`GOOGLE_URL_INSPECTION_LIMIT`), GA4, SerpApi, Pexels, OpenAI, Anthropic, Gemini, OpenRouter et HuggingFace. Les rapports live serveur peuvent etre sortis du depot avec `LOCAL_INTENT_CONVERSION_REPORT`, `LOCAL_INTENT_CONVERSION_PUBLIC_REPORT`, `LOCAL_SOURCE_QUALITY_REPORT`, `LOCAL_SOURCE_QUALITY_PUBLIC_REPORT` et `LOCAL_SQLITE_IMPORT_REPORT`, par exemple vers `F:\immeubleassur-monitor`.

Pour retrouver la verification automatique Cloudflare sur les formulaires, renseigner aussi `TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY`.

Le runner `npm run live:ready` execute uniquement les connecteurs prets et respecte un cooldown SerpApi apres un 429, sans exposer les valeurs de secrets. La procedure d'activation sans exposition de secrets est documentee dans `docs/live-api-readiness.md`. Le controle `npm run live:api:readiness` publie les statuts et `npm run google:unlock` transforme les connecteurs Google/GA4 manquants ou degrades en actions techniques sans valeur de secret.

## Admin

`/admin.html` permet de consulter les leads, newsletter, contenu SEO, attribution, anti-spam, relances, runtime et backlog SEO. Les endpoints admin exigent `ADMIN_API_TOKEN`. Les echecs sont limites par IP pendant cinq minutes, sans stockage du jeton.

Le panneau integrations affiche les secrets par nom uniquement, jamais leurs valeurs. Il affiche aussi le rapport public des headers HTTP/CSP/HSTS et du fichier `/.well-known/security.txt`.

## DNS et independance

Le runtime et la base sont locaux. Comme l'IP publique est fixe (`80.15.56.123`), aucun DDNS n'est necessaire. Le point DNS doit etre traite separement chez le registrar pour une autarcie complete.

Etat constate le 2026-07-29:

- A record public: `80.15.56.123`
- nameservers: `arely.ns.cloudflare.com` et `rocky.ns.cloudflare.com`

Tant que ces nameservers restent actifs, Cloudflare reste l'autorite DNS du domaine, ce qui est le compromis retenu maintenant. On ne revient pas vers IONOS comme cible DNS. Pour l'autarcie complete a terme, il faudra mettre en place un DNS secondaire/autoritaire hors Cloudflare dans le futur datacenter, recopier `dns/registrar-records.json`, puis changer les nameservers chez le registrar. Controle normal: `npm run dns:autarky`. Controle final apres migration: `npm run dns:autarky:strict`.
