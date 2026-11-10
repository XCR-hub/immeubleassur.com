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

La preparation ciblee utilise `POST /api/admin/cases` avec `action: "prepare_lead"` et `lead_id`. Elle cree uniquement le dossier du prospect choisi et ses brouillons a relire, sans envoi ni changement du statut commercial. Si le dossier existe, elle le retourne sans modification. Les prospects perdus, archives, gagnes ou classes spam ne sont pas prepares. Utiliser `GET /api/admin/cases?sync=0` pour consulter sans synchronisation globale.

La synchronisation conserve les consignes `next_action` et les echeances deja renseignees. Un dossier perdu ou archive reste cloture : il ne figure plus dans les actions recommandees et ses mails ne peuvent plus etre approuves ou envoyes. L'envoi recontrole le statut, le destinataire et la version du brouillon juste avant le transport ; toute modification exige une nouvelle revue.

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

## Collecte et maintenance en mode surveillance

Le mode `MonitoringOnly` collecte les sources officielles toutes les six heures avec `--fetch`, sans synthese IA ni nouvel envoi de mail. La publication existante conserve son controle de preuves et les brouillons IA restent bloques. SerpApi consulte d'abord son API de quota gratuite ; aucun appel de recherche n'est lance si le quota est nul ou inconnu. En surveillance, une requete au maximum est autorisee par cycle de six heures, avec rotation des mots-cles.

La retention technique peut etre appliquee uniquement par l'etape `privacy_retention` lorsque `LOCAL_PRIVACY_RETENTION_APPLY=1` est explicitement configure. Elle anonymise les anciens identifiants techniques et conserve les contacts commerciaux et les oppositions newsletter. Verifier la sauvegarde SQLite et son miroir avant la premiere application.

Les editions anciennes peuvent etre archivees avec `scripts/archive-obsolete-editorial-drafts.js`, d'abord en simulation avec `--drafts-root`, `--backup-root` et `--before YYYY-MM-DD`, puis avec `--apply`. Le seuil doit depasser 60 jours. L'original est sauvegarde et verifie par hash ; les contenus et leurs restrictions de publication sont conserves. Cet archivage technique ne constitue pas une validation humaine ou juridique et n'est pas execute automatiquement.

## Connecteurs externes

La synchronisation IMAP classe les notifications internes selon des regles strictes d'expediteur, de destinataire et d'objet. Les alertes techniques sont marquees `ignored_automation` de facon reversible. Les notifications de prospect ne sont rapprochees d'un lead que si sa reference existe de facon unique ; elles restent tracees avec `linked_lead_notification`, et le suivi commercial reste dans la file des leads. Les messages clients, les reponses, les messages deja rattaches a un dossier et les references ambigues restent en revue. La classification est transactionnelle, preserve les entetes et ne modifie pas les messages de la boite IMAP.

Les variables sont configurees uniquement dans `.env.local` du serveur, jamais dans le depot:

- Google Search Console: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`
- PageSpeed: `PAGESPEED_API_KEY`
- GA4: `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`
- SerpApi: `SERP_API_KEY`
- Email: transport SMTP ou Resend selon la configuration validee

Verifier les noms et les etats avec `npm run live:api:readiness`. Les valeurs ne doivent jamais apparaitre dans les rapports publics.

## Donnees sensibles

Les documents sont prives, controles par token, soumis au scanner et non mis en cache. Les nouveaux uploads sont chiffres en AES-256-GCM lorsque DOCUMENT_ENCRYPTION_REQUIRED=1. Pour migrer les anciens documents: executer d abord `node scripts/local-document-encryption-migrate.js` en dry-run, sauvegarder SQLite, puis relancer avec `--apply` et verifier le rapport. Le secret de chiffrement reste uniquement dans `.env.local` du serveur et ne doit jamais etre stocke dans Git.

## Deploiement

1. Tester localement les contrats et les smoke tests.
2. Committer uniquement les changements attendus.
3. Pousser la branche principale.
4. Synchroniser le depot serveur avec `git pull --ff-only`.
5. Attendre le cycle runtime ou redemarrer le service apres verification.
6. Tester `https://immeubleassur.com/`, `/api/health` et les en-tetes HTTPS.
7. Verifier que le rapport runtime reference le commit deploye.
