# Credits — Zombie Parkour Escape (空中回廊 追跡)

Made by jirisuke0121. The in-game list (home screen → クレジット / Credits) is generated from this file by hand: keep both in step.

## Software

| What | License | Where |
|---|---|---|
| three.js | MIT (notice kept in the bundled copy inside `index.html` / `canyon.html`) | rendering |

## 3D models

| What | Source | License / note |
|---|---|---|
| `assets/*-meshy-low.glb` (HG, MG, SMG, SG, knife, ladder, zipline trolley, hook launcher, grapple anchor, smoke grenade), `assets/glove-meshy-fitted.glb` | Generated with Meshy | Free plan = CC BY 4.0 (credit required), paid plan = owned. **The credit line "Models created with Meshy – CC BY 4.0 License" is always shown**, so it is correct on either plan. |
| `assets/human-gunrun*.glb`, `assets/human-first-person-hands.glb`, `assets/zombie-gunrun-*.glb` | Converted from the Unity Asset Store pack "Apocalypse (pack)" (`Character_Apocalypse`) through the author's Unity project GunRun | Unity Asset Store license. The Asset Store page of the pack must say "Standard" EULA (or its own EULA must allow this use) — see "Open checks". |

## Sound

| What | Source | License |
|---|---|---|
| `assets/sfx/hg*.wav`, `mg*.wav`, `sg*.wav`, `smg*.wav` (gunshots) | The Free Firearm Sound Library (Ben Jaszczak and others), OpenGameArt.org, unprocessed (`tools/build_sfx_takes.py`) | CC0 |
| `assets/sfx/bite/*` | See `assets/sfx/bite/CREDITS.md` (RPG / Zombies / Swishes Sound Packs by artisticdude, Squish Sounds by EZduzziteh, 80 CC0 creature SFX by rubberduck, Punch and vocal sounds by qubodup) | CC0 |
| `assets/sfx/voice/*` | See `assets/sfx/voice/CREDITS.md` (adds Breathing Tired by mikeask, Fantozzi's Footsteps, 100 CC0 metal and wood SFX by rubberduck, 50 RPG sound effects by Kenney, and other CC0 uploads) | CC0 |
| `assets/sfx/easy-weapons/explosion_4.wav` | Easy Weapons, Unity Asset Store | Unity Asset Store license — see "Open checks" |
| `assets/sfx/gunrun-headshot.mp3`, `assets/combat-feedback/*.wav` | From the author's Unity project GunRun (`Resources/GunRunAudio`) | Origin to be confirmed — see "Open checks" |

## Images and font

| What | Source | License |
|---|---|---|
| `assets/combat-feedback/feedback-medium.woff` | Noto Sans JP Medium, subset | SIL Open Font License 1.1 (`assets/combat-feedback/FONT-LICENSE.txt`) |
| `assets/challenge-score/*.webp`, `assets/combat-feedback/*.png`, `assets/minimap-rim.png`, `assets/lobby/*.svg` | The author's Unity project GunRun (UI art) and the author's own drawings | Origin of the Unity UI art to be confirmed — see "Open checks" |

## Open checks (not yet verified — owner to confirm before the Y8 upload)

1. **Meshy plan.** Which plan made the models? Either way the credit line is shown; if it was a paid plan the credit is optional.
2. **Unity Asset Store items** ("Apocalypse (pack)", Easy Weapons): open each Asset Store page and check that it carries the standard Asset Store EULA (no "Non-standard" label). Under the standard EULA an asset may be used when it is embedded in a game; a browser game ships its files in a form players can download, which the EULA does not address directly, so a publisher with its own terms should be read separately.
3. **GunRun UI art and `Resources/GunRunAudio` sounds** (Hit, Kill, DamageArrival, Medal, Milestone, Bonus, headshot): confirm who made them or which license they came with, and add it here.
4. Zombie voice from the Unity project is intentionally **not** shipped until its terms are confirmed (README, 2026-10-25).

Rule for new material: CC0 only (CC-BY-SA is excluded because its share-alike terms would reach the whole game). Add the source here in the same change.
