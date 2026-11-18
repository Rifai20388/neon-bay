# Neon Bay

An open-world crime game for make.fun's **Make GTA 6** bounty (gta6-01).
Jax Marlow is back in Neon Bay, a sun-soaked coastal city, and Lena Voss
has work for him: steal cars, run packages, and outrun the cops.

## Play

Open `game/index.html` in a desktop browser (or serve `game/` with any
static server). Everything runs offline — three.js is vendored under
`game/vendor/`, all textures are drawn on canvas, all sound is synthesized
with WebAudio.

- **WASD** — move / drive · **Mouse** — look
- **E** — steal / leave a car · **Space** — jump / handbrake
- **F or click** — shoot · **R** — reset car · **P** — pause · **M** — mute

Three jobs pay out: The Getaway ($150), Package Run ($300), Lay Low ($500).
Wanted stars bring police cruisers; hide to cool off, or get busted and
lose 15% of your cash.

## Build the entry

```
MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into the output directory and writes
`dossier.json` with the kit's `buildDossier`.

## Layout

- `game/src/city.js` — the procedural city (roads, buildings, beach, tower)
- `game/src/player.js` — Jax on foot · `game/src/vehicles.js` — car physics
- `game/src/traffic.js` — AI cars and pedestrians
- `game/src/police.js` — wanted level and cruisers
- `game/src/missions.js` — Lena's three jobs
- `game/src/combat.js` — the pistol · `game/src/hud.js` — HUD and minimap
- `game/src/audio.js` — synthesized sound · `game/src/save.js` — saves
- `game/src/shots.js` — the four staged screenshot scenes
- `game/src/main.js` — the loop, camera, modes and wiring
