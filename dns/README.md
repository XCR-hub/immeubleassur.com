# DNS ImmeubleAssur

L'IP publique est fixe: `80.15.56.123`. Le DDNS Cloudflare n'est donc plus utile et a ete supprime du serveur.

Pour quitter totalement Cloudflare cote DNS:

1. Creer les enregistrements de `dns/registrar-records.json` chez le registrar ou chez le nouveau DNS.
2. Verifier que `@`, `www`, MX, SPF, DMARC et CAA sont presents.
3. Changer les nameservers du domaine chez le registrar pour ceux du nouveau DNS.
4. Apres propagation, lancer `npm run dns:autarky:strict`.

Le fichier `dns/zone-template.bind` sert seulement si le nouveau DNS accepte une zone BIND complete. Les NS `example-dns.invalid` doivent etre remplaces par les vrais nameservers avant usage.

Auto-heberger l'autorite DNS sur une seule IP n'est pas recommande: beaucoup de registrars demandent deux nameservers publics et une panne DNS rendrait le site invisible. Le DNS du registrar est le chemin le plus simple pour supprimer Cloudflare sans ajouter de cout recurrent.