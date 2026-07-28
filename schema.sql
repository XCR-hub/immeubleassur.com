PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  profile TEXT NOT NULL,
  property_type TEXT NOT NULL,
  city TEXT NOT NULL,
  units_count TEXT,
  need TEXT,
  message TEXT,
  lead_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'website',
  page_url TEXT,
  referrer TEXT,
  ip_address TEXT,
  user_agent TEXT,
  assigned_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_need ON leads(need);
CREATE INDEX IF NOT EXISTS idx_leads_need_created_at ON leads(need, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ip_created_at ON leads(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone_created_at ON leads(phone, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at ON lead_events(created_at DESC);

CREATE TABLE IF NOT EXISTS quote_requests (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  insurer_name TEXT,
  requested_at TEXT NOT NULL,
  response_status TEXT NOT NULL DEFAULT 'pending',
  premium_amount_cents INTEGER,
  deductible_cents INTEGER,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_lead_id ON quote_requests(lead_id);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO site_settings (key, value, updated_at)
VALUES
  ('brand_name', 'ImmeubleAssur', datetime('now')),
  ('site_url', 'https://immeubleassur.com', datetime('now')),
  ('contact_email', 'team@immeubleassur.com', datetime('now')),
  ('contact_phone', '+33180855786', datetime('now'));

CREATE TABLE IF NOT EXISTS site_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  page_url TEXT,
  target TEXT,
  session_id TEXT,
  lead_reference TEXT,
  payload TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_events_created_at ON site_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_event_type ON site_events(event_type);
CREATE INDEX IF NOT EXISTS idx_site_events_session_id ON site_events(session_id);
CREATE INDEX IF NOT EXISTS idx_site_events_lead_reference ON site_events(lead_reference);
CREATE INDEX IF NOT EXISTS idx_site_events_type_created_at ON site_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_page_url ON site_events(page_url);
CREATE INDEX IF NOT EXISTS idx_site_events_target ON site_events(target);
CREATE INDEX IF NOT EXISTS idx_site_events_ip_created_at ON site_events(ip_address, created_at DESC);
CREATE TABLE IF NOT EXISTS seo_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  pages_checked INTEGER NOT NULL DEFAULT 0,
  opportunities_count INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_runs_created_at ON seo_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_runs_source ON seo_runs(source);

CREATE TABLE IF NOT EXISTS seo_metrics (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES seo_runs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value REAL,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_metrics_run_id ON seo_metrics(run_id);
CREATE INDEX IF NOT EXISTS idx_seo_metrics_url ON seo_metrics(url);
CREATE INDEX IF NOT EXISTS idx_seo_metrics_type_name ON seo_metrics(metric_type, metric_name);

CREATE TABLE IF NOT EXISTS seo_opportunities (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES seo_runs(id) ON DELETE SET NULL,
  url TEXT,
  query TEXT,
  opportunity_type TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  recommendation TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_opportunities_score ON seo_opportunities(score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_opportunities_status ON seo_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_seo_opportunities_url ON seo_opportunities(url);
CREATE INDEX IF NOT EXISTS idx_seo_opportunities_query ON seo_opportunities(query);

CREATE TABLE IF NOT EXISTS content_pipeline (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  intent TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  quality_score INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_pipeline_category ON content_pipeline(category);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_status ON content_pipeline(status);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_quality ON content_pipeline(quality_score DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  audience TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'website',
  consent_text TEXT,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at ON newsletter_subscribers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_audience ON newsletter_subscribers(audience);

CREATE TABLE IF NOT EXISTS editorial_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'rss',
  category TEXT NOT NULL DEFAULT 'veille',
  authority TEXT NOT NULL DEFAULT 'public',
  crawl_policy TEXT NOT NULL DEFAULT 'rss-or-public-summary',
  active INTEGER NOT NULL DEFAULT 1,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_sources_active ON editorial_sources(active);
CREATE INDEX IF NOT EXISTS idx_editorial_sources_category ON editorial_sources(category);

CREATE TABLE IF NOT EXISTS editorial_watch_items (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES editorial_sources(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  summary TEXT,
  relevance_score INTEGER NOT NULL DEFAULT 0,
  topic TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_editorial_watch_items_relevance ON editorial_watch_items(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_watch_items_fetched_at ON editorial_watch_items(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_watch_items_topic ON editorial_watch_items(topic);
CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_watch_items_url ON editorial_watch_items(url);

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  html_url TEXT,
  plain_text TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_newsletter_issues_created_at ON newsletter_issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_issues_status ON newsletter_issues(status);

CREATE TABLE IF NOT EXISTS newsletter_events (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT REFERENCES newsletter_subscribers(id) ON DELETE SET NULL,
  issue_id TEXT REFERENCES newsletter_issues(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_newsletter_events_subscriber_id ON newsletter_events(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_events_issue_id ON newsletter_events(issue_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_events_created_at ON newsletter_events(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_generation_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT,
  task TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  input_hash TEXT,
  output_hash TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_runs_created_at ON ai_generation_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_runs_provider ON ai_generation_runs(provider);
CREATE TABLE IF NOT EXISTS search_intelligence_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  keywords_checked INTEGER NOT NULL DEFAULT 0,
  average_position REAL,
  first_page_count INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_intelligence_runs_created_at ON search_intelligence_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_intelligence_runs_provider ON search_intelligence_runs(provider);

CREATE TABLE IF NOT EXISTS search_rankings (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES search_intelligence_runs(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  target_url TEXT NOT NULL,
  position INTEGER,
  found_url TEXT,
  top_domains TEXT,
  recommendation TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_rankings_run_id ON search_rankings(run_id);
CREATE INDEX IF NOT EXISTS idx_search_rankings_keyword ON search_rankings(keyword);
CREATE INDEX IF NOT EXISTS idx_search_rankings_position ON search_rankings(position);
CREATE INDEX IF NOT EXISTS idx_search_rankings_created_at ON search_rankings(created_at DESC);

CREATE TABLE IF NOT EXISTS media_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  assets_count INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_runs_created_at ON media_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_runs_provider ON media_runs(provider);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES media_runs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  topic TEXT,
  source_url TEXT,
  image_url TEXT,
  alt_text TEXT,
  photographer TEXT,
  photographer_url TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_run_id ON media_assets(run_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_provider ON media_assets(provider);
CREATE INDEX IF NOT EXISTS idx_media_assets_topic ON media_assets(topic);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at DESC);
