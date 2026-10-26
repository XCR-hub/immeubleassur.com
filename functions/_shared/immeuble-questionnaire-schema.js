export const QUESTIONNAIRE_VERSION = "mma-immeuble-2026-v1";
const f = (id, label, type = "text", extra = {}) => ({ id, label, type, ...extra });
const yn = (id, label, extra = {}) => f(id, label, "choice", { options: [["yes", "Oui"], ["no", "Non"], ["unknown", "Je ne sais pas"]], ...extra });
const long = (id, label, extra = {}) => f(id, label, "textarea", extra);
const n = (id, label, extra = {}) => f(id, label, "number", extra);
const date = (id, label) => f(id, label, "date");
const table = (id, label, columns, maxRows = 20) => f(id, label, "rows", { columns, maxRows });
const when = (field, values) => ({ field, values });

export const questionnaireSections = [
  { id: "identite", title: "Votre copropriété et votre rôle", help: "Vérifiez les informations déjà renseignées. L’adresse doit couvrir tous les bâtiments à assurer.", fields: [
    f("residence_name", "Nom de la résidence ou du syndicat"), f("copro_registration", "Numéro d’immatriculation de la copropriété"), f("insured_siren", "SIREN du souscripteur, s’il en possède un"),
    f("risk_address", "Adresse ou adresses de l’immeuble", "text", { required: true }), f("risk_postcode", "Code postal"), f("risk_city", "Commune", "text", { required: true }),
    f("representative_name", "Nom du représentant", "text", { required: true }), f("representative_role", "Qualité du représentant", "choice", { options: [["benevole", "Syndic bénévole"], ["professionnel", "Syndic professionnel"], ["proprietaire", "Propriétaire"], ["autre", "Autre / à préciser"]] }),
    f("representative_siren", "SIREN du représentant, si applicable"), f("representative_address", "Adresse du représentant"), f("representative_postcode", "Code postal du représentant"), f("representative_city", "Commune du représentant"), f("representative_email", "Email du représentant", "email"), f("representative_phone", "Téléphone du représentant", "tel"),
    long("representation_details", "Mandat, qualité du signataire ou autres précisions"), n("lots_count", "Nombre total de lots déclaré"), n("declared_surface", "Surface que vous avez déjà déclarée (m²)"),
    f("declared_surface_basis", "À quoi correspond cette surface ?", "choice", { options: [["developed", "Superficie développée selon la définition ci-dessous"], ["habitable", "Surface habitable"], ["floor", "Surface de plancher"], ["other", "Autre"], ["unknown", "À confirmer"]] }), long("surface_scope", "Bâtiments, niveaux, parties communes et annexes compris dans cette surface")
  ] },
  { id: "assurance", title: "Assurance et sinistres", help: "Une information inconnue doit rester indiquée comme telle. Joignez le relevé de votre assureur pour confirmer l’historique.", fields: [
    f("current_insurer", "Assureur actuel"), f("current_policy", "Numéro du contrat actuel"), n("current_premium", "Cotisation annuelle actuelle (€)"), date("current_expiry", "Échéance du contrat actuel"),
    yn("insured_36", "Le bien a-t-il été assuré au cours des 36 derniers mois ?"), yn("claims_36", "Y a-t-il eu des sinistres au cours des 36 derniers mois ?"),
    table("claims", "Détail des sinistres sur 36 mois", [f("date", "Date ou année"), f("nature", "Nature"), n("cost", "Coût total, frais compris, franchise non déduite (€)"), n("deductible", "Franchise appliquée (€)"), f("comments", "Commentaires")]),
    yn("major_claims_10", "Sinistres majeurs sur 10 ans, d’au moins 50 000 € ?"), long("major_claims_details", "Dates, nature, montants et franchises des sinistres majeurs"),
    yn("terminated", "Le contrat a-t-il été résilié ?"), long("termination_details", "Date et motif de résiliation"), yn("coverage_gap", "Y a-t-il eu une interruption d’assurance au cours des 36 derniers mois ?"), long("insurance_comments", "Précisions sur l’assurance et les antécédents")
  ] },
  { id: "batiments", title: "Bâtiments et superficies", help: "La superficie développée totalise tous les niveaux, murs compris. Le modèle MMA compte pour moitié certaines annexes non aménagées et sans usage industriel ou commercial : greniers, combles aménageables, caves, buanderies, celliers, garages, remises et débarras. Fournissez le détail pour permettre sa vérification.", fields: [
    table("buildings", "Un descriptif par bâtiment", [f("name", "Nom ou repère du bâtiment"), f("category", "Catégorie de construction"), n("year", "Année de construction"), n("floors", "Étages au-dessus du rez-de-chaussée"), n("basements", "Nombre de sous-sols"), f("construction_type", "Type de construction MMA (1, 2, 3 ou inconnu)"), f("use", "Usage / destination"), n("developed_area", "Superficie développée (m²)"), n("value_per_m2", "Valeur du bâtiment (€/m²)")], 12),
    n("developed_total", "Superficie développée totale (m²), si confirmée"), long("surface_calculation", "Détail des surfaces par niveau et des pondérations des annexes"), n("building_height", "Hauteur du bâtiment le plus haut (m)"), n("largest_building_area", "Surface du bâtiment le plus important (m²)"), date("acquisition_date", "Date d’acquisition / donation / héritage, si connue"),
    long("construction_details", "Murs, ossature, toiture, revêtement extérieur : matériaux et proportions connus"), yn("roof_hard_85", "Couverture composée à plus de 85 % de matériaux durs ?"), yn("roof_hard_50", "À défaut, couverture composée à plus de 50 % de matériaux durs ?"), yn("walls_hard_50", "Construction composée à plus de 50 % de matériaux durs ?")
  ] },
  { id: "etat", title: "État général et travaux", help: "La définition de bon état du questionnaire vise notamment les façades, toitures, parties communes, entretien des ascenseurs et absence d’arrêté de mise en sécurité. Une visite n’est jamais déduite de vos réponses.", fields: [
    yn("good_condition", "La copropriété est-elle en bon état général selon ces critères ?"), long("condition_details", "Fissures, humidité, vétusté, défauts visibles et points à signaler"), yn("common_parts_good", "Les parties communes sont-elles en bon état apparent, dégagées et sans vandalisme ?"),
    date("last_facade_work", "Dernier ravalement"), date("last_roof_work", "Dernière réfection de toiture / étanchéité"), date("last_plumbing_work", "Derniers travaux de canalisations"),
    yn("recent_works", "Des travaux ont-ils été réalisés au cours des 36 derniers mois ?"), long("recent_works_details", "Nature, dates et entreprises des travaux réalisés"), yn("planned_works", "Des travaux sont-ils programmés ?"), long("planned_works_details", "Nature et calendrier des travaux prévus"),
    yn("wood_floors_stairs", "Présence de planchers ou d’escaliers en bois ?"), yn("enclosed_stairs", "Les escaliers sont-ils encagés ?"), yn("green_roofs_walls", "Présence de murs ou toitures végétalisés ?"), yn("technical_glazing", "Présence de murs miroir, murs rideaux, verrières, puits de lumière ou produits verriers techniques ?"), long("technical_glazing_details", "Nature, importance et valeur des éléments vitrés"), yn("regulatory_constraints", "Contraintes réglementaires particulières ?"), long("regulatory_details", "Précisez ces contraintes")
  ] },
  { id: "usages", title: "Occupation, logements et activités", help: "Le type « mixte » ne précise pas à lui seul les activités exercées. Indiquez les usages réels et la part des commerces.", fields: [
    f("use_type", "Usage du bâtiment", "choice", { options: [["habitation", "Habitation et/ou bureaux"], ["mixte", "Logements et exploitation professionnelle"], ["professionnel", "Exploitation professionnelle uniquement"], ["unknown", "À confirmer"]] }),
    n("housing_count", "Nombre de logements"), n("housing_area", "Surface des logements (m²)"), n("private_occupancy_percent", "Part de l’occupation privative (%)", { max: 100 }), yn("shops_present", "Présence de commerces ?"), n("shops_percent", "Part des commerces dans la superficie développée (%)", { max: 100 }),
    table("activities", "Activités et lots professionnels", [f("tenant", "Locataire / exploitant"), f("primary_activity", "Activité principale"), f("secondary_activity", "Activités secondaires"), n("lots", "Lots concernés"), n("area", "Surface occupée (m²)"), f("website", "Site internet, si utile")]),
    yn("night_activity", "Présence de discothèque, bar, activité de nuit, bowling ou salle de jeux ?"), yn("erp", "Établissement recevant du public (ERP) ?"), f("erp_category", "Catégorie ERP"), yn("erp_commission", "Commission de sécurité pour l’ERP ?"), date("erp_last_visit", "Dernière visite de la commission ERP"), yn("erp_favourable", "Avis favorable de la commission ERP ?"), long("erp_comments", "Réserves ou commentaires ERP"),
    yn("high_building", "Immeuble de grande hauteur / grand ensemble immobilier ?"), f("high_building_category", "Catégorie IGH / GEI"), yn("high_building_commission", "Commission de sécurité IGH / GEI ?"), date("high_building_visit", "Dernière visite de la commission IGH / GEI"), long("high_building_comments", "Réserves ou commentaires IGH / GEI")
  ] },
  { id: "environnement", title: "Environnement et particularités", fields: [
    yn("catnat_commune", "La commune a-t-elle fait l’objet de catastrophes naturelles ?"), long("catnat_details", "Années et motifs connus"), yn("natural_risk_zone", "Le bâtiment est-il exposé à un risque naturel ?"), long("natural_risk_details", "Inondation, sécheresse, mouvement de terrain ou autres risques connus"),
    f("location_context", "Situation de l’immeuble", "choice", { options: [["centre", "Centre-ville"], ["isole", "Isolé"], ["commercial", "Zone commerciale"], ["industriel", "Zone industrielle"], ["autre", "Autre"], ["unknown", "Je ne sais pas"]] }),
    yn("priority_district", "Quartier prioritaire / zone urbaine sensible ?"), yn("dense_vegetation", "Végétation dense à proximité ?"), yn("near_water", "Proximité d’un cours d’eau ou plan d’eau ?"), n("water_distance", "Distance du cours d’eau / plan d’eau (m)"), yn("theft_sensitive", "Environnement sensible au vol ou vandalisme ?"), yn("hazard_neighbour", "Activité aggravante à proximité (SEVESO, stockage, scierie, lithium…) ?"), long("neighbour_details", "Activité, distance, contiguïté et importance du voisinage"),
    yn("isolated_20m", "Bâtiments voisins distants de plus de 20 m ?"), yn("aggravating_contiguity", "Communauté ou contiguïté aggravante ?"), yn("shared_basement", "Communication par caves ou parkings souterrains ?"), long("environment_comments", "Autres précisions sur l’environnement"),
    yn("historic_listed", "Bâtiment classé monument historique ou inscrit, même partiellement ?"), long("historic_elements", "Éléments classés et commentaires"), yn("artistic_features", "Particularités artistiques, historiques ou autres ?"), long("artistic_details", "Désignez ces particularités"), n("firefighters_distance", "Distance des secours (km)"), n("firefighters_delay", "Délai d’intervention estimé (minutes)"), long("water_resources", "Ressources en eau / bornes incendie et distances connues")
  ] },
  { id: "vacance", title: "Vacance et arrêtés", fields: [
    yn("safety_order", "Arrêté de mise en sécurité, péril, insalubrité ou interdiction d’occupation ?"), long("safety_order_details", "Bâtiments concernés et nature de l’arrêté"), yn("unoccupied", "Bâtiments ou parties inoccupés, inexploités ou désaffectés ?"), n("unoccupied_percent", "Part de la superficie inoccupée (%)", { max: 100 }),
    f("unoccupied_type", "Type de parties inoccupées", "choice", { options: [["logement", "Logement privatif"], ["professionnel", "Local professionnel"], ["mixte", "Les deux"], ["unknown", "À confirmer"]] }), date("unoccupied_start", "Début de l’inoccupation"), n("unoccupied_duration", "Durée estimée (mois)"), long("unoccupied_cause", "Cause / motif de l’inoccupation"), long("reoccupation_actions", "Moyens mis en œuvre pour réoccuper les locaux"), long("future_activity", "Activité du futur locataire professionnel"),
    yn("regular_visit", "Passage régulier d’une personne autorisée ?"), f("visit_frequency", "Fréquence des passages"), yn("electricity_cut", "Alimentation électrique coupée ?"), yn("water_cut", "Compteur d’eau coupé ?"), long("unoccupied_condition", "État connu des parties inoccupées (à visiter si nécessaire)"), long("vacancy_comments", "Commentaires sur la vacance")
  ] },
  { id: "equipements", title: "Équipements et installations", fields: [
    yn("collective_heating", "Chauffage ou production d’eau chaude collectifs ?"), long("heating_type", "Type de chauffage, énergie et nature des installations"), yn("locked_boiler_room", "Chaudière dans un local dédié fermé à clé ?"), yn("collective_gas", "Gaz pour une chaudière collective ?"), yn("private_gas", "Gaz dans les parties privatives (chauffage / cuisine) ?"),
    yn("pool_spa", "Piscine, spa et/ou sauna ?"), long("pool_details", "Précisez les équipements et leurs usages"), yn("lifts", "Ascenseurs présents ?"), yn("lift_maintenance", "Contrat d’entretien des ascenseurs ?"),
    yn("charging_points", "Bornes de recharge électrique ?"), yn("charging_on_site", "Bornes dans l’enceinte de la copropriété ?"), yn("charging_inside", "Bornes à l’intérieur des bâtiments ?"),
    yn("solar_panels", "Panneaux photovoltaïques et/ou thermiques ?"), long("solar_brands", "Caractéristiques et marques des panneaux"), f("solar_owner", "Propriétaire / exploitant de l’installation"), n("solar_area", "Surface de l’installation (m²)"), date("solar_started", "Mise en service de l’installation solaire"), f("solar_location", "Emplacement : toiture, ombrière ou façade"), yn("solar_maintenance", "Contrat de maintenance annuelle ?"), f("inverter_location", "Localisation des onduleurs"), f("battery_location", "Localisation des batteries"), yn("fireproof_room", "Local coupe-feu ?"),
    yn("common_batteries", "Équipements à batteries dans les parties communes (vélos, trottinettes…) ?"), long("common_battery_details", "Désignez les équipements à batteries")
  ] },
  { id: "prevention", title: "Prévention, incendie et sécurité", fields: [
    yn("prevention_present", "Dispositifs de prévention / protection incendie et malveillance ?"),
    table("prevention_equipment", "Équipements et vérifications", [f("equipment", "Équipement (extincteurs étages / parking, colonnes, RIA, installations incendie, électricité, thermographie…)"), yn("present", "Présent ?"), yn("annual_check", "Vérifié annuellement ?"), yn("trained_staff", "Personnel formé ?"), f("inspector", "Organisme vérificateur"), yn("anomalies", "Anomalies ?"), yn("followed_up", "Anomalies suivies ?")], 15),
    date("extinguisher_report_date", "Date du dernier contrôle des extincteurs"), yn("smoking_ban", "Interdiction de fumer / vapoter affichée et respectée ?"), yn("electrical_good", "Tableau et installations électriques en bon état visuel ?"), yn("electrical_annual", "Installations électriques vérifiées annuellement ?"), yn("electrical_q18", "Rapport de prévention électrique / Q18 disponible ?"),
    yn("surveillance", "Surveillance et organisation de la sécurité ?"), yn("secured_access", "Accès sécurisé : clôture, digicode ou visiophone ?"), yn("guarding", "Gardiennage ?"), yn("secured_parking", "Accès parkings sécurisé ?"), long("other_security", "Télésurveillance, désenfumage, détection et autres protections"), yn("lightning", "Protection contre la foudre ?"), yn("hot_work", "Travaux par points chauds ?"), long("hot_work_details", "Lesquels ?"), long("prevention_comments", "Commentaires sur les installations, normes et certificats N / Q disponibles")
  ] },
  { id: "garanties", title: "Garanties et dates souhaitées", fields: [
    yn("damage_works", "Assurance dommages-ouvrage couvrant les bâtiments ?"), f("damage_works_insurer", "Assureur dommages-ouvrage"), f("damage_works_policy", "Numéro dommages-ouvrage"), date("damage_works_start", "Début de validité dommages-ouvrage"), date("damage_works_end", "Fin de validité dommages-ouvrage"),
    yn("waiver_recourse", "Renonciation à recours prévue dans des baux ?"), long("waiver_details", "Détail des renonciations à recours"), yn("special_clauses", "Clauses particulières ou compléments souhaités ?"), long("special_clauses_details", "Précisez les clauses ou compléments"),
    yn("indemnity_limit", "Limitation contractuelle d’indemnité générale souhaitée ?"), n("indemnity_amount", "Montant de la limitation souhaitée (€)"), long("indemnity_sublimit", "Sous-limitations souhaitées"), date("effective_date", "Date d’effet souhaitée"), date("main_expiry", "Échéance principale souhaitée"), n("notice_months", "Préavis souhaité (mois)"), long("final_comments", "Autres informations utiles à l’étude")
  ] }
];

export const questionnaireDocuments = [
  ["mma_registration", "Immatriculation de la copropriété"], ["mma_mandate", "PV désignant le syndic / mandat"], ["mma_identity", "Justificatif d’identité du représentant ou signataire"], ["current_contract", "Contrat actuel et appel de cotisation"], ["claims_history", "Relevé de sinistres et franchises"],
  ["mma_kbis", "Kbis / justificatif de la personne morale, si applicable"], ["mma_association", "Statuts et déclaration de l’association, si applicable"], ["mma_works_plan", "Plan pluriannuel de travaux"], ["mma_site_plan", "Plan de masse"], ["mma_photos", "Photos extérieures, intérieures et de l’environnement"], ["mma_rules", "Règlement de copropriété"], ["mma_division", "État de division des volumes / surfaces"],
  ["mma_asl", "Statuts ASL / AFUL, si applicable"], ["mma_historic", "Déclaration des éléments classés, si applicable"], ["mma_security_commission", "Avis de commission de sécurité, si applicable"], ["mma_certificates", "Certificats d’installation et conformité"], ["mma_checks", "Rapports de vérifications périodiques Q4 / Q18 / Q19"], ["mma_maintenance", "Carnet et contrats d’entretien"], ["mma_ag", "Dernier PV d’assemblée générale"], ["mma_do", "Attestation dommages-ouvrage"], ["mma_leases", "Baux professionnels en cours / projet"]
];

export const questionnaireFields = questionnaireSections.flatMap(section => section.fields);
export const allFieldIds = new Set(questionnaireFields.map(field => field.id));
export function sanitizeAnswers(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Réponses invalides");
  for (const key of Object.keys(input)) if (!allFieldIds.has(key)) throw new Error("Champ inconnu : " + key);
  const validate = (field, value) => {
    if (value === undefined || value === null || value === "") return "";
    if (field.type === "rows") {
      if (!Array.isArray(value) || value.length > field.maxRows) throw new Error("Tableau invalide : " + field.label);
      return value.map(row => {
        if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(key => !field.columns.some(column => column.id === key))) throw new Error("Ligne invalide");
        return Object.fromEntries(field.columns.map(column => [column.id, validate(column, row[column.id])]));
      });
    }
    if (typeof value !== "string" && typeof value !== "number") throw new Error("Valeur invalide : " + field.label);
    const text = String(value).trim();
    if (text.length > (field.type === "textarea" ? 6000 : 600) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("Texte invalide : " + field.label);
    if (field.type === "choice" && !field.options.some(([key]) => key === text)) throw new Error("Choix invalide : " + field.label);
    if (field.type === "number") { const number = Number(text.replace(",", ".")); if (!Number.isFinite(number) || number < 0 || number > (field.max || 1e12)) throw new Error("Nombre invalide : " + field.label); return number; }
    if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text)) throw new Error("Date invalide : " + field.label);
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error("Email invalide");
    return text;
  };
  return Object.fromEntries(questionnaireFields.map(field => [field.id, validate(field, input[field.id])]));
}
export function displayAnswer(field, value) {
  if (value === "" || value === undefined || value === null) return "À compléter";
  if (field.type === "choice") return field.options.find(([key]) => key === value)?.[1] || "À compléter";
  return String(value);
}
export function unresolvedAnswers(answers) {
  return questionnaireFields.filter(field => answers[field.id] === "unknown" || answers[field.id] === "" || answers[field.id] === undefined || (field.type === "rows" && !answers[field.id]?.length)).map(field => ({ id: field.id, label: field.label }));
}
