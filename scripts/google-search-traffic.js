export async function collectSearchTraffic({ fetcher = fetch, headers, siteUrl, startDate, endDate }) {
  const base = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl);
  const response = await fetcher(base + '/searchAnalytics/query', { method: 'POST', headers,
    body: JSON.stringify({ startDate, endDate, dimensions: [], aggregationType: 'byProperty' }) });
  if (!response.ok) return { status: 'failed', http_status: response.status, start_date: startDate, end_date: endDate };
  const data = await response.json();
  const row = data.rows?.[0];
  const clicks = Number(row?.clicks || 0), impressions = Number(row?.impressions || 0);
  return { status: impressions > 0 ? 'measured' : 'zero-traffic', http_status: response.status,
    start_date: startDate, end_date: endDate, clicks, impressions, ctr: Number(row?.ctr || 0),
    position: impressions > 0 ? Number(row?.position || 0) : null };
}

export async function readSubmittedSitemap({ fetcher = fetch, headers, siteUrl, sitemapUrl }) {
  const response = await fetcher('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl) + '/sitemaps', { headers });
  if (!response.ok) return { status: 'failed', http_status: response.status };
  const data = await response.json();
  const sitemap = (data.sitemap || []).find(item => item.path === sitemapUrl);
  if (!sitemap) return { status: 'not-submitted', http_status: response.status, sitemapUrl };
  return { status: 'submitted', http_status: response.status, sitemapUrl, last_downloaded: sitemap.lastDownloaded || '',
    pending: Boolean(sitemap.isPending), errors: Number(sitemap.errors || 0), warnings: Number(sitemap.warnings || 0) };
}
