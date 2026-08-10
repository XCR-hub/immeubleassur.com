const grid = document.querySelector(".editorial-watch-band .watch-grid");

if (grid) {
  refreshLiveEditorialWatch(grid);
}

async function refreshLiveEditorialWatch(target) {
  try {
    const response = await fetch("/assets/editorial-autopilot-latest.json", {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return;
    const report = await response.json();
    const allowedHosts = new Set([
      "www.service-public.fr",
      "entreprendre.service-public.fr",
      "acpr.banque-france.fr",
      "www.anil.org",
      "www.franceassureurs.fr",
      "www.legifrance.gouv.fr"
    ]);
    const items = Array.isArray(report.public_watch_items) ? report.public_watch_items.slice(0, 18) : [];
    const cards = [];
    for (const item of items) {
      let url;
      try { url = new URL(String(item.url || "")); } catch { continue; }
      if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) continue;
      const title = String(item.title || "").trim();
      if (title.length < 20) continue;
      cards.push(createCard(item, url, title));
    }
    if (!cards.length) return;
    target.replaceChildren(...cards);
    target.dataset.liveEditorial = "true";
    target.setAttribute("aria-live", "polite");
  } catch {
    // Le contenu statique sourcé reste visible si le rapport est indisponible.
  }
}

function createCard(item, url, title) {
  const card = document.createElement("article");
  card.className = "watch-card";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow dark";
  eyebrow.textContent = `${String(item.source_name || "Source officielle")} - ${String(item.topic || "veille")}`;
  const heading = document.createElement("h3");
  const link = document.createElement("a");
  link.href = url.href;
  link.rel = "nofollow noopener";
  link.textContent = title;
  heading.append(link);
  const detail = document.createElement("p");
  detail.textContent = item.published_at
    ? `Signal public daté du ${String(item.published_at)}. Consultez la source avant toute décision contractuelle.`
    : "Signal public récent. Consultez la source avant toute décision contractuelle.";
  const score = document.createElement("span");
  score.textContent = `Score pertinence ${Math.max(0, Math.min(100, Number(item.relevance_score) || 0))}/100`;
  card.append(eyebrow, heading, detail, score);
  return card;
}
