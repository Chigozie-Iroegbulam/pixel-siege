// levels.js — level definitions.
//
// kills       kills needed to clear the level (ignored on boss levels)
// spawnEvery  [start, end] seconds between spawns; gets faster as you progress
// maxAlive    cap on enemies on screen at once (boss not counted)
// mix         relative weights for which enemy type spawns
// theme       index into FLOOR_THEMES
// boss        enemy type of the boss; the level ends when it dies

const LEVELS = [
  {
    name: 'THE OUTSKIRTS', kills: 15, spawnEvery: [1.6, 1.0], maxAlive: 8,
    mix: { grunt: 1 }, theme: 0,
  },
  {
    name: 'BUG NEST', kills: 22, spawnEvery: [1.4, 0.8], maxAlive: 10,
    mix: { grunt: 3, runner: 2 }, theme: 1,
  },
  {
    name: 'HEAVY METAL', kills: 26, spawnEvery: [1.4, 0.8], maxAlive: 12,
    mix: { grunt: 3, runner: 2, tank: 1 }, theme: 2,
  },
  {
    name: 'EYES EVERYWHERE', kills: 30, spawnEvery: [1.3, 0.75], maxAlive: 13,
    mix: { grunt: 3, runner: 2, tank: 1, spitter: 2 }, theme: 3,
  },
  {
    name: 'THE SWARM', kills: 45, spawnEvery: [0.9, 0.45], maxAlive: 18,
    mix: { grunt: 3, runner: 3, tank: 2, spitter: 2 }, theme: 4,
  },
  {
    name: 'THE OVERLORD', boss: 'boss', spawnEvery: [3.2, 1.8], maxAlive: 6,
    mix: { grunt: 2, runner: 1 }, theme: 5,
  },
];

function pickWeighted(mix) {
  const entries = Object.entries(mix);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = Math.random() * total;
  for (const [type, w] of entries) {
    r -= w;
    if (r <= 0) return type;
  }
  return entries[0][0];
}
