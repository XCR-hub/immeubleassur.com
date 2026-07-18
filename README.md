# ImmeubleAssur.com

Site courtier specialise assurance immeuble, copropriete, PNO, SCI et syndic.

## Stack

- Site statique HTML/CSS/JS, deployable sur Cloudflare Pages.
- Cloudflare Pages Function `functions/api/leads.js` pour les demandes de devis.
- Cloudflare D1 avec le schema `schema.sql`.
- Workflow GitHub Actions pret pour deployer via Wrangler.

## Demarrage local

```powershell
npm install
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

Puis pousser la branche `main`. Le workflow `.github/workflows/cloudflare-pages.yml` publiera le site.
