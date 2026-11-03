# Pixel Siege

A small top-down retro shooter that runs in the browser. There's nothing to
install and no build step.

## Play

**Play online:** https://chigozie-iroegbulam.github.io/pixel-siege/

Or run it locally: open `index.html` in any modern browser. Tip: `index.html?level=6` jumps
straight to a level (1–6).

| Action | Control |
|---|---|
| Move | Arrow keys / WASD |
| Aim | Mouse |
| Shoot | Left click (hold for auto-fire) |
| Pause | Esc / P (Q quits to the menu while paused) |
| Mute | M |

**On a phone or tablet:** drag your left thumb to move and your right thumb to aim and shoot. The
gun fires while the right stick is pushed. Each stick appears wherever your thumb lands. The button
in the top-right corner pauses the game and has the sound and quit options. Turn your phone
sideways for the biggest view.

Clear 5 levels by hitting each level's kill target, then defeat the Overlord in
level 6. Clearing a level gives a score bonus and restores one heart. Your best
score is saved in the browser.

## Files

| File | What it does |
|---|---|
| `index.html` | page + canvas |
| `sprites.js` | pixel-art sprites (text grids), 3x5 bitmap font, floor generator |
| `input.js` | keyboard + mouse |
| `touch.js` | on-screen twin-stick touch controls, pause button |
| `audio.js` | synthesized sound effects (Web Audio) |
| `entities.js` | player, enemy types and AI, bullets, particles |
| `levels.js` | level list: kill targets, spawn rates, enemy mix, floor theme |
| `game.js` | game loop, states, collisions, HUD, menu and end screens |

## Tweaking

- **Difficulty:** edit `LEVELS` in `levels.js` (kills, `spawnEvery`, `maxAlive`, `mix`).
- **Enemy stats:** edit `ENEMY_TYPES` in `entities.js` (hp, speed, damage, score).
- **Player:** `speed`, `fireRate` and `maxHp` are in the `Player` constructor in `entities.js`.
- **Art:** sprites are text grids in `sprites.js`. Each character is a palette color.
