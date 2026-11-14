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
    // One landing per page load, wherever it lands: the home page, or a guide's link to a drill.
    // `ref` tags a link we post (quickswitch.pro/?ref=discord): Discord's app sends no referrer.
    const land = (q) => {
      if (landed) return;
      landed = true;
      ST.events.track('landing', { referrer: document.referrer ? new URL(document.referrer).host : null, ref: (q.get('ref') || '').slice(0, 40) || null, path: location.pathname });
    };
    const R = ST.router;
    R.on('/', (_, q) => {
      if (q.has('drills')) { app.openPicker(); return; }
      ST.home.render();
      app.show('home');
      land(q);
    });
    R.on('/play/:id', ({ id }, q) => {
      if (app.running()) return;
      if (ST.ROUTINES.some(r => r.id === id)) { app.openPicker('routine', id); land(q); }
      else R.go('/', { replace: true });
    });
    // /drill/<id>: the picker open on one drill, one press from playing it. The guides link here,
    // and a gun page adds ?gun=<id> to hand you that gun.
    R.on('/drill/:id', ({ id }, q) => {
      if (app.running()) return;
      if (!ST.MODES.some(m => m.id === id)) { R.go('/', { replace: true }); return; }
      // ?gun= and ?perk= come from the gun and perk guides. A link that names either sets both,
      // so a gun page's link doesn't inherit the perk from your last run.
      const gun = q.get('gun'), perk = q.get('perk');
      const overrides = {};
      if (gun && ST.WEAPONS[gun]) overrides.weapon = gun;
      if (perk && ST.PERKS[perk]) overrides.perk = perk;
      if (Object.keys(overrides).length && !overrides.perk) overrides.perk = '';
      app.openPicker('mode', id, Object.keys(overrides).length ? overrides : undefined);
      land(q);
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
