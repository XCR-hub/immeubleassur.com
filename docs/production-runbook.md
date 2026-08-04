# ImmeubleAssur - runbook de production

## Controle quotidien

Depuis le depot synchronise sur le serveur:

- `npm run production:monitor`
- `npm run production:tls`
- `npm run mail:health`
- `npm run leads:sla:monitor`
- `npm run leads:quality:monitor`
- `npm run conversion:funnel:monitor`
- `npm run growth:ops:runtime`
- `npm run db:sqlite:backup`

Le rapport consolide est `F:\\immeubleassur-runtime\\reports\\local-runtime-report-cycle.json`.
Une alerte `attention` doit etre relue par un humain avant toute modification commerciale ou envoi.

## Validation d'un dossier

1. Ouvrir l'administration et charger les dossiers avec le token admin.
2. Verifier le score, les pieces requises, le consentement et l'historique.
3. Relire chaque brouillon client ou assureur.
4. Valider manuellement le contenu et le destinataire.
5. Envoyer uniquement lorsque les pieces sont propres, les contacts confirmes et le statut de consultation coherent.
6. Conserver l'echange, le statut, l'horodatage et la prochaine relance dans la timeline.

Aucun contenu IA, mail, paiement ou envoi assureur ne doit etre publie ou execute sans cette validation.

## Sauvegarde et restauration

- Les sauvegardes SQLite sont conservees dans `F:\\immeubleassur-backups\\sqlite`.
- Verifier l'integrite avant restauration: `npm run db:sqlite:backup`.
- Arreter le service applicatif avant une restauration.
- Restaurer vers un snapshot temporaire, verifier les tables et les comptes, puis remplacer la base apres validation.
- Conserver la sauvegarde precedente jusqu'a la fin du controle fonctionnel.

## Incident

1. Desactiver les envois sortants en retirant temporairement l'approbation humaine ou le transport mail.
2. Conserver les journaux et le dernier rapport runtime.
3. Verifier le TLS, les en-tetes, le scanner antivirus et l'espace disque.
4. Ne jamais communiquer un token, une cle API, un document ou une adresse IP brute dans un ticket.
5. Reprendre les envois seulement apres test CRM, portail client et consultation assureur.

## Connecteurs externes

Les variables sont configurees uniquement dans `.env.local` du serveur, jamais dans le depot:

- Google Search Console: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`
- PageSpeed: `PAGESPEED_API_KEY`
- GA4: `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`
- SerpApi: `SERP_API_KEY`
- Email: transport SMTP ou Resend selon la configuration validee

Verifier les noms et les etats avec `npm run live:api:readiness`. Les valeurs ne doivent jamais apparaitre dans les rapports publics.

## Donnees sensibles

Les documents sont prives, controles par token, soumis au scanner et non mis en cache. Leur contenu est encore stocke dans SQLite selon le schema actuel: activer un chiffrement du volume ou un chiffrement applicatif gere par secret avant d'augmenter le niveau de sensibilite des documents. Le secret de chiffrement ne doit jamais etre stocke dans Git.

## Deploiement

1. Tester localement les contrats et les smoke tests.
2. Committer uniquement les changements attendus.
3. Pousser la branche principale.
4. Synchroniser le depot serveur avec `git pull --ff-only`.
5. Attendre le cycle runtime ou redemarrer le service apres verification.
6. Tester `https://immeubleassur.com/`, `/api/health` et les en-tetes HTTPS.
7. Verifier que le rapport runtime reference le commit deploye.
