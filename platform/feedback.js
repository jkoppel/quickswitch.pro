// A small "Feedback" link on home, menu, results and progress. Text plus enough context to act on it.
window.ST = window.ST || {};

ST.feedback = (function () {
  const { $ } = ST.ui;

  function open() {
    ST.ui.openSheet('Feedback', `
      <p class="desc">What would make this trainer better, or what is broken? It goes straight to the developer.</p>
      <textarea id="fb-text" rows="5" maxlength="4000" aria-label="Your feedback" placeholder="The Dodge bot feels too easy at…"></textarea>
      <div class="row tight"><button class="primary small" data-act="send" type="button">Send</button></div>`,
    { onAction: async (act, b) => {
      if (act !== 'send') return;
      const text = $('fb-text').value.trim();
      if (text.length < 3) { ST.ui.sheetNote('Write a few words first.', true); return; }
      b.disabled = true;
      const lastRun = ST.history.all().slice(-1)[0];
      try {
        await ST.api.post('/api/feedback', { text, context: {
          route: location.pathname + location.search, screen: ST.app && ST.app.current(),
          lastRunKey: lastRun ? lastRun.key : null, userAgent: navigator.userAgent.slice(0, 300),
          viewport: `${innerWidth}x${innerHeight}`,
        } });
        ST.events.track('feedback_sent', { length: text.length });
        ST.ui.closeSheet();
        ST.ui.toast('Thanks. Sent.');
      } catch (e) { ST.ui.sheetNote('Could not send. Try again in a moment.', true); b.disabled = false; }
    } });
  }

  function start() {
    // The results and menu screens are the game's; add a link there rather than editing their markup.
    const resultsRow = document.querySelector('#results .row');
    if (resultsRow) resultsRow.insertAdjacentHTML('afterbegin', '<button class="ghost feedback-link hidden" type="button">Feedback</button>');
    const menuFoot = document.querySelector('#menu .foot');
    if (menuFoot) menuFoot.insertAdjacentHTML('beforeend', '<button class="link feedback-link hidden" type="button">Feedback</button>');
    document.addEventListener('click', (e) => { if (e.target.closest('.feedback-link')) open(); });
    ST.api.ready.then((h) => { if (h) for (const el of document.querySelectorAll('.feedback-link')) el.classList.remove('hidden'); });
  }

  return { start, open };
})();
