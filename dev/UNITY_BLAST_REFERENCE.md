# Canyon blast reference from Unity GunRun

Reviewed on 2026-10-24 against the saved Unity integration project at
`2026-10-07/gu/work/integration-20261007/unity-project`. No Unity Editor with
Pipeline was available for a live play session, so the Unity findings below
come from source and prefab inspection.

| Unity source | Behavior and presentation observed in saved assets | Canyon adaptation |
| --- | --- | --- |
| `Assets/Resources/SGPrototypeExplosion.prefab` | `Flame Burst 1`, `Smoking Ball`, `Dust 1`, `Smoking Debris`, an `Explosion Light`, a roughly 2-second stereo clip, and camera shake | Short flash, irregular flame tongues, shock ring, dust, embers, light pulse where supported, and a 1.9-second generated sound |
| `Assets/Easy Weapons/Scripts/Explosion.cs` | Radius and line-of-sight checks, distance-based damage, camera vibration, impulse on visible rigidbodies | Keep the canyon's local damage zone and camera shake; add solid-wall occlusion for enemies and player launch |
| `Assets/ShotgunPrototype/ShotgunDismemberment.cs` | Near survivors can be knocked down; corpses and body parts receive impulse; recovery follows | Preserve the existing web zombie launch/flail reaction and return to neutral pose; do not add detached limbs to the whitebox |
| `Assets/Script/NationalMatch/InfectionLaunch.cs` | Self blast combines outward and upward motion | Add a measured horizontal shove while retaining the canyon's upward escape and middle-deck landing |

The Unity prefab's licensed audio and particle assets were not copied into the
web repository. The web effect is procedural. It is intentionally shorter and
lighter than Unity's effect because it can happen during a fast escape.

Verification for this change: load both local canyon pages, shoot a barrel,
confirm audio starts, nearby zombies react, the player can steer onto the
middle deck without self-damage, the reaction settles, and the barrels reset.
An isolated wall case confirms that an enemy behind a solid is not hit.
Screenshots at impact, dust and tail phases were also inspected. This does not
establish subjective sound quality or a live Unity-to-web visual match.

The follow-up interaction adds a 0.55 m step and 1.4 m cap above each canyon
barrel, with a visible aim ring and contextual hint. Standing on the cap and
shooting down triggers a stronger nearby camera and screen impact. Both local
pages and both barrels passed the full step, jump, top shot, launch, middle
deck landing, and reset flow in automated Chromium. A browser click also
reached the game's trigger and detonated a barrel. This is still not a human
playtest or a live Unity comparison.
