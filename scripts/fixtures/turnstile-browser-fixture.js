// Served only by Puppeteer's intercepted localhost preview requests. This file
// is outside public/ and is never loaded by a production page.
(() => {
  const widgets = new Map();
  let sequence = 0;
  let released = false;
  const resolve = target => typeof target === 'string' ? widgets.get(target) : [...widgets.values()].find(widget => widget.target === target);
  const issue = widget => {
    widget.token = `local-turnstile-fixture-${widget.id}`;
    widget.options.callback?.(widget.token);
  };
  window.__localTurnstileFixture = {
    release() { released = true; widgets.forEach(issue); },
    get rendered() { return widgets.size; }
  };
  window.turnstile = {
    render(target, options) {
      if (location.hostname !== '127.0.0.1' || options.sitekey !== '1x00000000000000000000AA') throw new Error('Turnstile fixture is restricted to localhost and the test key.');
      const id = `widget-${++sequence}`;
      const widget = { id, target, options, token: '' };
      widgets.set(id, widget);
      if (released) issue(widget);
      return id;
    },
    getResponse(target) { return resolve(target)?.token || ''; },
    reset(target) {
      const widget = resolve(target);
      if (!widget) return;
      widget.token = '';
      if (released) issue(widget);
    }
  };
})();
