# Easy Weapons dev trial

- The development home screens at `dev/index.html` and `dev/canyon.html` offer the complete 8 weapon set from the local Easy Weapons package: Pistol, Shotgun, M4, Rail Gun, Beam Gun, Cluster Bomb Launcher, Rocket Launcher, and M79 Grenade Launcher. Existing Air Corridor weapons remain selectable.
- Weapon view models are converted GLBs in `dev/assets/`. The FBX/prefab sources stay in the Unity project. The models include downscaled diffuse and normal textures.
- Fire sounds are matched to each Unity prefab's `fireSound` reference. The same package's reload sound is used for the Easy Weapons entries. Package sounds are copied under `dev/assets/sfx/easy-weapons/`; files include the sounds folder's clips for the development trial.
- The current prototype combat API is hitscan. Magazine size, cadence, reload time, and fire mode are adapted from the package prefabs; shotgun spread and launcher damage are approximated with the existing cone/raycast hit path. Unity projectile prefabs and their impact simulation are not ported.
- Source package: `Assets/Easy Weapons` in the local Unity project. This is a dev-only static web trial; its GLB and audio files can be fetched by the browser. Check target-specific redistribution requirements before release.
