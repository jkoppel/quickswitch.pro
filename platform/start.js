// Wires the platform layer onto the game: screens, routes, account, sync. main.js calls start(app)
// once the game's own menu is ready.
window.ST = window.ST || {};

function takeSignInOutcome() {
  const q = new URLSearchParams(location.search);
  const outcome = q.get('signin');
  if (!outcome) return null;
  q.delete('signin');
  const rest = q.toString();
  try { history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (e) { /* ignore */ }
  return outcome;
}

function reportSignIn(outcome) {
  if (outcome === 'discord') {
    if (ST.account.isMember()) ST.ui.toast('Signed in with Discord.');
    return;
  }
  if (outcome === 'discord-cancelled') { ST.ui.toast('Discord sign-in cancelled.'); return; }
  const why = outcome === 'discord-unavailable' ? 'Discord sign-in isn’t available right now. Email works.' : 'Discord sign-in didn’t go through. Try again, or use email.';
  ST.account.openSheet();
  ST.ui.sheetNote(why, true);
}

ST.platform = {
  start(app) {
    const { $ } = ST.ui;
    app.registerScreen('home', $('home'), { backdrop: true });
    app.registerScreen('profile', $('profile'), { backdrop: true });
    app.registerScreen('challenge', $('challenge'), { backdrop: true });

    // The picker gets a way back to the landing view.
    document.querySelector('#menu .session').insertAdjacentHTML('afterbegin', '<button id="btn-home" class="ghost small" type="button">Home</button>');
    $('btn-home').addEventListener('click', () => ST.router.go('/'));

    ST.sync.start();
    ST.onboarding.start(app);
    ST.home.start(app);
    ST.resultsHeadline.start(app);
    ST.challenge.start(app);
    ST.profile.start(app);
    ST.feedback.start();

    app.on('home', () => ST.router.go('/'));
    app.on('sequence-start', (seq) => { if (seq.routine) ST.router.set('/play/' + seq.routine.id); });
    app.on('results', () => ST.router.set('/results', { replace: true }));
    // The test screens are summaries of state the home screen also shows: a reload lands on home.
    app.on('screen', (name) => { if (name === 'aimtest' || name === 'plan') ST.router.set('/', { replace: true }); });

    let landed = false;
    const R = ST.router;
    R.on('/', (_, q) => {
      if (q.has('drills')) { app.openPicker(); return; }
      ST.home.render();
      app.show('home');
      // `ref` tags a link we post (quickswitch.pro/?ref=discord): Discord's app sends no referrer.
      if (!landed) { landed = true; ST.events.track('landing', { referrer: document.referrer ? new URL(document.referrer).host : null, ref: (q.get('ref') || '').slice(0, 40) || null }); }
    });
    R.on('/play/:id', ({ id }) => {
      if (app.running()) return;
      if (ST.ROUTINES.some(r => r.id === id)) app.openPicker('routine', id);
      else R.go('/', { replace: true });
    });
    R.on('/results', () => { if (app.lastSequence()) app.show('results'); else R.go('/', { replace: true }); });
    R.on('/profile', () => ST.profile.show(app));
    R.on('/u/:handle', ({ handle }) => ST.profile.show(app, handle));
    R.on('/c/:id', ({ id }) => ST.challenge.landing(id, app));
    // Back during a drill pauses it rather than tearing the canvas down.
    R.setGuard(() => { if (app.running()) { app.pause(); return true; } return false; });

    // Discord sends the browser back with ?signin=<outcome>; say what happened and drop the parameter.
    const signin = takeSignInOutcome();
    R.start();
    ST.account.init().then(() => {
      if (app.current() === 'home') ST.home.render();
      else if (app.current() === 'profile' && R.path() === '/profile') ST.profile.show(app);
      if (signin) reportSignIn(signin);
    });
  },
};
