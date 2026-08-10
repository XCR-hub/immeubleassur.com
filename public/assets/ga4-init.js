function initializeGa4() {
  const measurementId = document.querySelector('meta[name="ia-ga4-measurement-id"]')?.content || "";
  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });
}

initializeGa4();