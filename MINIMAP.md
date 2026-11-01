# Unity-style circular radar with existing score HUD

Both maps have a circular, player-centred radar with a 20m radius. Forward stays
at the top; the terrain and enemy markers rotate with the player heading. This
matches the circular mask, camera parent and framing of the
saved Unity player prefab: orthographic size 20 and a square 256px target.
The white self chevron has a cyan halo, like NationalMapMarker.cs. Enemies are
red circles, with up/down triangles where elevations differ. The ring reuses
the saved Unity MiniMapWindow texture. Terrain and zombies behind walls and on
other floors are visible inside the circle. Distant enemies are omitted, not pinned to its edge.
The optional paused full map stays north-up and shows the whole stage and all enemies. Circles mean
similar elevation; up/down triangles mean more than 2m above/below the player.
Corpses disappear. Spawning, stunned and climbing enemies remain visible.

Click/tap the map or press M to pause and open the full map. Choose a 4m height
band, or follow the player's current height. Closing the map, including Escape,
keeps the game paused. Resume is explicit. Pause settings include a persistent
minimap on/off switch and a full-map button. Japanese and English are supported.

## Score compatibility

The previous HUD proposal hid `unityScoreHud` and added a hand-written time/total
replacement; that made the score display appear to regress. That replacement is
removed. The original minimap-only integration was based on PR #105 commit
`5eebb49` and did not change its scoring rules. The subsequent v11 integration
uses the newer result layout and the time-based scoring contract described below.
The timer, kills and total are the actual score components, without replacements.

## Rendering and integration

- Read the final runtime collision boxes, not the canyon design coordinate file
  and not the merged render meshes. Preserve the map's aspect ratio.
- Bake separate 2D terrain images for the height bands once during extension
  startup, before Start is enabled. This is an overview of terrain footprints,
  not a route planner or a guarantee that a jump can reach a surface.
- Use a separate transparent canvas for player/enemy markers, at most 20Hz.
  Copy/rotate the nearby image from the baked atlas when the player moves, turns or changes height
  bands. The view stays centred at stage edges, with empty out-of-stage areas.
  No terrain geometry is regenerated while following the player. Ordinary jumps retain
  the takeoff band; ladders, ledges, grapples and landings can change the band.
- Closed doors are dynamic overlays; opening a door does not leave a stale wall
  baked into the map. Stair flights, slopes and ziplines are orange.
- No extra Three.js scene/camera/render target, navigation search, raycast,
  network request or telemetry field is added. Hidden/off maps skip marker work.
- The small map belongs to the logical game viewport. The modal belongs to the
  upright physical viewport. Both portrait rotations avoid the menu; touch ammo
  moves away from the map only while the minimap is visible.
- `skyMinimap.snapshot()` exposes geometry/cache and marker counters and sampled
  handler CPU time for local QA. These are not GPU or whole-game frame timings.

## Verification

`node bench/minimap.test.cjs` checks coordinate projection, aspect ratio, immutable
geometry, height bands and complete live enemy lifecycle. Existing startup and
shared-score tests should also pass.

Run `node bench/minimap-review-server.cjs`, then open the printed localhost URL.
The review fixture injects a deterministic seed and simulated pointer media
queries before game startup, holds the game's normal animation loop, and blocks
external record/telemetry posts. It runs both actual maps on desktop, landscape
touch and both portrait rotations, checking the 40m local range, centre following (also at stage edges), enemy movement/death, heading rotation, circular mask, score/rate preservation, elevation,
terrain caching, off state, pause/resume/restart and HUD overlap.

The performance button compares six alternating on/off fixed-input blocks per
map using real movement, AI, animation and rendering. The first 60 frames of
each 180-frame block are excluded. Timing depends on browser refresh rate, so
the blocks do not necessarily last three wall-clock seconds. Preserve all
blocks and report frame-time spread; do not interpret small differences as a
causal FPS gain. It is not physical iPhone, sustained thermal or human-play QA.

`bench/minimap-browser.cjs` runs the functional fixture in CI and saves its JSON
and screenshot. The `Minimap terrain and nearby enemies` workflow runs this check.

The v11 scoring integration uses survival-score.js and removes the obsolete threat HUD. The timer, kills, total and full result breakdown remain visible.
