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
CREATE TABLE IF NOT EXISTS brokerage_cases (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  case_reference TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL DEFAULT 'qualification',
  readiness_score INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'standard',
  estimated_value_min_cents INTEGER NOT NULL DEFAULT 0,
  estimated_value_max_cents INTEGER NOT NULL DEFAULT 0,
  client_portal_token TEXT NOT NULL UNIQUE,
  client_portal_token_revoked_at TEXT NOT NULL DEFAULT "",
  assigned_to TEXT,
  next_action TEXT,
  due_at TEXT,
  human_review_required INTEGER NOT NULL DEFAULT 1,
  consent_snapshot TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brokerage_cases_stage ON brokerage_cases(stage);
CREATE INDEX IF NOT EXISTS idx_brokerage_cases_priority ON brokerage_cases(priority);
CREATE INDEX IF NOT EXISTS idx_brokerage_cases_due_at ON brokerage_cases(due_at);
CREATE INDEX IF NOT EXISTS idx_brokerage_cases_updated_at ON brokerage_cases(updated_at DESC);

CREATE TABLE IF NOT EXISTS case_documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_at TEXT NOT NULL,
  received_at TEXT,
  validated_at TEXT,
  notes TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(case_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_case_documents_case_id ON case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_status ON case_documents(status);
CREATE INDEX IF NOT EXISTS idx_case_documents_type ON case_documents(document_type);

CREATE TABLE IF NOT EXISTS insurer_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_email TEXT,
  appetite_profile TEXT,
  service_level_hours INTEGER NOT NULL DEFAULT 48,
  active INTEGER NOT NULL DEFAULT 1,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insurer_partners_active ON insurer_partners(active);

CREATE TABLE IF NOT EXISTS insurer_consultations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
  partner_id TEXT REFERENCES insurer_partners(id) ON DELETE SET NULL,
  insurer_name TEXT NOT NULL,
  recipient_email TEXT,
  status TEXT NOT NULL DEFAULT 'draft_review',
  package_status TEXT NOT NULL DEFAULT 'incomplete',
  response_due_at TEXT,
  sent_at TEXT,
  answered_at TEXT,
  premium_amount_cents INTEGER,
  deductible_cents INTEGER,
  human_approved_at TEXT,
  notes TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insurer_consultations_case_id ON insurer_consultations(case_id);
CREATE INDEX IF NOT EXISTS idx_insurer_consultations_status ON insurer_consultations(status);
CREATE INDEX IF NOT EXISTS idx_insurer_consultations_due_at ON insurer_consultations(response_due_at);

CREATE TABLE IF NOT EXISTS insurer_consultation_tokens (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES insurer_consultations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  last_used_at TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insurer_consultation_tokens_token ON insurer_consultation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_insurer_consultation_tokens_consultation ON insurer_consultation_tokens(consultation_id);
CREATE INDEX IF NOT EXISTS idx_insurer_consultation_tokens_status ON insurer_consultation_tokens(status);

CREATE TABLE IF NOT EXISTS client_offer_recommendations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
  consultation_id TEXT REFERENCES insurer_consultations(id) ON DELETE SET NULL,
  insurer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft_review',
  premium_amount_cents INTEGER,
  deductible_cents INTEGER,
  recommendation TEXT,
  coverage_summary TEXT,
  exclusions_summary TEXT,
  validity_until TEXT,
  human_approved_at TEXT,
  approved_by TEXT,
  presented_at TEXT,
  decision_at TEXT,
  accepted_at TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_offer_recommendations_consultation_unique ON client_offer_recommendations(consultation_id);
CREATE INDEX IF NOT EXISTS idx_client_offer_recommendations_case_id ON client_offer_recommendations(case_id);
CREATE INDEX IF NOT EXISTS idx_client_offer_recommendations_status ON client_offer_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_client_offer_recommendations_validity ON client_offer_recommendations(validity_until);
CREATE TABLE IF NOT EXISTS case_mail_queue (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  recipient_email TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft_review',
  review_required INTEGER NOT NULL DEFAULT 1,
  scheduled_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  sent_at TEXT,
  last_error TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_case_mail_queue_case_id ON case_mail_queue(case_id);
CREATE INDEX IF NOT EXISTS idx_case_mail_queue_status ON case_mail_queue(status);
CREATE INDEX IF NOT EXISTS idx_case_mail_queue_scheduled ON case_mail_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_case_mail_queue_audience ON case_mail_queue(audience);

CREATE TABLE IF NOT EXISTS case_timeline (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES brokerage_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_case_timeline_case_id ON case_timeline(case_id);
CREATE INDEX IF NOT EXISTS idx_case_timeline_created_at ON case_timeline(created_at DESC);

INSERT OR IGNORE INTO insurer_partners (id, name, contact_email, appetite_profile, service_level_hours, active, payload, created_at, updated_at)
VALUES
  ('partner-default-mri', 'Partenaire MRI a configurer', '', 'multirisque immeuble, copropriete, SCI, syndic', 48, 1, '{"setup":"contact_email_required_before_send"}', datetime('now'), datetime('now')),
  ('partner-default-pno', 'Partenaire PNO CNO a configurer', '', 'PNO, CNO, lots copropriete, logements vacants', 48, 1, '{"setup":"contact_email_required_before_send"}', datetime('now'), datetime('now')),
  ('partner-default-complex', 'Partenaire risques complexes a configurer', '', 'sinistres, resiliation, refus assureur, travaux', 72, 1, '{"setup":"contact_email_required_before_send"}', datetime('now'), datetime('now'));

CREATE TABLE IF NOT EXISTS client_contracts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES brokerage_cases(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contract_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  insurer_name TEXT,
  policy_number TEXT,
  annual_premium_cents INTEGER NOT NULL DEFAULT 0,
  premium_frequency TEXT NOT NULL DEFAULT 'annual',
  next_payment_due_at TEXT,
  renewal_at TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  consent_profile TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_contracts_case_id ON client_contracts(case_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_lead_id ON client_contracts(lead_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_status ON client_contracts(status);
CREATE INDEX IF NOT EXISTS idx_client_contracts_renewal_at ON client_contracts(renewal_at);

CREATE TABLE IF NOT EXISTS contract_documents (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  required INTEGER NOT NULL DEFAULT 0,
  file_url TEXT,
  due_at TEXT,
  received_at TEXT,
  validated_at TEXT,
  notes TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(contract_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_contract_documents_contract_id ON contract_documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_status ON contract_documents(status);

CREATE TABLE IF NOT EXISTS contract_payment_schedule (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  installment_reference TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_url TEXT,
  paid_at TEXT,
  notes TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(contract_id, installment_reference)
);

CREATE INDEX IF NOT EXISTS idx_contract_payment_schedule_contract_id ON contract_payment_schedule(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_payment_schedule_due_at ON contract_payment_schedule(due_at);
CREATE INDEX IF NOT EXISTS idx_contract_payment_schedule_status ON contract_payment_schedule(status);

CREATE TABLE IF NOT EXISTS client_assets (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  label TEXT NOT NULL,
  address TEXT,
  units_count TEXT,
  occupancy TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(contract_id, label)
);

CREATE INDEX IF NOT EXISTS idx_client_assets_contract_id ON client_assets(contract_id);

CREATE TABLE IF NOT EXISTS contract_service_requests (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'standard',
  subject TEXT NOT NULL,
  message TEXT,
  due_at TEXT,
  human_review_required INTEGER NOT NULL DEFAULT 1,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_service_requests_contract_id ON contract_service_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_service_requests_status ON contract_service_requests(status);
CREATE INDEX IF NOT EXISTS idx_contract_service_requests_due_at ON contract_service_requests(due_at);

CREATE TABLE IF NOT EXISTS contract_consent_events (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  status TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'client_portal',
  proof_text TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_consent_events_contract_id ON contract_consent_events(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_consent_events_type ON contract_consent_events(consent_type);

CREATE TABLE IF NOT EXISTS contract_referrals (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  filleul_name TEXT,
  filleul_email TEXT,
  filleul_phone TEXT,
  status TEXT NOT NULL DEFAULT 'draft_review',
  reward_type TEXT NOT NULL DEFAULT 'low_cost_partner_reward',
  reward_label TEXT NOT NULL DEFAULT 'Avantage parrainage a confirmer',
  explicit_permission INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_referrals_contract_id ON contract_referrals(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_referrals_code ON contract_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_contract_referrals_status ON contract_referrals(status);
CREATE TABLE IF NOT EXISTS case_mail_inbox (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES brokerage_cases(id) ON DELETE SET NULL,
  mailbox TEXT NOT NULL,
  message_uid TEXT NOT NULL,
  message_id TEXT,
  sender TEXT,
  recipients TEXT,
  subject TEXT,
  sent_at TEXT,
  matched_reference TEXT,
  status TEXT NOT NULL DEFAULT 'received_pending_review',
  payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(mailbox, message_uid),
  UNIQUE(message_id)
);

CREATE INDEX IF NOT EXISTS idx_case_mail_inbox_case_id ON case_mail_inbox(case_id);
CREATE INDEX IF NOT EXISTS idx_case_mail_inbox_status ON case_mail_inbox(status);
CREATE INDEX IF NOT EXISTS idx_case_mail_inbox_sent_at ON case_mail_inbox(sent_at);
CREATE TABLE IF NOT EXISTS admin_profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'commercial',
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_email ON admin_profiles(email);
CREATE INDEX IF NOT EXISTS idx_admin_profiles_active ON admin_profiles(active);