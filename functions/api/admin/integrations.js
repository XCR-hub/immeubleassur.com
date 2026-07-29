const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const connectorDefinitions = [
  {
    id: "openai",
    label: "OpenAI",
    family: "ia",
    scope: "Synthese de veille, newsletter et enrichissement editorial.",
    runtime: "build",
    required: ["OPENAI_API_KEY"],
    optional: ["OPENAI_MODEL"]
  },
  {
    id: "anthropic",
    label: "Claude / Anthropic",
    family: "ia",
    scope: "Alternative IA pour les resumes et angles editoriaux.",
    runtime: "build",
    required: ["ANTHROPIC_API_KEY"],
    optional: ["ANTHROPIC_MODEL"]
  },
  {
    id: "gemini",
    label: "Gemini",
    family: "ia",
    scope: "Alternative IA pour synthese et reformulation controlee.",
    runtime: "build",
    required: ["GEMINI_API_KEY"],
    optional: ["GEMINI_MODEL"]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    family: "ia",
    scope: "Routage modele IA de secours pour l'autopilote editorial.",
    runtime: "build",
    required: ["OPENROUTER_API_KEY"],
    optional: ["OPENROUTER_MODEL"]
  },
  {
    id: "huggingface",
    label: "HuggingFace",
    family: "ia",
    scope: "Modele IA de secours pour generation controlee.",
    runtime: "build",
    required: ["HUGGINGFACE_API_KEY"],
    optional: ["HUGGINGFACE_MODEL"]
  },
  {
    id: "pexels",
    label: "Pexels",
    family: "media",
    scope: "Selection de visuels immobiliers avec attribution.",
    runtime: "build",
    required: ["PEXELS_API_KEY"],
    optional: []
  },
  {
    id: "serpapi",
    label: "SerpApi",
    family: "seo",
    scope: "Suivi positions Google et concurrents visibles sans scraping direct.",
    runtime: "build",
    required: ["SERP_API_KEY"],
    optional: []
  },
  {
    id: "google-search-console",
    label: "Google Search Console",
    family: "google",
    scope: "Requetes, CTR, position moyenne, inspection URL et sitemap.",
    runtime: "build",
    required: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY", "GOOGLE_SEARCH_CONSOLE_SITE_URL"],
    optional: ["GOOGLE_URL_INSPECTION_LIMIT", "GOOGLE_URL_INSPECTION_URLS"]
  },
  {
    id: "pagespeed",
    label: "PageSpeed Insights",
    family: "google",
    scope: "Controle performance pages prioritaires.",
    runtime: "build",
    required: ["PAGESPEED_API_KEY"],
    optional: []
  },
  {
    id: "ga4",
    label: "Google Analytics 4",
    family: "analytics",
    scope: "Mesure evenements non nominaux et valeur lead estimee.",
    runtime: "build/runtime",
    required: ["GA4_MEASUREMENT_ID"],
    optional: ["GA4_API_SECRET", "GA4_REGION"]
  },
  {
    id: "smtp",
    label: "SMTP mail.xcr.fr",
    family: "email",
    scope: "Notifications leads et envoi newsletter.",
    runtime: "runtime",
    required: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_TO"],
    optional: ["NEWSLETTER_SEND_LIMIT"]
  },
  {
    id: "local-antifraud",
    label: "Anti-fraude local",
    family: "security",
    scope: "Honeypot, signaux JS, vitesse de saisie, session, historique IP/email/telephone.",
    runtime: "runtime",
    required: [],
    optional: []
  },
  {
    id: "turnstile",
    label: "Cloudflare Turnstile",
    family: "security",
    scope: "Verification anti-robot automatique sur formulaires, en complement du filtre local.",
    runtime: "build/runtime",
    required: ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
    optional: ["TURNSTILE_FAIL_OPEN", "TURNSTILE_THEME"]
  },
  {
    id: "admin-api",
    label: "Admin API",
    family: "security",
    scope: "Protection de l'espace leads, SEO et integrations.",
    runtime: "runtime",
    required: ["ADMIN_API_TOKEN"],
    optional: []
  }
];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authorized(request, env) {
  const expected = env.ADMIN_API_TOKEN;
  if (!expected) return false;
  return (request.headers.get("Authorization") || "") === `Bearer ${expected}`;
}

function hasConfiguredValue(env, key) {
  return String(env[key] || "").trim().length > 0;
}

function connectorStatus(env, definition) {
  const requiredStatus = definition.required.map((name) => ({ name, configured: hasConfiguredValue(env, name) }));
  const optionalStatus = definition.optional.map((name) => ({ name, configured: hasConfiguredValue(env, name) }));
  const configured = requiredStatus.every((item) => item.configured);
  return {
    id: definition.id,
    label: definition.label,
    family: definition.family,
    scope: definition.scope,
    runtime: definition.runtime,
    configured,
    configured_required: requiredStatus.filter((item) => item.configured).length,
    required_count: requiredStatus.length,
    configured_optional: optionalStatus.filter((item) => item.configured).length,
    optional_count: optionalStatus.length,
    secret_names: [...definition.required, ...definition.optional],
    missing_secret_names: requiredStatus.filter((item) => !item.configured).map((item) => item.name)
  };
}

async function safeFirst(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    return binds.length ? await statement.bind(...binds).first() : await statement.first();
  } catch (error) {
    return { error: error.message };
  }
}

async function safeAll(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    const result = binds.length ? await statement.bind(...binds).all() : await statement.all();
    return result.results || [];
  } catch (error) {
    return { error: error.message };
  }
}

function rowsOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function errorOf(value) {
  return value && value.error ? value.error : "";
}

function countEvent(rows, eventType) {
  const row = rowsOrEmpty(rows).find((item) => item.event_type === eventType);
  return Number(row?.count || 0);
}

async function reportStatus(env) {
  if (!env.DB) {
    return { warnings: ["Base SQLite indisponible"], reports: {} };
  }

  const [
    latestSeoRun,
    latestAiRun,
    aiRunsByProvider,
    latestSearchRun,
    latestMediaRun,
    mediaAssets30d,
    newsletterSubscribers,
    latestNewsletterIssue,
    newsletterEvents,
    siteEventCounts,
    recentSpamBlocks
  ] = await Promise.all([
    safeFirst(env, `SELECT id, source, status, pages_checked, opportunities_count, created_at FROM seo_runs ORDER BY created_at DESC LIMIT 1`),
    safeFirst(env, `SELECT id, provider, model, task, status, created_at FROM ai_generation_runs ORDER BY created_at DESC LIMIT 1`),
    safeAll(env, `SELECT provider, status, COUNT(*) AS count, MAX(created_at) AS last_seen FROM ai_generation_runs WHERE created_at >= datetime('now', '-30 days') GROUP BY provider, status ORDER BY last_seen DESC`),
    safeFirst(env, `SELECT id, provider, status, keywords_checked, average_position, first_page_count, created_at FROM search_intelligence_runs ORDER BY created_at DESC LIMIT 1`),
    safeFirst(env, `SELECT id, provider, status, assets_count, created_at FROM media_runs ORDER BY created_at DESC LIMIT 1`),
    safeFirst(env, `SELECT COUNT(*) AS count FROM media_assets WHERE created_at >= datetime('now', '-30 days')`),
    safeAll(env, `SELECT status, COUNT(*) AS count FROM newsletter_subscribers GROUP BY status ORDER BY count DESC`),
    safeFirst(env, `SELECT id, slug, title, status, created_at, published_at, sent_at FROM newsletter_issues ORDER BY created_at DESC LIMIT 1`),
    safeAll(env, `SELECT event_type, COUNT(*) AS count FROM newsletter_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type ORDER BY count DESC`),
    safeAll(env, `SELECT event_type, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type ORDER BY count DESC`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.label'), ''), 'anti-spam') AS reason, COUNT(*) AS blocked FROM site_events WHERE event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-30 days') GROUP BY path, reason ORDER BY blocked DESC LIMIT 10`)
  ]);

  return {
    warnings: [
      errorOf(latestSeoRun),
      errorOf(latestAiRun),
      errorOf(aiRunsByProvider),
      errorOf(latestSearchRun),
      errorOf(latestMediaRun),
      errorOf(mediaAssets30d),
      errorOf(newsletterSubscribers),
      errorOf(latestNewsletterIssue),
      errorOf(newsletterEvents),
      errorOf(siteEventCounts),
      errorOf(recentSpamBlocks)
    ].filter(Boolean),
    reports: {
      latest_seo_run: latestSeoRun && !latestSeoRun.error ? latestSeoRun : null,
      latest_ai_run: latestAiRun && !latestAiRun.error ? latestAiRun : null,
      ai_runs_by_provider: rowsOrEmpty(aiRunsByProvider),
      latest_search_run: latestSearchRun && !latestSearchRun.error ? latestSearchRun : null,
      latest_media_run: latestMediaRun && !latestMediaRun.error ? latestMediaRun : null,
      media_assets_30d: Number(mediaAssets30d?.count || 0),
      newsletter_subscribers: rowsOrEmpty(newsletterSubscribers),
      latest_newsletter_issue: latestNewsletterIssue && !latestNewsletterIssue.error ? latestNewsletterIssue : null,
      newsletter_events_30d: rowsOrEmpty(newsletterEvents),
      site_events_30d: rowsOrEmpty(siteEventCounts),
      lead_spam_blocks_30d: countEvent(siteEventCounts, "lead_spam_blocked"),
      newsletter_spam_blocks_30d: countEvent(siteEventCounts, "newsletter_spam_blocked"),
      recent_spam_blocks: rowsOrEmpty(recentSpamBlocks)
    }
  };
}

function buildActions(connectors, reports) {
  const actions = [];
  for (const connector of connectors) {
    if (!connector.configured) {
      actions.push({
        priority: connector.family === "security" || connector.family === "email" ? 95 : 80,
        connector: connector.label,
        type: "secret-manquant",
        recommendation: `Configurer ${connector.missing_secret_names.join(", ")} dans l'environnement approprie.`
      });
    }
  }

  if (!reports.latest_ai_run) {
    actions.push({
      priority: 82,
      connector: "IA editoriale",
      type: "run-manquant",
      recommendation: "Verifier que le serveur local importe les rapports editoriaux apres generation."
    });
  }

  if (reports.latest_media_run?.status && String(reports.latest_media_run.status).includes("no-pexels")) {
    actions.push({
      priority: 78,
      connector: "Pexels",
      type: "fallback-media",
      recommendation: "Ajouter PEXELS_API_KEY en secret GitHub Actions pour remplacer le plan media par des visuels attribues."
    });
  }

  if (reports.latest_search_run?.status && String(reports.latest_search_run.status).includes("no-serp")) {
    actions.push({
      priority: 79,
      connector: "SerpApi",
      type: "fallback-serp",
      recommendation: "Ajouter SERP_API_KEY en secret GitHub Actions pour mesurer les vraies positions Google."
    });
  }

  const spamBlocks = Number(reports.lead_spam_blocks_30d || 0) + Number(reports.newsletter_spam_blocks_30d || 0);
  if (spamBlocks > 0) {
    actions.push({
      priority: 92,
      connector: "Anti-spam",
      type: "robots-detectes",
      recommendation: `Surveiller ${spamBlocks} blocage(s) formulaire sur 30 jours et renforcer les seuils du filtre local si le volume augmente.`
    });
  }

  return actions.sort((a, b) => b.priority - a.priority).slice(0, 16);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }

  const connectors = connectorDefinitions.map((definition) => connectorStatus(env, definition));
  const { reports, warnings } = await reportStatus(env);

  return json({
    success: true,
    generated_at: new Date().toISOString(),
    note: "Les noms de secrets sont exposes pour audit, jamais leurs valeurs.",
    connectors,
    reports,
    actions: buildActions(connectors, reports),
    warnings
  });
}
