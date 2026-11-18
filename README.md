# Neon Bay — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Rifai20388/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Rifai20388/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Built for make.fun's **Make GTA 6** bounty (gta6-01): a complete
open-world crime game that runs entirely in the browser. Neon Bay is a
sun-soaked coastal city — drive its avenues, walk its streets, steal
cars, take jobs, and stay ahead of the police.

## The story

Jax Marlow is back in town, and Lena Voss has jobs that pay. Run three
missions for her — **The Getaway** ($150), **Package Run** ($300) and
**Lay Low** ($500) — while the city's wanted system keeps score. Every
stolen car and every shot raises your heat; lay low and the stars fade,
get caught and you lose 15% of your cash.

## How to play

Open `game/index.html` in a desktop browser, or serve the `game/`
folder with any static file server. The game needs no network at all:
three.js is vendored under `game/vendor/`, every texture is painted on
canvas, and every sound is synthesized live with WebAudio.

| Key | Does what |
| --- | --- |
| WASD | Move on foot / drive |
| Mouse | Look around |
| E | Steal a car / step out of one |
| Space | Jump / handbrake |
| F or click | Shoot the pistol |
| R | Reset your car |
| P | Pause |
| M | Mute |

The HUD shows health, cash, wanted stars, your current objective and
speed, plus a north-up minimap with roads, the beach, the mission
marker, traffic and flashing police cruisers. Progress saves to
localStorage, so you can pick up where you left off.

## Build this entry

```
MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into the output folder and
writes `dossier.json` using the kit's `buildDossier`.

## What's inside

- `game/src/city.js` — the procedural city: road grid, buildings, the beach, Bay Tower
- `game/src/player.js` — Jax on foot
- `game/src/vehicles.js` — arcade car physics and the chase camera
- `game/src/traffic.js` — AI cars and pedestrians on the streets
- `game/src/police.js` — wanted level, heat, and the cruisers that chase you
- `game/src/missions.js` — Lena's three jobs, beacons and dialogue
- `game/src/combat.js` — the pistol, tracers and muzzle flash
- `game/src/hud.js` — HUD, minimap, subtitles and prompts
- `game/src/audio.js` — engine hum, sirens and gunshots, all synthesized
- `game/src/save.js` — saving and loading
- `game/src/shots.js` — the four staged screenshot scenes
- `game/src/main.js` — the game loop, camera, modes and wiring
