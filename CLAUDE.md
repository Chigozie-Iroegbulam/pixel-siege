# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Pixel Siege is a browser-based top-down retro shooter: HTML5 canvas and vanilla JS, with no build step
and no dependencies. Live at https://chigozie-iroegbulam.github.io/pixel-siege/ (GitHub Pages from
`main`, root). Every push to `main` redeploys it. README.md has the controls and tuning knobs.

## Required: commit and push your work to GitHub as you go

The point is to never lose work or the current state of the project. Every working version must be
saved in Git and on GitHub so it's easy to go back to.

- **Commit while you work, not just at the end.** Each time you finish a logical piece of work (a
  feature, a fix, a tuning pass, a docs change), syntax-check it, commit it, and push it before
  starting the next piece. Don't wait for the user to ask.
- **Never finish a task or end a session with uncommitted or unpushed changes.** Before reporting
  that you're done, run `git status -sb`. It must show a clean tree with `main...origin/main` and
  nothing ahead. If a push fails, say so and fix it. Don't report work as saved until it has been
  pushed.
- **Clean commit messages:**
  - An imperative summary line of 60 characters or fewer, e.g. "Add shotgun power-up" or "Fix
    spitter firing while off-screen".
  - A blank line, then a short body explaining what changed and why when that isn't obvious.
  - One logical change per commit. Don't lump unrelated changes together, and don't make vague
    "updates" or "WIP" commits.
- **Only commit working code.** Each commit should leave the game runnable, so any commit is safe to
  go back to.
- **Undo with `git revert`, never by rewriting history.** No force-pushes, no `reset --hard` on
  pushed commits, no amending pushed commits.
- Remote: `origin` → `Chigozie-Iroegbulam/pixel-siege` (public), branch `main`. Pushing to `main`
  also updates the live game.

## Commands

- **Run:** `open index.html`. It must keep working from `file://`, so no ES modules and no `fetch`.
- **Jump to a level:** `index.html?level=N` (1–6). `?level=6` is the boss.
- **Syntax check (Node is not installed; use macOS JavaScriptCore):**
  ```
  for f in *.js; do /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -e "checkSyntax('$f')" || echo "FAIL $f"; done
  ```
- **Headless playtest:** there is no test suite. To verify behavior, write a throwaway harness HTML
  in the scratchpad (never in the repo). It loads the game scripts by absolute `file://` path in the
  same order as `index.html`, then drives the game directly:
  - Start a run: `Game.newWorld(i); Game.state = 'PLAYING'`
  - Steer it by setting `Input.keys`, `Input.mouse.{x,y,down,clicked}`, or `Input.pressed`
  - Step it with `Game.update(STEP)` in a loop
  - Optional god mode: `Game.player.takeHit = () => false`
  - Write results into a `<pre>`, then run:
  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
    --allow-file-access-from-files --dump-dom file:///path/to/harness.html
  ```
  For visuals, use `--window-size=W,H --screenshot=out.png` and draw `Game.buf` (after `Game.render()`)
  onto a larger canvas. To exercise audio code, call `Sound._create()` and add
  `--autoplay-policy=no-user-gesture-required`.

## Architecture

**Globals and load order.** Every file defines globals and is loaded with a plain `<script>` tag. The
order in `index.html` matters: `sprites.js` → `input.js` → `audio.js` → `entities.js` → `levels.js` →
`game.js`. `game.js` calls `Game.init()` and starts the `requestAnimationFrame` loop as soon as it
loads. A new file needs its own tag, placed before the files that use it.

**Rendering.** The whole game draws onto a 320×240 offscreen buffer (`Game.buf` / `Game.bctx`), which
is then scaled up by a whole number onto the visible canvas with smoothing off. All game coordinates
are buffer pixels. `Input` converts mouse positions into buffer pixels. Positions are rounded when
drawn so pixels stay crisp. Text uses the 3×5 bitmap font: `drawText` in `sprites.js`, uppercase only,
and missing glyphs render as `?`. Add a glyph to `FONT` before using a new character.

**Loop and input timing.** Updates run at a fixed 60 Hz (`STEP`), with rendering once per animation
frame. `Game.update` switches on `Game.state` (MENU, PLAYING, PAUSED, LEVEL_COMPLETE, GAME_OVER,
VICTORY) and ends every step with `Input.endStep()`. That call clears the one-shot flags
`Input.pressed` and `Input.mouse.clicked`, so read them only inside an update step. Use
`Input.isDown` for keys that are held. `Game.render` switches on the same states to draw overlays.

**Entities ↔ Game.** Player, Enemy, Bullet, EnemyBullet, Particle and FloatText all share one shape:
`update(dt, game)`, `draw(ctx)` and a `dead` flag. `Game.updateWorld` updates each list, handles all
collisions using circle radii, then filters out dead entities. Entities never remove themselves. They
call back into `Game`: `addShake`, `spawnSparks`, `spawnBurst`, pushing to `game.particles` or
`game.enemyBullets`, `onEnemyKilled`, `onPlayerDeath`. Actors are y-sorted before drawing.

**Sprites.** Art is text grids plus palettes in `sprites.js`. `makeSprite` turns rows into offscreen
canvases once, inside `buildSprites()`. `makeAnimSet` also produces white silhouette frames (`flash`)
for hit flashes. Rows can differ in length (they are padded), but keep frames of one animation the
same size.

**Adding an enemy type** takes changes in three files:
1. `sprites.js`: add the frames, a palette in `ENEMY_PALETTES`, and register the type in
   `Sprites.enemies` inside `buildSprites`.
2. `entities.js`: add an `ENEMY_TYPES` entry. Its `ai` value selects a branch in `Enemy.update`
   (`chase`, `zigzag`, `keepAway`, `boss`); `rotate` draws the sprite pointing up and turns it to
   face its motion. Write a new branch if none fits.
3. `levels.js`: give the type a weight in some level's `mix`.

**Levels.** `LEVELS` in `levels.js` is pure data. `Game.setupLevel(i)` rebuilds the floor from
`FLOOR_THEMES[theme]` along with the `stains` canvas, where kill splats are painted permanently,
and resets per-level counters. A level ends in `finishLevel()` once `levelKills >= kills`, or once
the boss dies if the level has `boss` set. After that it goes to `levelComplete()`, or to
`victory()` on the last level. Spawning (`updateSpawning`) picks off-screen edge points and is
capped by `maxAlive`.

**Audio.** `Sound.play(name)` in `audio.js` synthesizes every effect with Web Audio; there are no
files. It does nothing until the first click or keypress creates the AudioContext, and while muted.
Add a new sound as a `case` in `Sound.play`.

**Persistence.** `localStorage` keys are `pixelSiege.best` and `pixelSiege.muted`. Every access is
wrapped in try/catch.
