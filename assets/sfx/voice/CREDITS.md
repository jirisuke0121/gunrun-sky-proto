# Voice / impact / zombie step / reload / town / breathing sounds — sources

All takes were cut from the CC0 (public domain dedication) packs below, found on OpenGameArt.org. The licence shown on
each page was read on 2026-11-04. CC0 needs no credit; this list is kept for traceability.
Rebuild with `python3 tools/build_voice_sfx.py SRC_ROOT assets/sfx/voice` (mono 44.1 kHz, 3 ms fade-in, fade-out,
band-limited, normalised, 64 kbps MP3; the SRC_ROOT layout is described at the top of that script).

The source file for each take was chosen from length, attack and pitch measurements, **not by ear**. If one sounds
wrong in play, change the number in `tools/build_voice_sfx.py` and rebuild.

| take | source file(s) | pack (author) | page |
|---|---|---|---|
| jump-1 / 2 / 3 / 4 | `slightscream-01 / 02 / 12 / 03.flac` (short efforts) | 15 vocal male strain/hurt/pain/jump sounds (qubodup) | https://opengameart.org/content/15-vocal-male-strainhurtpainjump-sounds |
| land-1 / 2 | `slightscream-08 / 13.flac` | same | same |
| hurt-1 / 2 / 3 | `slightscream-05 / 10 / 15.flac` (longer, lower) | same | same |
| zdie-1 … 5 | `zombie-17 / 18 / 21 / 19 / 20.wav` (long, falling) | Zombies Sound Pack (artisticdude) | https://opengameart.org/content/zombies-sound-pack |
| zhit-1 … 5 | `zombie-5 / 6 / 13 / 24 / 22.wav` (short, sharp) | same | same |
| zgroan-1 … 4 | `zombie-2 / 8 / 14 / 23.wav` | same | same |
| zalert-1 … 3 | `zombie-9 / 10 / 12.wav` (bright) | same | same |
| zroar | `zombie-16.wav` (longest, lowest) | same | same |
| flesh-1 … 3 | `squish_01_0 / 03 / 04.mp3` + a synthesized 95 Hz thump (0.14 s) | Squish Sounds Effects (EZduzziteh) | https://opengameart.org/content/squish-sounds-effects |
| imp-1 … 5 | `metal_hit_01 … 05.ogg` (first 0.22 s) | 100 CC0 metal and wood SFX (rubberduck) | https://opengameart.org/content/100-cc0-metal-and-wood-sfx |
| impw-1 … 3 | `wood_hit_01 … 03.ogg` (first 0.2 s) | same | same |
| breath | `breathing tired.wav` (3.1 s) | Breathing Tired (mikeask) | https://opengameart.org/content/breathing-tired |
| zstep-1 … 6 | `Fantozzi-SandL1 R1 L2 R2 L3 R3.ogg` slowed to 0.72x + `squish_01_0 / 03 / 04.mp3` under each step | Fantozzi's Footsteps (Grass/Sand & Stone) (Fantozzi); Squish Sounds Effects (EZduzziteh) | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone , https://opengameart.org/content/squish-sounds-effects |
| reload-1 | `reload.wav` (three events cut out and joined, 1.1 s) | Handgun Reload Sound Effect | https://opengameart.org/content/handgun-reload-sound-effect |
| click-1 | `gun_reload_lock_or_click_sound.mp3` (first 0.12 s) | Gun reload, lock or click sound | https://opengameart.org/content/gun-reload-lock-or-click-sound |
| siren-1 | `siren_0.mp3` (3.5 s – 7.0 s) | Sirens and Alarm Noise | https://opengameart.org/content/sirens-and-alarm-noise |
| crow-1 / 2 | `Crows.ogg` (5.5 – 7.5 s, 0 – 2 s) | Crows singing | https://opengameart.org/content/crows-singing |
| creak-1 … 3 | `creak1 / 2 / 3.ogg` | 50 RPG sound effects (Kenney) | https://opengameart.org/content/50-rpg-sound-effects |

Total size of the fifty-three takes: about 314 KB.

Not used on purpose: packs under CC-BY-SA (share-alike would reach the rest of the game's assets).
