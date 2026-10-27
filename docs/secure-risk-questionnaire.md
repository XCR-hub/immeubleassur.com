# Questionnaire immeuble sécurisé

Le parcours `/questionnaire-immeuble` recueille les champs du questionnaire MMA Immeubles sur mesure et du rapport de visite immeuble. Les modèles vierges restent dans `resources/mma`, hors du répertoire public. Le serveur génère le rapport PDF, une annexe PDF exhaustive et le questionnaire Word complété par cette annexe. Aucune visite ni signature ne sont déduites des réponses.

## Invitation et accès

L’administration expose la section « Questionnaires immeuble sécurisés » et les routes `/api/admin/questionnaires`. L’action `create` prend un `case_id`, un préremplissage optionnel `answers` et une durée `days` comprise entre 1 et 30. Elle prépare un mail client dans `draft_review`, sans l’envoyer. Les réponses inconnues restent vides ou explicitement « Je ne sais pas ».

Le lien contient un secret aléatoire de 256 bits dans le fragment URL. Le navigateur retire ce fragment, conserve l’accès uniquement dans sa session et utilise un en-tête Authorization. Le secret est haché dans la table d’accès ; le mail d’invitation contenant le lien reste privé dans la file de brouillons. L’accès expire, peut être révoqué et est refusé pour un dossier perdu/archivé ou un portail révoqué. Les erreurs d’accès sont limitées et n’enregistrent pas le secret.

`DOCUMENT_ENCRYPTION_KEY` (32 octets, hexadécimal ou base64) est obligatoire. Les réponses, instantanés et documents générés sont chiffrés avec le service AES-256-GCM existant. Les dépôts de pièces réutilisent l’antivirus et le chiffrement du portail ; une nouvelle version ne supprime pas l’ancienne.

## Transmission et documents

L’enregistrement utilise un numéro de révision pour empêcher un autre onglet d’écraser les réponses. « Transmettre mes réponses » conserve un instantané avec confirmation client et prépare les trois documents. Des rubriques peuvent rester inconnues ou sans objet : elles sont signalées au courtier et ne sont pas transformées en réponses négatives.

Le serveur adresse les documents uniquement à `team@immeubleassur.com`, après transmission explicite du client. Il crée également un brouillon assureur sans destinataire, avec approbation humaine obligatoire. Les pièces générées sont jointes par le transport existant lors de l’envoi humain du brouillon. Les pièces déposées par le client restent soumises à leur validation habituelle.

Les mails aux prospects utilisent `team@immeubleassur.com` comme expéditeur et adresse de réponse. Les consultations assureurs et leurs relances utilisent `tcerda@xcr.fr`. Le compte assureur peut être chargé depuis le fichier Windows DPAPI indiqué par `INSURER_MAIL_CONFIG_PATH` ; le mot de passe reste chiffré sur disque et n’est déchiffré qu’en mémoire au démarrage du serveur. Les paramètres `INSURER_SMTP_*` permettent aussi un compte SMTP distinct. L’envoi utilise l’autorisation déjà donnée par Tony pour les messages prospects prêts : l’agent les valide puis les envoie, sans nouvelle demande de confirmation et sans renvoyer un message déjà accepté par la messagerie.

La réception des réponses est conservée même si la génération ou la notification échoue. Le centre admin permet de reprendre les opérations en échec. Une notification en état `sending` après incident doit être vérifiée humainement avant toute reprise pour éviter un double envoi. Les téléchargements sont authentifiés, limités au bon questionnaire et servis en `no-store`.

## Contrôles

`node --test scripts/risk-questionnaire-workflow.test.js` couvre les liens et l’expiration, le refus sans clé de chiffrement, les révisions concurrentes, les formats, le scanner, les versions de pièces, la transmission explicite, les documents réels, l’idempotence et le brouillon assureur.

L’administration peut préparer un nouveau destinataire et un texte avec l’action `prepare_draft`, qui remet toujours le mail en `draft_review`. Ni la création du lien ni le chargement de l’admin n’envoie un message au prospect ou à un assureur.
