# ImmeubleAssur.com

Site courtier specialise assurance immeuble, copropriete, PNO, SCI et syndic.

## Stack

- Site statique HTML/CSS/JS, deployable sur Cloudflare Pages.
- Cloudflare Pages Function `functions/api/leads.js` pour les demandes de devis.
- Cloudflare Pages Function `functions/api/admin/leads.js` pour consulter les derniers leads avec `ADMIN_API_TOKEN`, valeur estimee, SLA de rappel et suivi commercial.
- Notification email des nouveaux leads via SMTP STARTTLS (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_TO`).
- Passe `scripts/seo-growth-pass.js`: liens canoniques propres, JSON-LD, tracking CTA, sitemap propre, injection GA4 optionnelle et registre de 2500 actions SEO/CRO.
- Usines SEO: `scripts/seo-content-factory.js`, `scripts/lead-growth-factory.js`, `scripts/money-intent-factory.js`.
- Autopilote `scripts/seo-autopilot.js`: audit HTML, opportunites, PageSpeed Insights, Search Console si secrets Google configures, boucle Google feedback.
- Audit editorial `scripts/content-quality-check.js`: garde-fous people-first, anti-duplication, anti-bourrage et anti-contenu manipulatif.
- Audit conversion `scripts/conversion-intelligence-check.js`: score des pages a intention commerciale, maillage devis, CTA, modules PNO/CNO et actions dashboard.
- Tests CRO `scripts/cro-experiment-check.js`: variantes CTA mesurees par session, propagation lead/GA4 et reporting admin.
- Cloudflare D1 avec le schema `schema.sql`.
- Workflow GitHub Actions pret pour deployer via Wrangler.

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

## Publication Cloudflare

Ajouter les secrets GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GA4_MEASUREMENT_ID` si le tag Google doit etre injecte au build

Ajouter aussi les variables Cloudflare Pages:

- `ADMIN_API_TOKEN`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_TO`
- GA4 serveur: `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `GA4_REGION=eu`

Puis pousser la branche `main`. Le workflow `.github/workflows/cloudflare-pages.yml` publiera le site.

## SEO continu

Commandes utiles:

```powershell
npm run seo:content
npm run content:quality
npm run seo:audit
npm run seo:apis
```

Secrets optionnels pour GitHub Actions / local:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL` (ex: `sc-domain:immeubleassur.com`)
- `PAGESPEED_API_KEY` (optionnel)
- `GA4_MEASUREMENT_ID` (tag public au build)

Le workflow `.github/workflows/seo-autopilot.yml` lance l'audit chaque nuit. Le systeme n'utilise pas de scraping automatise des resultats Google et n'utilise pas l'Indexing API pour les pages immeuble, car Google la reserve aux contenus compatibles comme `JobPosting` ou `BroadcastEvent`.

## Politique contenu IA

L'automatisation aide a structurer, enrichir et auditer les pages. Elle ne doit pas produire de contenu destine a tromper Google, masquer du texte IA, dupliquer massivement des pages ou manipuler le classement. Les controles favorisent le contenu utile, specifique, verifiable et oriente lead qualifie.