export function layoutShiftDiagnostics(audits) {
  function rows(details) {
    if (!Array.isArray(details?.items)) return [];
    if (details.type === 'list') return details.items.flatMap(rows);
    return details.items.filter(item => item.node?.type !== 'text' && Number(item.score) > 0);
  }
  // Lighthouse 13 replaces the flat audit with a list of per-cluster tables.
  const modern = rows(audits?.['cls-culprits-insight']?.details);
  const shifts = modern.length ? modern : rows(audits?.['layout-shifts']?.details);
  return shifts.sort((a, b) => b.score - a.score).slice(0, 5).map(item => ({
    score: item.score,
    node: item.node?.snippet || item.node?.selector || '',
    causes: (item.subItems?.items || []).map(cause => cause.cause || cause.extra?.value || '').filter(Boolean)
  }));
}
