const fields = ['premiumA', 'deductibleA', 'premiumB', 'deductibleB', 'loss'];
const labels = { premiumA: 'la cotisation du devis A', deductibleA: 'la franchise du devis A', premiumB: 'la cotisation du devis B', deductibleB: 'la franchise du devis B', loss: 'le montant du sinistre garanti' };
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export function parseEuroCents(value) {
  const text = String(value ?? '').trim().replace(/[\s\u202f]+/g, '').replace(/€$/, '');
  const match = text.length <= 32 && text.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!match) throw new RangeError('invalid-euro-amount');
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 10_000_000_000) throw new RangeError('amount-out-of-range');
  return cents;
}

export function compareQuoteCosts(values) {
  const amounts = {};
  for (const field of fields) {
    try { amounts[field] = parseEuroCents(values[field]); }
    catch (error) { error.field = field; throw error; }
  }
  const retainedA = Math.min(amounts.loss, amounts.deductibleA);
  const retainedB = Math.min(amounts.loss, amounts.deductibleB);
  return { ...amounts, retainedA, retainedB, totalA: amounts.premiumA + retainedA, totalB: amounts.premiumB + retainedB };
}

function bindComparison() {
  const root = document.querySelector('[data-quote-comparison]');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  const inputs = Object.fromEntries(fields.map(field => [field, root.querySelector(`[data-comparison-field="${field}"]`)]));
  const errorBox = root.querySelector('[data-comparison-error]');
  const output = root.querySelector('[data-comparison-output]');
  const status = root.querySelector('[data-comparison-status]');
  const clearError = () => {
    errorBox.hidden = true;
    for (const input of Object.values(inputs)) input.removeAttribute('aria-invalid');
  };
  root.querySelector('[data-comparison-run]').addEventListener('click', () => {
    clearError();
    try {
      const result = compareQuoteCosts(Object.fromEntries(fields.map(field => [field, inputs[field].value])));
      for (const field of ['premiumA', 'premiumB', 'retainedA', 'retainedB', 'totalA', 'totalB']) {
        root.querySelector(`[data-comparison-result="${field}"]`).textContent = euros.format(result[field] / 100);
      }
      output.hidden = false;
      status.textContent = `Scénario avec un sinistre garanti de ${euros.format(result.loss / 100)} : cotisation et part du sinistre, ${euros.format(result.totalA / 100)} pour le devis A et ${euros.format(result.totalB / 100)} pour le devis B.`;
    } catch (error) {
      output.hidden = true;
      status.textContent = '';
      errorBox.textContent = `Vérifiez ${labels[error.field] || 'les montants'} : saisissez un montant de 0 à 100 000 000 €, avec au plus deux décimales, par exemple 1 200,50.`;
      errorBox.hidden = false;
      inputs[error.field]?.setAttribute('aria-invalid', 'true');
      inputs[error.field]?.focus({ preventScroll: true });
      inputs[error.field]?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  });
  root.querySelector('[data-comparison-clear]').addEventListener('click', () => {
    for (const input of Object.values(inputs)) input.value = '';
    clearError();
    output.hidden = true;
    status.textContent = 'Montants effacés.';
  });
  root.querySelectorAll('[data-comparison-run], [data-comparison-clear]').forEach(button => { button.disabled = false; });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindComparison, { once: true });
  else bindComparison();
}
