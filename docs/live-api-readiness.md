# Activation des APIs live

Objectif: garder ImmeubleAssur autonome sur le serveur local, tout en activant les connecteurs SEO, IA, media, analytics et anti-robot quand les secrets sont presents dans l'environnement serveur.

Le principe est strict:

- les secrets restent dans `.env.local` sur le serveur ou dans le gestionnaire de secrets GitHub Actions;
- Git ne contient que les noms de variables, jamais leurs valeurs;
- le rapport public `public/assets/live-api-readiness-latest.json` expose uniquement des statuts;
- le site reste operationnel en fallback local quand une API manque.

## Verification rapide

Depuis la racine du projet:

```bash
npm run live:api:readiness
```

Le rapport attendu est ecrit dans:

```text
reports/live-api-readiness-report.json
public/assets/live-api-readiness-latest.json
```

Un connecteur est `ready` uniquement si toutes ses variables obligatoires sont presentes. Sinon il reste en `fallback`.

## Variables a renseigner sur le serveur

Fichier local non versionne:

```text
F:\immeubleassur-sync\immeubleassur.com\.env.local
```

Connecteurs:

```text
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
SERP_API_KEY=
PEXELS_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
HUGGINGFACE_API_KEY=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_KEY=
GOOGLE_SEARCH_CONSOLE_SITE_URL=sc-domain:immeubleassur.com
PAGESPEED_API_KEY=
GA4_MEASUREMENT_ID=
GA4_API_SECRET=
```

Pour l'IA editoriale, une seule cle parmi OpenAI, Anthropic, Gemini, OpenRouter ou HuggingFace suffit pour quitter le fallback.

## Ordre d'activation recommande

1. Activer Turnstile:

```bash
npm run turnstile:hybrid
```

2. Activer les signaux SEO live:

```bash
npm run search:live
npm run seo:live
```

3. Activer les visuels attribues:

```bash
npm run media:live
```

4. Activer la veille editoriale IA:

```bash
npm run editorial:live
```

5. Regenerer et importer les rapports dans SQLite:

```bash
npm run generate
npm run db:sqlite:import-reports
npm run live:api:readiness
npm run check
```

## Controle admin

Le panneau `/admin.html` lit `live-api-readiness-latest.json` et affiche:

- le nombre de connecteurs prets;
- les connecteurs encore en fallback;
- les noms de variables manquantes;
- la commande a lancer pour rafraichir chaque signal.

Ce panneau ne doit jamais afficher les valeurs des secrets.
