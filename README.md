# Quickswitch

A browser aim trainer for [survev.io](https://survev.io). Play it at **https://quickswitch.pro**.

Other aim trainers drill 3D mouselook. survev asks for something else: a top-down view, an
absolute mouse cursor, shooting while you strafe with WASD, and bullets that take time to arrive,
so you have to lead a moving target. Quickswitch drills exactly that, using survev's own numbers
for guns, bullets, spread and weapon switching.

Quickswitch is a fan project. It isn't affiliated with survev.io, Kongregate or surviv.io.

## Play

Open https://quickswitch.pro and take the 30-second aim test, or skip straight to the drills.
You don't need an account. Sign in with an email code or Discord to keep your streak and history
across devices and to challenge friends.

## Run it yourself

There's no build step. Serve the folder and open it:

```
python3 -m http.server 8000    # then open http://localhost:8000
```

That gives you the whole trainer as a guest, with history saved in your browser. Accounts,
streaks, challenges and boards need the backend; `CONTRIBUTING.md` explains how to run it.

## Learn more

- `docs/TRAINING.md`: the routines and drills, how enemies move and aim, controls, and what you
  see after a run.
- `docs/FIDELITY.md`: which survev rules the trainer reproduces, checked line by line against
  survev's source.
- `CONTRIBUTING.md`: running the backend, tests, and which license covers which files.
- `demo/quickswitch-demo.mp4`: a simulated player running the Benchmark and several drills.

## License

The trainer is GPL-3.0, like survev. The accounts and progress layer (`platform/`, `api/`, `lib/`,
`db/`) is MIT. The sprites and sounds in `vendor/survev/` belong to their owners.
