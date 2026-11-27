const fullForm = document.querySelector('#lead-form');
const callbackForm = document.querySelector('[data-instant-callback-source="quote-inline-callback"]');

if (fullForm && callbackForm) {
  const fields = ['phone', 'email'].map(name => fullForm.elements[name]).filter(Boolean);
  const copiedValues = new Map();
  const nativeEdits = new WeakSet();

  for (const field of fields) {
    for (const type of ['input', 'change']) {
      field.addEventListener(type, event => {
        if (event.isTrusted) nativeEdits.add(field);
      });
    }
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href="#lead-form"], a.diagnostic-cta');
    if (!link || !event.isTrusted || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (link.hasAttribute('download') || (link.target && link.target.toLowerCase() !== '_self')) return;
    if (fullForm.dataset.received === '1' || fullForm.dataset.submitting === '1' || fullForm.getAttribute('aria-busy') === 'true') return;

    const contact = String(callbackForm.elements.contact?.value || '').trim();
    const isEmail = contact.includes('@');
    if (isEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact)) return;
    } else {
      const digits = contact.replace(/\D/g, '').length;
      if (!/^\+?[\d\s().-]+$/.test(contact) || digits < 9 || digits > 15) return;
    }
    const values = isEmail ? { phone: '', email: contact.toLowerCase() } : { phone: contact, email: '' };
    const changed = [];
    for (const field of fields) {
      if (nativeEdits.has(field)) continue;
      const value = values[field.name];
      const ownValue = copiedValues.has(field) && field.value === copiedValues.get(field);
      // Existing input stays authoritative. Only our unchanged copies can be cleared.
      if ((!ownValue && field.value.trim()) || (!value && !ownValue) || field.value === value) continue;
      field.value = value;
      copiedValues.set(field, value);
      changed.push(field);
    }
    for (const field of changed) {
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { capture: true });
}
