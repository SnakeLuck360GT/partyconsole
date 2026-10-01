# PartyConsole shared 3D asset library

All models are self-contained **binary glTF (.glb)**. Textures are embedded, with no external files and no Draco or Meshopt compression, so a plain `GLTFLoader` is all you need. Each one was load-tested in three.js r186 and checked visually. Machine-readable data is in `assets/shared/catalog.json`, which lists path, category, group, size, bounding-box min, animations, materials, tint hints, triangle count, bytes, license and source for every file. Contact sheets are in `assets/shared/preview-<category>.jpg`, and credits are in `CREDITS.md`.

Every model is **CC0** except three: `props/sports/soccer-ball.glb` and `props/sports/soccer-goal.glb` are **CC-BY 3.0 (Poly by Google)**, so they need the attribution line from CREDITS.md in the game credits.

## Usage notes (read me first)

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const gltf = await new GLTFLoader().loadAsync('/assets/shared/characters/monsters/cactoro.glb');
// Clone skinned characters with SkeletonUtils.clone(gltf.scene). A plain .clone() breaks the skeleton.
const model = SkeletonUtils.clone(gltf.scene);
const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Idle')).play();
```

* **Units and up axis:** all models use Y-up. Size columns give the model's bounding box in its own units (w=X, h=Y, d=Z). For animated models it is measured in the idle pose. Most models sit on y=0. Quaternius flying critters (space-enemy-*, armabee, goleling) float above y=0.
* **Facing:** characters face **+Z** (the glTF default). Kenney `car-kit` vehicles and karts also point **+Z** (front wheels at +Z). Their wheels are separate nodes named `wheel-front-left`, `wheel-front-right`, `wheel-back-left` and `wheel-back-right`, so you can spin them. Kart nodes also include a `character` node for the driver.
* **Recommended scale for a ~1.8-unit-tall hero** (`model.scale.setScalar(k)`):
  | group | native height | k for 1.8 tall |
  |---|---|---|
  | characters/people (Quaternius humans) | ~1.85 | 1.0 |
  | characters/monsters (Quaternius Ultimate Monsters) | 2.5–3.8 | ~0.55 (use one factor for the whole set so relative sizes stay) |
  | characters/adventurers (KayKit) | ~2.4 (mage 3.0 incl. hat) | 0.75 |
  | characters/robot/robot-expressive | 4.8 | 0.37 |
  | characters/blocky (Kenney) | 2.7 | 0.67 |
  | characters/mini (Kenney) | ~0.75 | 2.4 |
  | characters/aliens (Kenney "oo" aliens) | 0.91 | 2.0 |
  | characters/astronauts, mechs, critters/platformer-hero, panda/rabbit-chef (Quaternius) | 3.0–4.0 | ~0.5 |
* **Kart scale:** karts are about 1.0×1.33×1.43 and the Kenney aliens are 0.91 tall. Scale both by the same factor. The karts already contain a matching alien driver.
* **Animation clip names** are the plain names in each row. Prefixes such as `CharacterArmature|` were stripped. Clips were resampled, and constant rest-pose tracks were removed. This has no visual effect, and cross-fading still works.
* **Player tinting:**
  * Quaternius characters use flat-colour materials. Tint the material in the *tint* column (for example `Cactoro_Main`, `Main`), and **clone the material first** because it is shared between clones: `m = m.clone(); m.color.set(playerColor)`.
  * Kenney (`colormap`) and KayKit (atlas) models use a single palette texture. To tint them, multiply `material.color` for a whole-body tint, or add a coloured ring or outline under the player. Use lerped colours (≈0.5–0.7 strength) because a full multiply darkens the model.
  * Kenney `oo` aliens and karts come in five built-in colours (oobi = purple, oodi = pink, ooli = yellow, oopi = teal, oozi = beige/black visor). KayKit mini-game and platformer props also come in red, blue and yellow (plus green for platforms).
* **Characters that look good together:**
  1. **Party roster (recommended):** the 8 `monsters/*` all share one skeleton and one clip set: Idle, Walk, Run, Jump, Jump_Idle, Jump_Land, Punch, Wave, Weapon, Duck, HitReact, Death, Yes, No.
  2. **Kenney mini people** (12) plus **blocky** (11) plus **aliens** (5). These three sets share the same Kenney clip naming (idle, walk, sprint, jump, die, emote-yes…) and suit karts.
  3. **KayKit adventurers** (4) for fantasy or fighting games.
  4. **Quaternius people** (5) are more realistic in proportion, so don't mix them with the chibi sets.
* **KayKit adventurers** carry weapon meshes on the hand bones: Knight has `1H_Sword` and `Round_Shield`, Barbarian has `1H_Axe` and `Barbarian_Round_Shield`, Mage has `2H_Staff`, and Rogue has `Knife`. Hide them with `model.getObjectByName('1H_Sword').visible = false`. You can attach your own props to the `handslot.r` / `handslot.l` bones. The Knight's `Knight_Helmet` and the capes are separate meshes.
* **Kenney Racing Kit track pieces** (`track/*`) sit on a **1-unit grid**, but **the origin is not at the tile centre**. Every piece shares the same pivot offset: its footprint starts at x = −0.35 and ends at z = −0.65, and extends toward +X and −Z. For example, `road-straight` covers x∈[−0.35, 0.65] and z∈[−1.65, −0.65], and `road-straight-long` is 1×2. The simplest way to handle this is to put each piece in a `Group` and offset the mesh by −(min + size/2) on X and Z, using `min` and `size` from catalog.json. Then place and rotate the group on your grid. Corners come in 1×1 (small), 2×2 (large) and 3×3 (larger), each with matching `-border` (red/white kerb) and `-wall` pieces. Material colours were converted from sRGB to linear on import, which fixes the washed-out look of the original Kenney exports.
* **Minigolf** (`golf/*`) tiles are 1×1, centred on the origin, with the top surface at y≈0.147. The ball is 0.07 in diameter. The `windmill.glb` blades are a separate node named `blades` that you can spin.
* **Kenney Platformer Kit** blocks are centred, with `block-grass` 1×1×1 and `-large` 2×2. The KayKit mini-game `tile-*` and KayKit `platform-WxDxH` pieces are named by grid size.
* **Racing-kit formula cars** (`vehicles/formula-*`) are small (0.73 wide) and also have an off-centre origin. Car-kit cars are about 1.3–1.5 wide.
* **Tanks** (`vehicles/tank-a|b`) are large (about 17 units long) and **point their barrel toward −X**. Use `rotation.y = Math.PI/2` to face +Z, and scale by about 0.15. `Tank_Turret` and `Tank_Gun` are rigid sibling mesh nodes. To aim, call `turret.attach(gun)` once and then rotate the turret around Y. The body and treads are skinned, and the clips only animate the treads. Their clips animate the treads: Tank_Forward, Tank_Backwards, Tank_TurningLeft and Tank_TurningRight.
* Kenney textures are small palette atlases and look best with the default filtering. All materials are `MeshStandardMaterial`, so add a hemisphere or ambient light plus a directional light, or an environment map. With only a directional light, the shadowed sides look very dark.

## Characters (animated)

Preview: `assets/shared/preview-characters.jpg`

### characters/adventurers — KayKit Adventurers 1.0 (Kay Lousberg, CC0, <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/adventurers/barbarian.glb` | KayKit chibi barbarian (hat, cape; 1H_Axe + Barbarian_Round_Shield nodes) | 1.70×2.37×1.65 | 1H_Melee_Attack_Chop, 1H_Ranged_Shoot, 2H_Melee_Attack_Spin, Block, Cheer, Death_A, Death_A_Pose, Dodge_Forward, Hit_A, Idle, Interact, Jump_Full_Short, Jump_Idle, Jump_Land, Jump_Start, PickUp, Running_A, Running_B, Running_Strafe_Left, Running_Strafe_Right, Sit_Floor_Idle, Spellcast_Shoot, Throw, Unarmed_Idle, Unarmed_Melee_Attack_Kick, Unarmed_Melee_Attack_Punch_A, Walking_A, Walking_B, Walking_Backwards | texture atlas: multiply material.color | 2091K |
| `assets/shared/characters/adventurers/knight.glb` | KayKit chibi knight (helmet, cape; 1H_Sword + Round_Shield nodes) | 1.74×2.43×2.10 | 1H_Melee_Attack_Chop, 1H_Ranged_Shoot, 2H_Melee_Attack_Spin, Block, Cheer, Death_A, Death_A_Pose, Dodge_Forward, Hit_A, Idle, Interact, Jump_Full_Short, Jump_Idle, Jump_Land, Jump_Start, PickUp, Running_A, Running_B, Running_Strafe_Left, Running_Strafe_Right, Sit_Floor_Idle, Spellcast_Shoot, Throw, Unarmed_Idle, Unarmed_Melee_Attack_Kick, Unarmed_Melee_Attack_Punch_A, Walking_A, Walking_B, Walking_Backwards | texture atlas: multiply material.color | 2109K |
| `assets/shared/characters/adventurers/mage.glb` | KayKit chibi mage (hat, cape; 2H_Staff node) | 2.15×2.97×2.69 | 1H_Melee_Attack_Chop, 1H_Ranged_Shoot, 2H_Melee_Attack_Spin, Block, Cheer, Death_A, Death_A_Pose, Dodge_Forward, Hit_A, Idle, Interact, Jump_Full_Short, Jump_Idle, Jump_Land, Jump_Start, PickUp, Running_A, Running_B, Running_Strafe_Left, Running_Strafe_Right, Sit_Floor_Idle, Spellcast_Shoot, Throw, Unarmed_Idle, Unarmed_Melee_Attack_Kick, Unarmed_Melee_Attack_Punch_A, Walking_A, Walking_B, Walking_Backwards | texture atlas: multiply material.color | 2080K |
| `assets/shared/characters/adventurers/rogue-hooded.glb` | KayKit chibi hooded rogue (cape; Knife node) | 1.39×2.22×1.66 | 1H_Melee_Attack_Chop, 1H_Ranged_Shoot, 2H_Melee_Attack_Spin, Block, Cheer, Death_A, Death_A_Pose, Dodge_Forward, Hit_A, Idle, Interact, Jump_Full_Short, Jump_Idle, Jump_Land, Jump_Start, PickUp, Running_A, Running_B, Running_Strafe_Left, Running_Strafe_Right, Sit_Floor_Idle, Spellcast_Shoot, Throw, Unarmed_Idle, Unarmed_Melee_Attack_Kick, Unarmed_Melee_Attack_Punch_A, Walking_A, Walking_B, Walking_Backwards | texture atlas: multiply material.color | 2046K |

### characters/aliens — Kenney Platformer Kit (Kenney, CC0, <https://kenney.nl/assets/platformer-kit>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/aliens/alien-oobi.glb` | Kenney astronaut alien "oobi" (same aliens as kart-oobi) | 0.82×0.91×0.63 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left | colormap/texture: multiply material.color | 154K |
| `assets/shared/characters/aliens/alien-oodi.glb` | Kenney astronaut alien "oodi" (same aliens as kart-oodi) | 0.82×0.91×0.63 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left | colormap/texture: multiply material.color | 130K |
| `assets/shared/characters/aliens/alien-ooli.glb` | Kenney astronaut alien "ooli" (same aliens as kart-ooli) | 0.82×0.91×0.63 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left | colormap/texture: multiply material.color | 133K |
| `assets/shared/characters/aliens/alien-oopi.glb` | Kenney astronaut alien "oopi" (same aliens as kart-oopi) | 0.82×0.91×0.63 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left | colormap/texture: multiply material.color | 136K |
| `assets/shared/characters/aliens/alien-oozi.glb` | Kenney astronaut alien "oozi" (same aliens as kart-oozi) | 0.82×0.91×0.63 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left | colormap/texture: multiply material.color | 142K |

### characters/astronauts — Ultimate Space Kit (Quaternius, CC0, <https://quaternius.com/packs/ultimatespacekit.html>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/astronauts/astronaut-bee.glb` | Chibi astronaut (bee) | 3.37×3.12×1.06 | Death, Duck, HitReact, Idle, Idle_Gun, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Run_Gun, Run_Gun_Shoot, Walk, Walk_Gun, Wave, Weapon, Yes | texture atlas: multiply material.color | 605K |
| `assets/shared/characters/astronauts/astronaut-flamingo.glb` | Chibi astronaut (flamingo) | 3.37×3.14×1.10 | Death, Duck, HitReact, Idle, Idle_Gun, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Run_Gun, Run_Gun_Shoot, Walk, Walk_Gun, Wave, Weapon, Yes | texture atlas: multiply material.color | 556K |
| `assets/shared/characters/astronauts/astronaut-frog.glb` | Chibi astronaut (frog) | 3.37×3.00×1.45 | Death, Duck, HitReact, Idle, Idle_Gun, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Run_Gun, Run_Gun_Shoot, Walk, Walk_Gun, Wave, Weapon, Yes | texture atlas: multiply material.color | 585K |
| `assets/shared/characters/astronauts/astronaut-red-panda.glb` | Chibi astronaut (red-panda) | 3.37×3.25×1.21 | Death, Duck, HitReact, Idle, Idle_Gun, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Run_Gun, Run_Gun_Shoot, Walk, Walk_Gun, Wave, Weapon, Yes | texture atlas: multiply material.color | 566K |

### characters/blocky — Kenney Blocky Characters (Kenney, CC0, <https://kenney.nl/assets/blocky-characters>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/blocky/blocky-b.glb` | Kenney blocky character b | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 58K |
| `assets/shared/characters/blocky/blocky-c.glb` | Kenney blocky character c | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 56K |
| `assets/shared/characters/blocky/blocky-d.glb` | Kenney blocky character d | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 56K |
| `assets/shared/characters/blocky/blocky-e.glb` | Kenney blocky character e | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 57K |
| `assets/shared/characters/blocky/blocky-f.glb` | Kenney blocky character f | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 59K |
| `assets/shared/characters/blocky/blocky-g.glb` | Kenney blocky character g | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 59K |
| `assets/shared/characters/blocky/blocky-j.glb` | Kenney blocky character j | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 60K |
| `assets/shared/characters/blocky/blocky-l.glb` | Kenney blocky character l | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 65K |
| `assets/shared/characters/blocky/blocky-n.glb` | Kenney blocky character n | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 59K |
| `assets/shared/characters/blocky/blocky-o.glb` | Kenney blocky character o | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 64K |
| `assets/shared/characters/blocky/blocky-r.glb` | Kenney blocky character r | 1.60×2.73×1.03 | idle, walk, sprint, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 57K |

### characters/critters — Ultimate Monsters (via Poly Pizza) (Quaternius, CC0, <https://quaternius.com/packs/ultimatemonsters.html>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/critters/armabee.glb` | Small monster / enemy (armabee) | 3.58×2.32×1.38 | Death, Fast_Flying, Flying_Idle, Headbutt, HitReact, No, Punch, Yes | Armabee_Main | 121K |
| `assets/shared/characters/critters/bee.glb` | Platformer enemy (Bee) | 2.79×1.89×1.50 | Bite_Front, Death, Flying, HitRecieve | Main | 148K |
| `assets/shared/characters/critters/birb.glb` | Small monster / enemy (birb) | 2.79×2.65×2.76 | Bite_Front, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes | Birb_Main | 142K |
| `assets/shared/characters/critters/crab.glb` | Platformer enemy (Crab) | 2.54×1.53×1.39 | Bite_Front, Bite_InPlace, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes | Main | 162K |
| `assets/shared/characters/critters/goleling.glb` | Small monster / enemy (goleling) | 3.81×3.07×1.84 | Death, Fast_Flying, Flying_Idle, Headbutt, HitReact, No, Punch, Yes | Goleling_Main | 255K |
| `assets/shared/characters/critters/green-blob.glb` | Small monster / enemy (green-blob) | 2.25×1.87×2.19 | Bite_Front, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes | Green_Main | 66K |
| `assets/shared/characters/critters/horned-blob.glb` | Platformer enemy (Enemy) | 1.99×1.70×1.38 | Bite_Front, Bite_InPlace, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes | Main | 108K |
| `assets/shared/characters/critters/mushnub.glb` | Small monster / enemy (mushnub) | 2.75×3.31×2.75 | Bite_Front, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes | MushroomKing_Main | 60K |
| `assets/shared/characters/critters/panda-chef.glb` | Chibi panda with headband, cooking clips (Chop/Pan/Assembly) | 3.46×3.19×1.99 | Assembly_End, Assembly_Loop, Assembly_Start, Chop_End, Chop_Loop, Chop_Start, Death, Duck, HitReact, Idle, Idle_Holding, Jump, Jump_Idle, Jump_Land, No, Pan_End, Pan_Loop, Pan_Start, Punch, Run, Run_Holding, Sitting_Eating, Sitting_End, Sitting_Idle, Sitting_Start, Sword, Walk, Walk_Holding, Wave, Yes | texture atlas: multiply material.color | 439K |
| `assets/shared/characters/critters/pigeon.glb` | Small monster / enemy (pigeon) | 2.35×1.81×2.01 | Bite_Front, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes | Pigeon_Main | 91K |
| `assets/shared/characters/critters/platformer-hero.glb` | Blue bunny-eared platformer hero (Main material = body colour) | 2.54×3.55×1.62 | Death, Duck, HitReact, Idle, Idle_Gun, Idle_Shoot, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Run_Gun, Run_Shoot, Walk, Walk_Gun, Wave, Yes | Main | 293K |
| `assets/shared/characters/critters/rabbit-chef.glb` | Chibi rabbit, cooking clips (Chop/Pan/Assembly) | 3.23×4.03×2.04 | Assembly_End, Assembly_Loop, Assembly_Start, Chop_End, Chop_Loop, Chop_Start, Death, Duck, HitReact, Idle, Idle_Holding, Jump, Jump_Idle, Jump_Land, No, Pan_End, Pan_Loop, Pan_Start, Punch, Run, Run_Holding, Sitting_Eating, Sitting_End, Sitting_Idle, Sitting_Start, Sword, Walk, Walk_Holding, Wave, Yes | texture atlas: multiply material.color | 421K |
| `assets/shared/characters/critters/skull.glb` | Platformer enemy (Skull) | 1.41×1.51×1.42 | Bite_Front, Bite_InPlace, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes | Main | 92K |
| `assets/shared/characters/critters/space-enemy-extra-small.glb` | Green alien space enemy (Enemy_ExtraSmall) | 0.92×1.68×0.93 | Death, Fast_Flying, Flying_Idle, Headbutt, HitReact, No, Punch, Yes | texture atlas: multiply material.color | 92K |
| `assets/shared/characters/critters/space-enemy-flying.glb` | Green alien space enemy (Enemy_Flying) | 1.26×3.74×1.24 | Death, Fast_Flying, Flying_Idle, Headbutt, HitReact, No, Punch, Yes | Glub_Main | 187K |
| `assets/shared/characters/critters/space-enemy-large.glb` | Green alien space enemy (Enemy_Large) | 3.09×3.69×1.33 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes | texture atlas: multiply material.color | 358K |
| `assets/shared/characters/critters/space-enemy-small.glb` | Green alien space enemy (Enemy_Small) | 1.25×2.35×1.50 | Death, Fast_Flying, Flying_Idle, Headbutt, HitReact, No, Punch, Yes | texture atlas: multiply material.color | 109K |

### characters/mechs — Ultimate Space Kit (Quaternius, CC0, <https://quaternius.com/packs/ultimatespacekit.html>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/mechs/mech-bee.glb` | Walking mech piloted by bee | 2.91×2.90×2.17 | Dance, Death, Hello, HitRecieve_1, HitRecieve_2, Idle, Jump, Jump_Landing, Jump_NoHeight, Kick, No, Pickup, Run, Shoot_Big, Shoot_Small, Walk, Yes | texture atlas: multiply material.color | 453K |
| `assets/shared/characters/mechs/mech-flamingo.glb` | Walking mech piloted by flamingo | 2.71×3.50×2.19 | Dance, Death, Hello, HitRecieve_1, HitRecieve_2, Idle, Jump, Jump_Landing, Jump_NoHeight, Kick, No, Pickup, Run, Shoot_Big, Shoot_Small, Walk, Yes | texture atlas: multiply material.color | 386K |
| `assets/shared/characters/mechs/mech-frog.glb` | Walking mech piloted by frog | 3.38×3.01×2.13 | Dance, Death, Hello, HitRecieve_1, HitRecieve_2, Idle, Jump, Jump_Landing, Jump_NoHeight, Kick, No, Pickup, Run, Shoot_Big, Shoot_Small, Walk, Yes | texture atlas: multiply material.color | 522K |
| `assets/shared/characters/mechs/mech-red-panda.glb` | Walking mech piloted by red-panda | 2.71×3.02×2.04 | Dance, Death, Hello, HitRecieve_1, HitRecieve_2, Idle, Jump, Jump_Landing, Jump_NoHeight, Kick, No, Pickup, Run, Shoot_Big, Shoot_Small, Walk, Yes | texture atlas: multiply material.color | 379K |

### characters/mini — Kenney Mini Characters (Kenney, CC0, <https://kenney.nl/assets/mini-characters>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/mini/female-a.glb` | Kenney mini female a | 1.00×0.76×0.52 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 156K |
| `assets/shared/characters/mini/female-b.glb` | Kenney mini female b | 0.72×0.71×0.44 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 141K |
| `assets/shared/characters/mini/female-c.glb` | Kenney mini female c | 0.72×0.76×0.52 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 141K |
| `assets/shared/characters/mini/female-d.glb` | Kenney mini female d | 0.72×0.76×0.52 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 146K |
| `assets/shared/characters/mini/female-e.glb` | Kenney mini female e | 0.72×0.71×0.53 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 139K |
| `assets/shared/characters/mini/female-f.glb` | Kenney mini female f | 0.72×0.69×0.43 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 147K |
| `assets/shared/characters/mini/male-a.glb` | Kenney mini male a | 0.72×0.68×0.37 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 138K |
| `assets/shared/characters/mini/male-b.glb` | Kenney mini male b | 0.72×0.67×0.43 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 138K |
| `assets/shared/characters/mini/male-c.glb` | Kenney mini male c | 0.72×0.80×0.48 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 149K |
| `assets/shared/characters/mini/male-d.glb` | Kenney mini male d | 0.72×0.74×0.37 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 137K |
| `assets/shared/characters/mini/male-e.glb` | Kenney mini male e | 0.72×0.69×0.38 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 135K |
| `assets/shared/characters/mini/male-f.glb` | Kenney mini male f | 0.72×0.68×0.37 | idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-sit, wheelchair-look-left, wheelchair-look-right, wheelchair-move-forward, wheelchair-move-back, wheelchair-move-left, wheelchair-move-right | colormap/texture: multiply material.color | 140K |

### characters/monsters — Ultimate Monsters (via Poly Pizza) (Quaternius, CC0, <https://quaternius.com/packs/ultimatemonsters.html>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/monsters/alien.glb` | Chunky cute biped monster (alien) | 3.05×3.39×1.57 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes | Alien_Main | 375K |
| `assets/shared/characters/monsters/blue-demon.glb` | Chunky cute biped monster (blue demon) | 2.98×2.68×1.96 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Run2, Walk, Wave, Weapon, Yes | BlueDemon_Main | 323K |
| `assets/shared/characters/monsters/cactoro.glb` | Chunky cute biped monster (cactoro) | 3.04×3.81×2.12 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes | Cactoro_Main | 358K |
| `assets/shared/characters/monsters/dino.glb` | Chunky cute biped monster (dino) | 3.05×3.08×1.93 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes | Dino_Main | 308K |
| `assets/shared/characters/monsters/frog.glb` | Chunky cute biped monster (frog) | 3.04×2.54×1.61 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes | Frog_Main | 289K |
| `assets/shared/characters/monsters/mushroom-king.glb` | Chunky cute biped monster (mushroom king) | 3.15×3.46×2.09 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes | MushroomKing_Main, Orc_Main | 333K |
| `assets/shared/characters/monsters/orc.glb` | Chunky cute biped monster (orc) | 3.05×3.05×1.80 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes | Orc_Main | 396K |
| `assets/shared/characters/monsters/yeti.glb` | Chunky cute biped monster (yeti) | 3.04×2.67×1.50 | Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes | Yeti_Main | 325K |

### characters/people — Ultimate Modular Characters (via Poly Pizza) (Quaternius, CC0, <https://quaternius.com/packs/ultimatemodularcharacters.html>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/people/adventurer.glb` | Stylized human (adventurer) | 0.60×1.83×0.72 | Death, Gun_Shoot, HitRecieve, HitRecieve_2, Idle, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Idle_Neutral, Idle_Sword, Interact, Kick_Left, Kick_Right, Punch_Left, Punch_Right, Roll, Run, Run_Back, Run_Left, Run_Right, Run_Shoot, Sword_Slash, Walk, Wave | — | 1400K |
| `assets/shared/characters/people/king.glb` | Stylized human (king) | 0.60×1.88×0.63 | Death, Gun_Shoot, HitRecieve, HitRecieve_2, Idle, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Idle_Neutral, Idle_Sword, Interact, Kick_Left, Kick_Right, Punch_Left, Punch_Right, Roll, Run, Run_Back, Run_Left, Run_Right, Run_Shoot, Sword_Slash, Walk, Wave | — | 1452K |
| `assets/shared/characters/people/punk-girl.glb` | Stylized human (punk girl) | 0.51×1.92×0.60 | Death, Gun_Shoot, HitRecieve, HitRecieve_2, Idle, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Idle_Neutral, Idle_Sword, Interact, Kick_Left, Kick_Right, Punch_Left, Punch_Right, Roll, Run, Run_Back, Run_Left, Run_Right, Run_Shoot, Sword_Slash, Walk, Wave | — | 984K |
| `assets/shared/characters/people/punk-guy.glb` | Stylized human (punk guy) | 0.60×1.94×0.64 | Death, Gun_Shoot, HitRecieve, HitRecieve_2, Idle, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Idle_Neutral, Idle_Sword, Interact, Kick_Left, Kick_Right, Punch_Left, Punch_Right, Roll, Run, Run_Back, Run_Left, Run_Right, Run_Shoot, Sword_Slash, Walk, Wave | — | 919K |
| `assets/shared/characters/people/woman-dress.glb` | Stylized human (woman dress) | 0.54×1.80×0.59 | Death, Gun_Shoot, HitRecieve, HitRecieve_2, Idle, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Idle_Neutral, Idle_Sword, Interact, Kick_Left, Kick_Right, Punch_Left, Punch_Right, Roll, Run, Run_Back, Run_Left, Run_Right, Run_Shoot, Sword_Slash, Walk, Wave | — | 999K |

### characters/robot — RobotExpressive (three.js examples) (Tomás Laulhé (modified by Don McCurdy), CC0, <https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/characters/robot/robot-expressive.glb` | Yellow cartoon robot, 14 clips incl. Dance/Wave/Punch/Death | 3.22×4.83×3.24 | Dance, Death, Idle, Jump, No, Punch, Running, Sitting, Standing, ThumbsUp, Walking, WalkJump, Wave, Yes | Main | 408K |


## Vehicles

Preview: `assets/shared/preview-vehicles.jpg`

### vehicles/cars — Kenney Car Kit (Kenney, CC0, <https://kenney.nl/assets/car-kit>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/vehicles/ambulance.glb` | Kenney car kit: ambulance | 1.50×1.80×3.25 | colormap | 112K |
| `assets/shared/vehicles/delivery.glb` | Kenney car kit: delivery | 1.50×1.65×3.25 | colormap | 117K |
| `assets/shared/vehicles/firetruck.glb` | Kenney car kit: firetruck | 1.50×1.70×3.40 | colormap | 112K |
| `assets/shared/vehicles/garbage-truck.glb` | Kenney car kit: garbage-truck | 1.60×1.60×3.45 | colormap | 136K |
| `assets/shared/vehicles/hatchback-sports.glb` | Kenney car kit: hatchback-sports | 1.30×1.10×2.85 | colormap | 102K |
| `assets/shared/vehicles/kart-oobi.glb` | Kenney car kit: kart-oobi | 0.97×1.33×1.43 | colormap | 139K |
| `assets/shared/vehicles/kart-oodi.glb` | Kenney car kit: kart-oodi | 0.97×1.33×1.43 | colormap | 125K |
| `assets/shared/vehicles/kart-ooli.glb` | Kenney car kit: kart-ooli | 0.97×1.33×1.43 | colormap | 126K |
| `assets/shared/vehicles/kart-oopi.glb` | Kenney car kit: kart-oopi | 0.97×1.33×1.43 | colormap | 128K |
| `assets/shared/vehicles/kart-oozi.glb` | Kenney car kit: kart-oozi | 0.97×1.33×1.43 | colormap | 131K |
| `assets/shared/vehicles/police.glb` | Kenney car kit: police | 1.50×1.30×3.10 | colormap | 99K |
| `assets/shared/vehicles/race-future.glb` | Kenney car kit: race-future | 1.20×0.83×2.66 | colormap | 84K |
| `assets/shared/vehicles/race.glb` | Kenney car kit: race | 1.30×0.73×2.56 | colormap | 80K |
| `assets/shared/vehicles/sedan-sports.glb` | Kenney car kit: sedan-sports | 1.30×1.10×2.55 | colormap | 89K |
| `assets/shared/vehicles/sedan.glb` | Kenney car kit: sedan | 1.50×1.30×2.55 | colormap | 85K |
| `assets/shared/vehicles/suv-luxury.glb` | Kenney car kit: suv-luxury | 1.50×1.30×2.85 | colormap | 88K |
| `assets/shared/vehicles/suv.glb` | Kenney car kit: suv | 1.50×1.30×2.70 | colormap | 103K |
| `assets/shared/vehicles/taxi.glb` | Kenney car kit: taxi | 1.50×1.50×2.75 | colormap | 86K |
| `assets/shared/vehicles/tractor.glb` | Kenney car kit: tractor | 1.34×1.60×2.20 | colormap | 130K |
| `assets/shared/vehicles/truck.glb` | Kenney car kit: truck | 1.50×1.30×2.95 | colormap | 88K |
| `assets/shared/vehicles/van.glb` | Kenney car kit: van | 1.50×1.35×2.75 | colormap | 88K |

### vehicles/formula — Kenney Racing Kit (Kenney, CC0, <https://kenney.nl/assets/racing-kit>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/vehicles/formula-green.glb` | Open-wheel race car (raceCarGreen) | 0.73×0.40×1.35 | carTire, grass, glass, grey | 81K |
| `assets/shared/vehicles/formula-orange.glb` | Open-wheel race car (raceCarOrange) | 0.73×0.40×1.35 | carTire, pylon, glass, grey | 81K |
| `assets/shared/vehicles/formula-red.glb` | Open-wheel race car (raceCarRed) | 0.73×0.40×1.35 | carTire, red, glass, grey | 81K |
| `assets/shared/vehicles/formula-white.glb` | Open-wheel race car (raceCarWhite) | 0.73×0.40×1.35 | carTire, grey, glass | 81K |

### vehicles/parts — Kenney Car Kit (Kenney, CC0, <https://kenney.nl/assets/car-kit>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/vehicles/parts/debris-tire.glb` | Loose debris-tire | 0.35×0.60×0.60 | colormap | 30K |
| `assets/shared/vehicles/parts/wheel-default.glb` | Loose wheel-default | 0.40×0.60×0.60 | colormap | 30K |
| `assets/shared/vehicles/parts/wheel-racing.glb` | Loose wheel-racing | 0.40×0.60×0.60 | colormap | 32K |

### vehicles/tanks — Animated Tanks (via Poly Pizza) (Quaternius, CC0, <https://quaternius.com/packs/animatedtanks.html>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/vehicles/tank-a.glb` | Tank with animated treads (tan) | 17.72×4.62×10.09 | Tank_Backwards, Tank_Forward, Tank_TurningLeft, Tank_TurningRight | Main | 806K |
| `assets/shared/vehicles/tank-b.glb` | Heavy tank with animated treads (brown) | 16.18×5.98×9.98 | Tank_Backwards, Tank_Forward, Tank_TurningLeft, Tank_TurningRight | Main | 989K |


## Racing track pieces

Preview: `assets/shared/preview-track.jpg`

### track/track — Kenney Racing Kit (Kenney, CC0, <https://kenney.nl/assets/racing-kit>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/track/banner-tower-green.glb` | Racing kit: bannerTowerGreen | 0.39×1.25×0.39 | _defaultMat, grey, grass | 26K |
| `assets/shared/track/banner-tower-red.glb` | Racing kit: bannerTowerRed | 0.39×1.25×0.39 | _defaultMat, grey, red | 26K |
| `assets/shared/track/barrier-red.glb` | Racing kit: barrierRed | 0.25×0.13×0.12 | red | 2K |
| `assets/shared/track/barrier-wall.glb` | Racing kit: barrierWall | 1.00×0.13×0.12 | grey, red | 4K |
| `assets/shared/track/barrier-white.glb` | Racing kit: barrierWhite | 0.25×0.13×0.12 | grey | 2K |
| `assets/shared/track/billboard.glb` | Racing kit: billboard | 1.00×1.00×0.48 | bark, road, tankco, grey | 13K |
| `assets/shared/track/box.glb` | Car kit prop: box | 0.71×0.71×0.71 | colormap | 22K |
| `assets/shared/track/cone-flat.glb` | Car kit prop: cone-flat | 0.48×0.28×0.48 | colormap | 23K |
| `assets/shared/track/cone.glb` | Car kit prop: cone | 0.48×0.59×0.48 | colormap | 23K |
| `assets/shared/track/fence-curved.glb` | Racing kit: fenceCurved | 1.00×0.82×0.32 | grey, net | 23K |
| `assets/shared/track/fence-straight.glb` | Racing kit: fenceStraight | 1.00×0.50×0.03 | grey, net | 7K |
| `assets/shared/track/flag-checkers-small.glb` | Racing kit: flagCheckersSmall | 0.19×0.30×0.04 | checkers, _defaultMat, grey, road | 10K |
| `assets/shared/track/flag-checkers.glb` | Racing kit: flagCheckers | 0.20×1.25×0.04 | checkers, _defaultMat, grey, road | 12K |
| `assets/shared/track/flag-green.glb` | Racing kit: flagGreen | 0.20×1.25×0.04 | grass, _defaultMat, grey, road | 13K |
| `assets/shared/track/flag-red.glb` | Racing kit: flagRed | 0.20×1.25×0.04 | red, _defaultMat, grey, road | 13K |
| `assets/shared/track/grand-stand-awning.glb` | Racing kit: grandStandAwning | 1.00×1.39×1.00 | grey, red, road | 16K |
| `assets/shared/track/grand-stand-covered.glb` | Racing kit: grandStandCovered | 1.00×1.19×1.02 | grey, _defaultMat, red, road, glass | 11K |
| `assets/shared/track/grand-stand.glb` | Racing kit: grandStand | 1.00×0.90×1.00 | grey, _defaultMat, red, road | 9K |
| `assets/shared/track/grass.glb` | Racing kit: grass | 1.00×0.00×1.00 | grass | 1K |
| `assets/shared/track/light-colored.glb` | Racing kit: lightColored | 0.07×0.65×0.11 | _defaultMat, grey, road, pylon, red, grass | 14K |
| `assets/shared/track/light-post-large.glb` | Racing kit: lightPostLarge | 0.38×0.80×0.10 | _defaultMat, grey, pylon | 18K |
| `assets/shared/track/light-red-double.glb` | Racing kit: lightRedDouble | 0.14×0.68×0.11 | _defaultMat, grey, road, pylon, red | 24K |
| `assets/shared/track/light-red.glb` | Racing kit: lightRed | 0.07×0.71×0.11 | _defaultMat, grey, road, pylon, red | 15K |
| `assets/shared/track/overhead-lights.glb` | Racing kit: overheadLights | 1.26×0.69×0.19 | grey, road, red | 20K |
| `assets/shared/track/overhead.glb` | Racing kit: overhead | 1.26×0.67×0.19 | grey | 7K |
| `assets/shared/track/pits-garage.glb` | Racing kit: pitsGarage | 1.00×0.70×1.09 | grey, _defaultMat, tankco, red | 12K |
| `assets/shared/track/pits-office.glb` | Racing kit: pitsOffice | 1.00×0.51×1.04 | grey, red, glass, _defaultMat | 6K |
| `assets/shared/track/pylon.glb` | Racing kit: pylon | 0.12×0.13×0.12 | pylon | 6K |
| `assets/shared/track/rail-double.glb` | Racing kit: railDouble | 1.00×0.28×0.05 | grey | 7K |
| `assets/shared/track/rail.glb` | Racing kit: rail | 1.00×0.16×0.05 | grey | 5K |
| `assets/shared/track/ramp.glb` | Racing kit: ramp | 0.55×0.33×0.73 | bark, grey | 5K |
| `assets/shared/track/road-corner-large-border.glb` | Racing kit: roadCornerLargeBorder | 2.21×0.02×2.21 | white, red | 5K |
| `assets/shared/track/road-corner-large-wall.glb` | Racing kit: roadCornerLargeWall | 2.58×0.04×2.58 | white, red | 5K |
| `assets/shared/track/road-corner-large.glb` | Racing kit: roadCornerLarge | 2.00×0.02×2.00 | grey, grass, road | 12K |
| `assets/shared/track/road-corner-larger-border.glb` | Racing kit: roadCornerLargerBorder | 3.21×0.02×3.21 | red, white | 5K |
| `assets/shared/track/road-corner-larger-wall.glb` | Racing kit: roadCornerLargerWall | 3.58×0.04×3.58 | white, red | 5K |
| `assets/shared/track/road-corner-larger.glb` | Racing kit: roadCornerLarger | 3.00×0.02×3.00 | _defaultMat, grass, road | 10K |
| `assets/shared/track/road-corner-small-border.glb` | Racing kit: roadCornerSmallBorder | 1.21×0.02×1.21 | red, white | 5K |
| `assets/shared/track/road-corner-small-wall.glb` | Racing kit: roadCornerSmallWall | 1.58×0.04×1.58 | red, white | 5K |
| `assets/shared/track/road-corner-small.glb` | Racing kit: roadCornerSmall | 1.00×0.02×1.00 | grey, grass, road | 11K |
| `assets/shared/track/road-crossing.glb` | Racing kit: roadCrossing | 2.00×0.02×2.00 | grey, grass, road | 14K |
| `assets/shared/track/road-curved.glb` | Racing kit: roadCurved | 1.50×0.02×2.00 | road, grey, grass | 21K |
| `assets/shared/track/road-end.glb` | Racing kit: roadEnd | 1.00×0.02×1.50 | grey, grass, road | 7K |
| `assets/shared/track/road-ramp-long.glb` | Racing kit: roadRampLong | 1.00×0.52×2.00 | grass, grey, road | 3K |
| `assets/shared/track/road-ramp.glb` | Racing kit: roadRamp | 1.00×0.27×1.00 | grass, grey, road | 3K |
| `assets/shared/track/road-side.glb` | Racing kit: roadSide | 2.00×0.02×2.00 | grass, grey, road | 5K |
| `assets/shared/track/road-split.glb` | Racing kit: roadSplit | 3.00×0.02×2.00 | grey, grass, road | 4K |
| `assets/shared/track/road-start-positions.glb` | Racing kit: roadStartPositions | 1.00×0.02×2.00 | grass, grey, road | 4K |
| `assets/shared/track/road-start.glb` | Racing kit: roadStart | 1.26×0.67×2.00 | grey, grass, road | 10K |
| `assets/shared/track/road-straight-arrow.glb` | Racing kit: roadStraightArrow | 1.00×0.02×1.00 | grass, grey, road | 3K |
| `assets/shared/track/road-straight-bridge.glb` | Racing kit: roadStraightBridge | 1.00×0.52×1.00 | wall, grey, road, _defaultMat | 4K |
| `assets/shared/track/road-straight-long-bump.glb` | Racing kit: roadStraightLongBump | 1.00×0.26×2.00 | grass, grey, road | 42K |
| `assets/shared/track/road-straight-long.glb` | Racing kit: roadStraightLong | 1.00×0.02×2.00 | grass, grey, road | 3K |
| `assets/shared/track/road-straight.glb` | Racing kit: roadStraight | 1.00×0.02×1.00 | grass, grey, road | 3K |
| `assets/shared/track/tent.glb` | Racing kit: tent | 1.00×0.70×1.00 | red, grey | 5K |
| `assets/shared/track/tree-large.glb` | Racing kit: treeLarge | 0.36×1.51×0.41 | grass, bark | 5K |
| `assets/shared/track/tree-small.glb` | Racing kit: treeSmall | 0.25×1.07×0.29 | grass, bark | 5K |


## Nature / environment

Preview: `assets/shared/preview-nature.jpg`

### nature/forest — KayKit Forest Nature Pack 1.0 (Kay Lousberg, CC0, <https://kaylousberg.itch.io/kaykit-forest>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/nature/bush-1-a.glb` | KayKit forest Bush_1_A | 0.27×0.23×0.23 | forest | 51K |
| `assets/shared/nature/bush-1-d.glb` | KayKit forest Bush_1_D | 1.57×0.99×1.57 | forest | 53K |
| `assets/shared/nature/bush-2-a.glb` | KayKit forest Bush_2_A | 0.53×0.53×0.53 | forest | 50K |
| `assets/shared/nature/bush-3-a.glb` | KayKit forest Bush_3_A | 1.03×0.48×1.03 | forest | 54K |
| `assets/shared/nature/bush-4-a.glb` | KayKit forest Bush_4_A | 0.58×0.43×0.58 | forest | 50K |
| `assets/shared/nature/grass-1-a.glb` | KayKit forest Grass_1_A | 0.34×0.56×0.15 | forest | 51K |
| `assets/shared/nature/grass-1-c.glb` | KayKit forest Grass_1_C | 0.75×0.58×0.72 | forest | 67K |
| `assets/shared/nature/grass-2-a.glb` | KayKit forest Grass_2_A | 0.15×0.92×0.25 | forest | 51K |
| `assets/shared/nature/rock-1-a.glb` | KayKit forest Rock_1_A | 0.58×0.54×0.61 | forest | 52K |
| `assets/shared/nature/rock-1-j.glb` | KayKit forest Rock_1_J | 3.39×3.36×3.76 | forest | 79K |
| `assets/shared/nature/rock-2-a.glb` | KayKit forest Rock_2_A | 0.22×0.22×0.22 | forest | 50K |
| `assets/shared/nature/rock-2-e.glb` | KayKit forest Rock_2_E | 3.17×2.86×3.31 | forest | 63K |
| `assets/shared/nature/rock-3-a.glb` | KayKit forest Rock_3_A | 0.96×0.86×0.81 | forest | 53K |
| `assets/shared/nature/rock-3-h.glb` | KayKit forest Rock_3_H | 1.96×2.06×1.76 | forest | 55K |
| `assets/shared/nature/tree-1-a.glb` | KayKit forest Tree_1_A | 3.18×4.16×3.25 | forest | 66K |
| `assets/shared/nature/tree-1-c.glb` | KayKit forest Tree_1_C | 6.69×7.81×5.75 | forest | 94K |
| `assets/shared/nature/tree-2-a.glb` | KayKit forest Tree_2_A | 2.60×4.67×2.00 | forest | 57K |
| `assets/shared/nature/tree-2-c.glb` | KayKit forest Tree_2_C | 4.60×6.92×3.40 | forest | 64K |
| `assets/shared/nature/tree-3-a.glb` | KayKit forest Tree_3_A | 3.09×3.51×3.09 | forest | 78K |
| `assets/shared/nature/tree-3-c.glb` | KayKit forest Tree_3_C | 5.63×5.79×4.62 | forest | 118K |
| `assets/shared/nature/tree-4-a.glb` | KayKit forest Tree_4_A | 2.01×5.27×2.00 | forest | 61K |
| `assets/shared/nature/tree-4-c.glb` | KayKit forest Tree_4_C | 3.73×10.77×2.87 | forest | 79K |
| `assets/shared/nature/tree-bare-1-a.glb` | KayKit forest Tree_Bare_1_A | 1.13×2.86×1.03 | forest | 60K |
| `assets/shared/nature/tree-bare-2-a.glb` | KayKit forest Tree_Bare_2_A | 1.20×3.84×0.60 | forest | 64K |

### nature/kenney-nature — Kenney Nature Kit (Kenney, CC0, <https://kenney.nl/assets/nature-kit>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/nature/k-cactus-short.glb` | Kenney nature cactus_short | 0.34×0.53×0.30 | leafsGreen | 7K |
| `assets/shared/nature/k-cactus-tall.glb` | Kenney nature cactus_tall | 0.40×0.75×0.34 | leafsGreen | 7K |
| `assets/shared/nature/k-campfire-logs.glb` | Kenney nature campfire_logs | 0.29×0.06×0.29 | wood, woodDark | 7K |
| `assets/shared/nature/k-crop-pumpkin.glb` | Kenney nature crop_pumpkin | 0.44×0.33×0.45 | leafsFall, grass | 8K |
| `assets/shared/nature/k-fence-planks.glb` | Kenney nature fence_planks | 1.00×0.34×0.10 | wood | 6K |
| `assets/shared/nature/k-fence-simple.glb` | Kenney nature fence_simple | 1.00×0.34×0.07 | wood, woodDark | 4K |
| `assets/shared/nature/k-flower-purple-a.glb` | Kenney nature flower_purpleA | 0.16×0.24×0.18 | grass, colorPurple | 5K |
| `assets/shared/nature/k-flower-red-a.glb` | Kenney nature flower_redA | 0.16×0.29×0.18 | grass, colorRed | 5K |
| `assets/shared/nature/k-flower-yellow-a.glb` | Kenney nature flower_yellowA | 0.16×0.19×0.18 | grass, colorYellow | 5K |
| `assets/shared/nature/k-lily-large.glb` | Kenney nature lily_large | 0.27×0.10×0.31 | leafsGreen, colorRed, leafsDark | 6K |
| `assets/shared/nature/k-log-stack.glb` | Kenney nature log_stack | 0.42×0.35×0.71 | woodBark, woodInner | 8K |
| `assets/shared/nature/k-log.glb` | Kenney nature log | 0.23×0.17×0.71 | woodBark, woodInner | 11K |
| `assets/shared/nature/k-mushroom-red-group.glb` | Kenney nature mushroom_redGroup | 0.27×0.25×0.25 | _defaultMat, colorRed | 11K |
| `assets/shared/nature/k-mushroom-red.glb` | Kenney nature mushroom_red | 0.17×0.20×0.20 | _defaultMat, colorRed | 5K |
| `assets/shared/nature/k-mushroom-tan-group.glb` | Kenney nature mushroom_tanGroup | 0.27×0.25×0.25 | _defaultMat, colorTan | 11K |
| `assets/shared/nature/k-stump-round.glb` | Kenney nature stump_round | 0.32×0.21×0.37 | woodBark, woodInner | 4K |
| `assets/shared/nature/k-tree-palm-tall.glb` | Kenney nature tree_palmTall | 1.03×1.36×1.03 | leafsGreen, woodBark | 12K |
| `assets/shared/nature/k-tree-palm.glb` | Kenney nature tree_palm | 0.94×1.51×1.01 | woodBark, leafsGreen | 10K |

### nature/platformer-nature — Ultimate Platformer Pack (Quaternius, CC0, <https://quaternius.itch.io/ultimate-platformer-pack>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/nature/q-bush-fruit.glb` | Quaternius platformer Bush_Fruit | 3.52×2.23×3.53 | Green, Red | 38K |
| `assets/shared/nature/q-bush.glb` | Quaternius platformer Bush | 3.52×2.23×3.53 | Green | 34K |
| `assets/shared/nature/q-cloud-1.glb` | Quaternius platformer Cloud_1 | 3.29×2.12×2.45 | Cloud | 9K |
| `assets/shared/nature/q-cloud-2.glb` | Quaternius platformer Cloud_2 | 4.01×2.40×2.45 | Cloud | 12K |
| `assets/shared/nature/q-cloud-3.glb` | Quaternius platformer Cloud_3 | 5.85×3.16×3.49 | Cloud | 14K |
| `assets/shared/nature/q-fruit.glb` | Quaternius platformer Fruit | 0.88×0.82×0.69 | Red, Green_Light | 13K |
| `assets/shared/nature/q-grass-1.glb` | Quaternius platformer Grass_1 | 0.52×0.38×0.40 | Green_Light | 2K |
| `assets/shared/nature/q-grass-2.glb` | Quaternius platformer Grass_2 | 1.07×0.47×0.63 | Green_Light | 3K |
| `assets/shared/nature/q-rock-1.glb` | Quaternius platformer Rock_1 | 1.60×1.10×1.47 | Rock_Grey | 5K |
| `assets/shared/nature/q-rock-2.glb` | Quaternius platformer Rock_2 | 1.64×2.10×1.47 | Rock_Grey | 8K |
| `assets/shared/nature/q-rock-platform-tall.glb` | Quaternius platformer RockPlatform_Tall | 3.58×4.26×3.58 | Rock | 7K |
| `assets/shared/nature/q-rock-platforms-1.glb` | Quaternius platformer RockPlatforms_1 | 6.40×5.53×5.88 | Rock | 20K |
| `assets/shared/nature/q-rock-platforms-large.glb` | Quaternius platformer RockPlatforms_Large | 7.38×3.63×5.16 | Rock | 11K |
| `assets/shared/nature/q-tree-fruit.glb` | Quaternius platformer Tree_Fruit | 5.53×8.63×5.55 | Wood, Red, Green | 89K |
| `assets/shared/nature/q-tree.glb` | Quaternius platformer Tree | 5.53×8.63×5.55 | Wood, Green | 62K |


## Party props

Preview: `assets/shared/preview-props.jpg`

### props/platformer-props — Ultimate Platformer Pack (Quaternius, CC0, <https://quaternius.itch.io/ultimate-platformer-pack>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/props/arrow.glb` | Quaternius Arrow | 1.85×0.15×1.02 | — | — | 4K |
| `assets/shared/props/bomb.glb` | Quaternius Bomb | 1.12×1.75×1.13 | — | — | 24K |
| `assets/shared/props/bouncer.glb` | Quaternius Bouncer | 2.21×1.90×2.21 | Bouncer_Bounce, Bouncer_Idle | — | 30K |
| `assets/shared/props/bridge-small.glb` | Quaternius Bridge_Small | 6.94×2.62×2.64 | — | — | 70K |
| `assets/shared/props/cannon.glb` | Quaternius Cannon | 3.38×3.67×3.32 | — | — | 54K |
| `assets/shared/props/cannonball.glb` | Quaternius Cannonball | 1.12×1.14×1.12 | — | — | 8K |
| `assets/shared/props/chest.glb` | Quaternius Chest | 2.14×2.27×2.03 | Chest_Close, Chest_Open | — | 353K |
| `assets/shared/props/coin.glb` | Quaternius Coin | 1.92×1.92×0.52 | — | — | 14K |
| `assets/shared/props/cube-bricks.glb` | Quaternius Cube_Bricks | 2.04×2.03×2.06 | — | — | 49K |
| `assets/shared/props/cube-crate.glb` | Quaternius Cube_Crate | 2.02×2.02×2.02 | — | — | 12K |
| `assets/shared/props/cube-exclamation.glb` | Quaternius Cube_Exclamation | 2.02×2.02×2.02 | — | — | 34K |
| `assets/shared/props/cube-grass-single.glb` | Quaternius Cube_Grass_Single | 2.23×2.00×2.23 | — | — | 18K |
| `assets/shared/props/cube-question.glb` | Quaternius Cube_Question | 2.02×2.02×2.02 | — | — | 36K |
| `assets/shared/props/cube-spikes.glb` | Quaternius Cube_Spikes | 3.15×3.15×3.15 | — | — | 14K |
| `assets/shared/props/door.glb` | Quaternius Door | 3.71×4.24×1.33 | — | — | 23K |
| `assets/shared/props/gem-blue.glb` | Quaternius Gem_Blue | 0.99×2.11×0.70 | — | — | 4K |
| `assets/shared/props/gem-green.glb` | Quaternius Gem_Green | 1.50×1.51×1.50 | — | — | 4K |
| `assets/shared/props/gem-pink.glb` | Quaternius Gem_Pink | 1.13×1.94×1.13 | — | — | 2K |
| `assets/shared/props/goal-flag.glb` | Quaternius Goal_Flag | 1.41×2.33×0.38 | — | — | 9K |
| `assets/shared/props/hazard-cylinder.glb` | Quaternius Hazard_Cylinder | 2.28×3.88×2.28 | — | — | 26K |
| `assets/shared/props/hazard-saw.glb` | Quaternius Hazard_Saw | 3.00×2.86×0.20 | — | — | 37K |
| `assets/shared/props/hazard-spike-trap.glb` | Quaternius Hazard_SpikeTrap | 2.00×1.08×2.00 | SpikeTrap_Activate | — | 28K |
| `assets/shared/props/heart.glb` | Quaternius Heart | 1.48×1.24×0.75 | — | — | 11K |
| `assets/shared/props/key.glb` | Quaternius Key | 1.93×0.98×0.32 | — | — | 12K |
| `assets/shared/props/lever.glb` | Quaternius Lever | 1.41×1.34×0.51 | Lever_Off, Lever_On | — | 16K |
| `assets/shared/props/number-0.glb` | Quaternius Numbers_0 | 0.73×1.11×0.41 | — | — | 11K |
| `assets/shared/props/number-1.glb` | Quaternius Numbers_1 | 0.33×1.09×0.29 | — | — | 5K |
| `assets/shared/props/number-2.glb` | Quaternius Numbers_2 | 0.71×1.11×0.29 | — | — | 9K |
| `assets/shared/props/number-3.glb` | Quaternius Numbers_3 | 0.75×1.12×0.34 | — | — | 11K |
| `assets/shared/props/number-4.glb` | Quaternius Numbers_4 | 0.74×1.12×0.30 | — | — | 13K |
| `assets/shared/props/number-5.glb` | Quaternius Numbers_5 | 0.72×1.12×0.34 | — | — | 12K |
| `assets/shared/props/number-6.glb` | Quaternius Numbers_6 | 0.76×1.11×0.33 | — | — | 13K |
| `assets/shared/props/number-7.glb` | Quaternius Numbers_7 | 0.77×1.12×0.32 | — | — | 8K |
| `assets/shared/props/number-8.glb` | Quaternius Numbers_8 | 0.73×1.12×0.41 | — | — | 13K |
| `assets/shared/props/number-9.glb` | Quaternius Numbers_9 | 0.75×1.09×0.34 | — | — | 13K |
| `assets/shared/props/spikes.glb` | Quaternius Spikes | 1.95×3.40×1.83 | — | — | 37K |
| `assets/shared/props/spiky-ball.glb` | Quaternius SpikyBall | 1.18×1.19×1.18 | — | — | 27K |
| `assets/shared/props/star-outline.glb` | Quaternius Star_Outline | 1.51×1.44×0.06 | — | — | 15K |
| `assets/shared/props/star.glb` | Quaternius Star | 1.51×1.44×0.69 | — | — | 11K |
| `assets/shared/props/thunder.glb` | Quaternius Thunder | 1.17×1.59×0.35 | — | — | 4K |
| `assets/shared/props/tower.glb` | Quaternius Tower | 9.44×14.60×8.98 | — | — | 109K |

### props/kaykit-platformer — KayKit Platformer Pack 1.0 (Kay Lousberg, CC0, <https://kaylousberg.itch.io/kaykit-platformer>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/props/kaykit-platformer/arch-blue.glb` | KayKit platformer arch (blue) | 3.75×3.70×0.75 | platformer | 66K |
| `assets/shared/props/kaykit-platformer/arch-wide-blue.glb` | KayKit platformer arch_wide (blue) | 5.75×3.80×0.75 | platformer | 67K |
| `assets/shared/props/kaykit-platformer/barrier-2x1x2-blue.glb` | KayKit platformer barrier_2x1x2 (blue) | 2.00×2.00×1.00 | platformer | 46K |
| `assets/shared/props/kaykit-platformer/bomb-a-blue.glb` | KayKit platformer bomb_A (blue) | 0.80×1.01×0.80 | platformer | 56K |
| `assets/shared/props/kaykit-platformer/button-base-blue.glb` | KayKit platformer button_base (blue) | 1.75×0.32×1.75 | platformer | 48K |
| `assets/shared/props/kaykit-platformer/cone-blue.glb` | KayKit platformer cone (blue) | 0.50×0.65×0.50 | platformer | 44K |
| `assets/shared/props/kaykit-platformer/diamond-blue.glb` | KayKit platformer diamond (blue) | 1.08×0.85×1.03 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/flag-a-blue.glb` | KayKit platformer flag_A (blue) | 0.60×2.06×1.62 | platformer | 58K |
| `assets/shared/props/kaykit-platformer/floor-wood-2x2.glb` | KayKit platformer floor_wood_2x2 | 2.00×0.50×2.00 | platformer | 64K |
| `assets/shared/props/kaykit-platformer/floor-wood-4x4.glb` | KayKit platformer floor_wood_4x4 | 4.00×0.50×4.00 | platformer | 64K |
| `assets/shared/props/kaykit-platformer/heart-blue.glb` | KayKit platformer heart (blue) | 1.08×0.85×0.53 | platformer | 45K |
| `assets/shared/props/kaykit-platformer/hoop-blue.glb` | KayKit platformer hoop (blue) | 3.40×4.70×0.75 | platformer | 58K |
| `assets/shared/props/kaykit-platformer/lever-floor-base-blue.glb` | KayKit platformer lever_floor_base (blue) | 0.80×1.73×1.20 | platformer | 54K |
| `assets/shared/props/kaykit-platformer/pillar-1x1x4.glb` | KayKit platformer pillar_1x1x4 | 0.80×4.00×0.80 | platformer | 52K |
| `assets/shared/props/kaykit-platformer/pillar-2x2x4.glb` | KayKit platformer pillar_2x2x4 | 1.60×4.00×1.60 | platformer | 54K |
| `assets/shared/props/kaykit-platformer/pipe-90-a-blue.glb` | KayKit platformer pipe_90_A (blue) | 2.00×3.00×3.00 | platformer | 53K |
| `assets/shared/props/kaykit-platformer/pipe-straight-a-blue.glb` | KayKit platformer pipe_straight_A (blue) | 2.00×2.00×2.00 | platformer | 44K |
| `assets/shared/props/kaykit-platformer/platform-1x1x1-blue.glb` | KayKit platformer platform_1x1x1 (blue) | 1.00×1.00×1.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-2x2x1-blue.glb` | KayKit platformer platform_2x2x1 (blue) | 2.00×1.00×2.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-2x2x1-green.glb` | KayKit platformer platform_2x2x1 (green) | 2.00×1.00×2.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-2x2x1-red.glb` | KayKit platformer platform_2x2x1 (red) | 2.00×1.00×2.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-2x2x1-yellow.glb` | KayKit platformer platform_2x2x1 (yellow) | 2.00×1.00×2.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-4x2x1-blue.glb` | KayKit platformer platform_4x2x1 (blue) | 4.00×1.00×2.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-4x4x1-blue.glb` | KayKit platformer platform_4x4x1 (blue) | 4.00×1.00×4.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-4x4x1-green.glb` | KayKit platformer platform_4x4x1 (green) | 4.00×1.00×4.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-4x4x1-red.glb` | KayKit platformer platform_4x4x1 (red) | 4.00×1.00×4.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-4x4x1-yellow.glb` | KayKit platformer platform_4x4x1 (yellow) | 4.00×1.00×4.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-4x4x2-blue.glb` | KayKit platformer platform_4x4x2 (blue) | 4.00×2.00×4.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-6x2x1-blue.glb` | KayKit platformer platform_6x2x1 (blue) | 6.00×1.00×2.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-6x6x1-blue.glb` | KayKit platformer platform_6x6x1 (blue) | 6.00×1.00×6.00 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/platform-arrow-4x4x1-blue.glb` | KayKit platformer platform_arrow_4x4x1 (blue) | 4.00×1.00×4.00 | platformer | 47K |
| `assets/shared/props/kaykit-platformer/platform-decorative-2x2x2-blue.glb` | KayKit platformer platform_decorative_2x2x2 (blue) | 2.00×2.00×2.00 | platformer | 53K |
| `assets/shared/props/kaykit-platformer/platform-hole-6x6x1-blue.glb` | KayKit platformer platform_hole_6x6x1 (blue) | 6.00×1.00×6.00 | platformer | 51K |
| `assets/shared/props/kaykit-platformer/platform-slope-4x4x4-blue.glb` | KayKit platformer platform_slope_4x4x4 (blue) | 4.00×4.00×4.00 | platformer | 45K |
| `assets/shared/props/kaykit-platformer/power-blue.glb` | KayKit platformer power (blue) | 0.89×1.20×0.40 | platformer | 47K |
| `assets/shared/props/kaykit-platformer/railing-corner-padded-blue.glb` | KayKit platformer railing_corner_padded (blue) | 2.10×1.20×2.10 | platformer | 47K |
| `assets/shared/props/kaykit-platformer/railing-straight-padded-blue.glb` | KayKit platformer railing_straight_padded (blue) | 2.00×1.20×0.60 | platformer | 44K |
| `assets/shared/props/kaykit-platformer/sign.glb` | KayKit platformer sign | 0.77×1.26×0.76 | platformer | 63K |
| `assets/shared/props/kaykit-platformer/signage-arrow-stand-blue.glb` | KayKit platformer signage_arrow_stand (blue) | 1.00×2.00×0.40 | platformer | 51K |
| `assets/shared/props/kaykit-platformer/signage-finish-wide.glb` | KayKit platformer signage_finish_wide | 9.40×4.50×0.50 | platformer | 83K |
| `assets/shared/props/kaykit-platformer/signage-finish.glb` | KayKit platformer signage_finish | 5.40×4.50×0.50 | platformer | 74K |
| `assets/shared/props/kaykit-platformer/spring-pad-blue.glb` | KayKit platformer spring_pad (blue) | 1.50×1.00×1.50 | platformer | 61K |
| `assets/shared/props/kaykit-platformer/spring.glb` | KayKit platformer spring | 1.00×2.20×1.00 | platformer | 65K |
| `assets/shared/props/kaykit-platformer/star-blue.glb` | KayKit platformer star (blue) | 1.17×1.11×0.45 | platformer | 43K |
| `assets/shared/props/kaykit-platformer/structure-a.glb` | KayKit platformer structure_A | 2.00×0.20×2.00 | platformer | 45K |
| `assets/shared/props/kaykit-platformer/strut-horizontal.glb` | KayKit platformer strut_horizontal | 2.00×0.50×0.50 | platformer | 40K |

### props/minigame — KayKit Mini-Game Variety Pack 1.2 (Kay Lousberg, CC0, <https://kaylousberg.itch.io/kay-kit-mini-game-variety-pack>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/props/minigame/arrow-red.glb` | KayKit mini-game arrow_teamRed | 0.36×1.24×0.31 | Metal, BrownDark, Red | 8K |
| `assets/shared/props/minigame/ball-blue.glb` | KayKit mini-game ball_teamBlue | 2.00×2.00×1.97 | White, Blue | 14K |
| `assets/shared/props/minigame/ball-red.glb` | KayKit mini-game ball_teamRed | 2.00×2.00×1.97 | White, Red | 14K |
| `assets/shared/props/minigame/ball-yellow.glb` | KayKit mini-game ball_teamYellow | 2.00×2.00×1.97 | White, Yellow | 14K |
| `assets/shared/props/minigame/ball.glb` | KayKit mini-game ball | 2.00×2.00×1.97 | White, Blue, Red, Yellow | 16K |
| `assets/shared/props/minigame/barrier-floor.glb` | KayKit mini-game barrierFloor | 1.96×0.17×2.00 | Metal | 33K |
| `assets/shared/props/minigame/barrier-ladder.glb` | KayKit mini-game barrierLadder | 0.17×2.00×0.96 | Metal | 11K |
| `assets/shared/props/minigame/barrier-large.glb` | KayKit mini-game barrierLarge | 5.96×1.00×0.17 | Metal | 16K |
| `assets/shared/props/minigame/barrier-medium.glb` | KayKit mini-game barrierMedium | 3.96×1.00×0.17 | Metal | 16K |
| `assets/shared/props/minigame/barrier-small.glb` | KayKit mini-game barrierSmall | 1.96×1.00×0.17 | Metal | 16K |
| `assets/shared/props/minigame/barrier-strut.glb` | KayKit mini-game barrierStrut | 1.16×2.00×1.17 | Metal | 34K |
| `assets/shared/props/minigame/blaster-red.glb` | KayKit mini-game blaster_teamRed | 0.43×0.79×1.33 | Metal, Red | 50K |
| `assets/shared/props/minigame/bomb-red.glb` | KayKit mini-game bomb_teamRed | 1.13×1.31×1.13 | Black, Beige, Red | 34K |
| `assets/shared/props/minigame/bow-blue.glb` | KayKit mini-game bow_teamBlue | 1.54×0.81×0.23 | Brown, White, Blue | 35K |
| `assets/shared/props/minigame/button-blue.glb` | KayKit mini-game button_teamBlue | 1.63×0.34×1.63 | Blue, Metal | 16K |
| `assets/shared/props/minigame/button-red.glb` | KayKit mini-game button_teamRed | 1.63×0.34×1.63 | Red, Metal | 16K |
| `assets/shared/props/minigame/button-yellow.glb` | KayKit mini-game button_teamYellow | 1.63×0.34×1.63 | Yellow, Metal | 16K |
| `assets/shared/props/minigame/detail-forest.glb` | KayKit mini-game detail_forest | 1.70×0.33×1.66 | Beige, Green | 69K |
| `assets/shared/props/minigame/diamond-blue.glb` | KayKit mini-game diamond_teamBlue | 1.13×0.91×1.08 | Blue | 10K |
| `assets/shared/props/minigame/flag-blue.glb` | KayKit mini-game flag_teamBlue | 1.20×2.00×0.55 | Blue, Brown, Metal | 17K |
| `assets/shared/props/minigame/flag-red.glb` | KayKit mini-game flag_teamRed | 1.20×2.00×0.55 | Red, Brown, Metal | 17K |
| `assets/shared/props/minigame/flag-yellow.glb` | KayKit mini-game flag_teamYellow | 1.20×2.00×0.55 | Yellow, Brown, Metal | 17K |
| `assets/shared/props/minigame/gate-large-blue.glb` | KayKit mini-game gateLarge_teamBlue | 2.40×3.20×0.41 | Blue | 14K |
| `assets/shared/props/minigame/gate-large-wide-yellow.glb` | KayKit mini-game gateLargeWide_teamYellow | 4.40×3.20×0.41 | Yellow | 15K |
| `assets/shared/props/minigame/gate-small-wide-red.glb` | KayKit mini-game gateSmallWide_teamRed | 4.40×2.00×0.41 | Red | 14K |
| `assets/shared/props/minigame/heart-red.glb` | KayKit mini-game heart_teamRed | 1.08×0.94×0.49 | Red | 13K |
| `assets/shared/props/minigame/hoop-red.glb` | KayKit mini-game hoop_teamRed | 2.00×3.00×2.00 | Metal, Red | 34K |
| `assets/shared/props/minigame/lightning.glb` | KayKit mini-game lightning | 0.80×1.24×0.28 | Yellow | 7K |
| `assets/shared/props/minigame/plant-a-forest.glb` | KayKit mini-game plantA_forest | 0.67×0.26×0.69 | Green | 34K |
| `assets/shared/props/minigame/powerup-block-blue.glb` | KayKit mini-game powerupBlock_teamBlue | 1.00×1.00×1.00 | Metal, Blue | 11K |
| `assets/shared/props/minigame/powerup-block-red.glb` | KayKit mini-game powerupBlock_teamRed | 1.00×1.00×1.00 | Metal, Red | 11K |
| `assets/shared/props/minigame/powerup-block-yellow.glb` | KayKit mini-game powerupBlock_teamYellow | 1.00×1.00×1.00 | Metal, Yellow | 11K |
| `assets/shared/props/minigame/powerup-bomb.glb` | KayKit mini-game powerupBomb | 1.00×1.31×1.00 | Black, Beige | 28K |
| `assets/shared/props/minigame/ring-yellow.glb` | KayKit mini-game ring_teamYellow | 2.00×3.00×0.55 | Yellow, Metal | 31K |
| `assets/shared/props/minigame/rocks-a-forest.glb` | KayKit mini-game rocksA_forest | 1.63×0.35×1.49 | Stone | 18K |
| `assets/shared/props/minigame/slingshot-yellow.glb` | KayKit mini-game slingshot_teamYellow | 0.61×1.11×0.16 | Metal, Yellow | 40K |
| `assets/shared/props/minigame/spike-roller.glb` | KayKit mini-game spikeRoller | 2.00×2.00×2.00 | BrownDark, Black, Metal | 58K |
| `assets/shared/props/minigame/star.glb` | KayKit mini-game star | 1.23×1.18×0.46 | Yellow | 18K |
| `assets/shared/props/minigame/swiper-double-blue.glb` | KayKit mini-game swiperDouble_teamBlue | 0.81×1.63×5.96 | Brown, Metal, Blue, White | 64K |
| `assets/shared/props/minigame/swiper-long-red.glb` | KayKit mini-game swiperLong_teamRed | 0.81×1.63×5.38 | Brown, Metal, Red, White | 48K |
| `assets/shared/props/minigame/swiper-red.glb` | KayKit mini-game swiper_teamRed | 0.81×1.63×3.38 | Brown, Metal, Red, White | 42K |
| `assets/shared/props/minigame/sword-blue.glb` | KayKit mini-game sword_teamBlue | 0.43×1.37×0.18 | Blue, Metal | 14K |
| `assets/shared/props/minigame/target-stand.glb` | KayKit mini-game targetStand | 1.37×1.85×1.53 | Red, White, BrownDark | 28K |
| `assets/shared/props/minigame/target.glb` | KayKit mini-game target | 1.37×1.37×0.44 | Red, White | 24K |
| `assets/shared/props/minigame/tile-high-forest.glb` | KayKit mini-game tileHigh_forest | 2.00×2.00×2.00 | Green, BrownDark | 10K |
| `assets/shared/props/minigame/tile-large-blue.glb` | KayKit mini-game tileLarge_teamBlue | 6.00×1.00×6.00 | Blue, Metal | 10K |
| `assets/shared/props/minigame/tile-large-desert.glb` | KayKit mini-game tileLarge_desert | 6.00×1.00×6.00 | Beige, BrownDark | 10K |
| `assets/shared/props/minigame/tile-large-forest.glb` | KayKit mini-game tileLarge_forest | 6.00×1.00×6.00 | Green, BrownDark | 10K |
| `assets/shared/props/minigame/tile-large-red.glb` | KayKit mini-game tileLarge_teamRed | 6.00×1.00×6.00 | Red, Metal | 10K |
| `assets/shared/props/minigame/tile-large-yellow.glb` | KayKit mini-game tileLarge_teamYellow | 6.00×1.00×6.00 | Yellow, Metal | 10K |
| `assets/shared/props/minigame/tile-low-forest.glb` | KayKit mini-game tileLow_forest | 2.00×1.00×2.00 | Green, BrownDark | 10K |
| `assets/shared/props/minigame/tile-medium-forest.glb` | KayKit mini-game tileMedium_forest | 2.00×1.50×2.00 | Green, BrownDark | 10K |
| `assets/shared/props/minigame/tile-slope-low-high-forest.glb` | KayKit mini-game tileSlopeLowHigh_forest | 2.00×2.00×2.00 | Green, BrownDark | 10K |
| `assets/shared/props/minigame/tile-small-blue.glb` | KayKit mini-game tileSmall_teamBlue | 1.00×1.00×1.00 | Blue, Metal | 10K |
| `assets/shared/props/minigame/tile-small-desert.glb` | KayKit mini-game tileSmall_desert | 1.00×1.00×1.00 | Beige, BrownDark | 10K |
| `assets/shared/props/minigame/tile-small-forest.glb` | KayKit mini-game tileSmall_forest | 1.00×1.00×1.00 | Green, BrownDark | 10K |
| `assets/shared/props/minigame/tile-small-red.glb` | KayKit mini-game tileSmall_teamRed | 1.00×1.00×1.00 | Red, Metal | 10K |
| `assets/shared/props/minigame/tile-small-yellow.glb` | KayKit mini-game tileSmall_teamYellow | 1.00×1.00×1.00 | Yellow, Metal | 10K |
| `assets/shared/props/minigame/tree-desert.glb` | KayKit mini-game tree_desert | 2.04×2.80×0.55 | GreenDark | 23K |
| `assets/shared/props/minigame/tree-forest.glb` | KayKit mini-game tree_forest | 1.53×3.00×1.50 | GreenDark, BrownDark | 23K |

### props/sports — Basket ball and hoop (via Poly Pizza) (Armory_3D, CC0, <https://poly.pizza/m/i3LLacyQP4>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/props/sports/basketball-hoop.glb` | Basketball + hoop | 1.39×2.85×2.30 | Material.002, Material.004, Material.001 | 101K |
| `assets/shared/props/sports/soccer-ball.glb` | Low-poly soccer ball | 1060661.94×1068023.25×1057253.38 | 02___Default, _crayfishdiffuse | 14K |
| `assets/shared/props/sports/soccer-goal.glb` | Soccer goal with net and posts | 672741.81×541016.60×458577.00 | 02___Default, _crayfishdiffuse | 45K |


## Board-game pieces

Preview: `assets/shared/preview-board.jpg`

### board/board — KayKit Board Game Bits 1.0 (Kay Lousberg, CC0, <https://kaylousberg.itch.io/board-game-bits>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/board/building-blue.glb` | KayKit board game building_blue | 0.98×1.00×1.00 | boardgame | 41K |
| `assets/shared/board/building-green.glb` | KayKit board game building_green | 0.98×1.00×1.00 | boardgame | 41K |
| `assets/shared/board/building-red.glb` | KayKit board game building_red | 0.98×1.00×1.00 | boardgame | 41K |
| `assets/shared/board/building-yellow.glb` | KayKit board game building_yellow | 0.98×1.00×1.00 | boardgame | 41K |
| `assets/shared/board/coin-10-gold.glb` | KayKit board game coin_10_gold | 1.04×0.20×1.04 | boardgame_metallic | 61K |
| `assets/shared/board/coin-copper.glb` | KayKit board game coin_copper | 1.04×0.20×1.04 | boardgame_metallic | 48K |
| `assets/shared/board/coin-gold.glb` | KayKit board game coin_gold | 1.04×0.20×1.04 | boardgame_metallic | 48K |
| `assets/shared/board/coin-silver.glb` | KayKit board game coin_silver | 1.04×0.20×1.04 | boardgame_metallic | 48K |
| `assets/shared/board/container-a.glb` | KayKit board game container_A | 2.40×0.52×2.40 | boardgame | 42K |
| `assets/shared/board/cube-gold.glb` | KayKit board game cube_gold | 0.50×0.50×0.50 | boardgame_metallic | 38K |
| `assets/shared/board/cube-red.glb` | KayKit board game cube_red | 0.50×0.50×0.50 | boardgame | 38K |
| `assets/shared/board/d20-red.glb` | KayKit board game D20_red | 0.84×0.96×0.88 | dice_red | 171K |
| `assets/shared/board/d4-yellow.glb` | KayKit board game D4_yellow | 0.96×0.80×0.84 | dice_yellow | 170K |
| `assets/shared/board/d6-a-blue.glb` | KayKit board game D6_A_blue | 0.75×0.75×0.75 | boardgame | 56K |
| `assets/shared/board/d6-a-green.glb` | KayKit board game D6_A_green | 0.75×0.75×0.75 | boardgame | 56K |
| `assets/shared/board/d6-a-red.glb` | KayKit board game D6_A_red | 0.75×0.75×0.75 | boardgame | 56K |
| `assets/shared/board/d6-a-yellow.glb` | KayKit board game D6_A_yellow | 0.75×0.75×0.75 | boardgame | 56K |
| `assets/shared/board/d6-a.glb` | KayKit board game D6_A | 0.75×0.75×0.75 | boardgame | 56K |
| `assets/shared/board/d6-b.glb` | KayKit board game D6_B | 0.75×0.75×0.75 | boardgame | 56K |
| `assets/shared/board/d8-green.glb` | KayKit board game D8_green | 1.00×1.00×1.00 | dice_green | 151K |
| `assets/shared/board/domino-tile-3-5.glb` | KayKit board game domino_tile_3-5 | 1.00×0.28×2.00 | boardgame | 49K |
| `assets/shared/board/flag-a-blue.glb` | KayKit board game flag_A_blue | 0.94×1.43×0.75 | boardgame | 47K |
| `assets/shared/board/flag-a-green.glb` | KayKit board game flag_A_green | 0.94×1.43×0.75 | boardgame | 47K |
| `assets/shared/board/flag-a-red.glb` | KayKit board game flag_A_red | 0.94×1.43×0.75 | boardgame | 47K |
| `assets/shared/board/flag-a-yellow.glb` | KayKit board game flag_A_yellow | 0.94×1.43×0.75 | boardgame | 47K |
| `assets/shared/board/hourglass.glb` | KayKit board game hourglass | 1.00×2.50×1.00 | boardgame, glass | 58K |
| `assets/shared/board/meeple-blue.glb` | KayKit board game meeple_blue | 1.00×1.24×0.40 | boardgame | 44K |
| `assets/shared/board/meeple-green.glb` | KayKit board game meeple_green | 1.00×1.24×0.40 | boardgame | 44K |
| `assets/shared/board/meeple-red.glb` | KayKit board game meeple_red | 1.00×1.24×0.40 | boardgame | 44K |
| `assets/shared/board/meeple-yellow.glb` | KayKit board game meeple_yellow | 1.00×1.24×0.40 | boardgame | 44K |
| `assets/shared/board/pawn-a-blue.glb` | KayKit board game pawn_A_blue | 0.50×0.92×0.50 | boardgame | 45K |
| `assets/shared/board/pawn-a-green.glb` | KayKit board game pawn_A_green | 0.50×0.92×0.50 | boardgame | 45K |
| `assets/shared/board/pawn-a-red.glb` | KayKit board game pawn_A_red | 0.50×0.92×0.50 | boardgame | 45K |
| `assets/shared/board/pawn-a-yellow.glb` | KayKit board game pawn_A_yellow | 0.50×0.92×0.50 | boardgame | 45K |
| `assets/shared/board/pawn-b-blue.glb` | KayKit board game pawn_B_blue | 0.75×1.22×0.75 | boardgame | 48K |
| `assets/shared/board/pawn-b-green.glb` | KayKit board game pawn_B_green | 0.75×1.22×0.75 | boardgame | 48K |
| `assets/shared/board/pawn-b-red.glb` | KayKit board game pawn_B_red | 0.75×1.22×0.75 | boardgame | 48K |
| `assets/shared/board/pawn-b-yellow.glb` | KayKit board game pawn_B_yellow | 0.75×1.22×0.75 | boardgame | 48K |
| `assets/shared/board/playerstand.glb` | KayKit board game playerstand | 0.75×0.38×0.50 | boardgame | 43K |
| `assets/shared/board/tile-blue.glb` | KayKit board game tile_blue | 1.00×0.20×1.00 | boardgame | 41K |
| `assets/shared/board/tile-green.glb` | KayKit board game tile_green | 1.00×0.20×1.00 | boardgame | 41K |
| `assets/shared/board/tile-purple.glb` | KayKit board game tile_purple | 1.00×0.20×1.00 | boardgame | 41K |
| `assets/shared/board/tile-red.glb` | KayKit board game tile_red | 1.00×0.20×1.00 | boardgame | 41K |
| `assets/shared/board/tile-yellow.glb` | KayKit board game tile_yellow | 1.00×0.20×1.00 | boardgame | 41K |
| `assets/shared/board/token-blue.glb` | KayKit board game token_blue | 1.08×0.10×1.08 | boardgame | 46K |
| `assets/shared/board/token-green.glb` | KayKit board game token_green | 1.08×0.10×1.08 | boardgame | 46K |
| `assets/shared/board/token-red.glb` | KayKit board game token_red | 1.08×0.10×1.08 | boardgame | 46K |
| `assets/shared/board/token-yellow.glb` | KayKit board game token_yellow | 1.08×0.10×1.08 | boardgame | 46K |


## Kenney Platformer Kit (blocks + props)

Preview: `assets/shared/preview-platformer.jpg`

### platformer/kenney-platformer — Kenney Platformer Kit (Kenney, CC0, <https://kenney.nl/assets/platformer-kit>)

| file | description | size w×h×d (idle pose) | animations | tint material | KB |
|---|---|---|---|---|---|
| `assets/shared/platformer/arrow.glb` | Kenney platformer arrow | 0.46×0.60×0.14 | — | colormap/texture: multiply material.color | 16K |
| `assets/shared/platformer/barrel.glb` | Kenney platformer barrel | 0.52×0.48×0.52 | — | colormap/texture: multiply material.color | 20K |
| `assets/shared/platformer/block-grass-corner.glb` | Kenney platformer block-grass-corner | 1.05×1.00×1.05 | — | colormap/texture: multiply material.color | 17K |
| `assets/shared/platformer/block-grass-edge.glb` | Kenney platformer block-grass-edge | 1.08×1.00×1.08 | — | colormap/texture: multiply material.color | 19K |
| `assets/shared/platformer/block-grass-large-slope.glb` | Kenney platformer block-grass-large-slope | 2.08×0.76×2.01 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/block-grass-large.glb` | Kenney platformer block-grass-large | 2.08×1.00×2.08 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/block-grass-low.glb` | Kenney platformer block-grass-low | 1.08×0.50×1.08 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/block-grass.glb` | Kenney platformer block-grass | 1.08×1.00×1.08 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/block-moving.glb` | Kenney platformer block-moving | 1.00×0.30×1.00 | — | colormap/texture: multiply material.color | 19K |
| `assets/shared/platformer/block-snow-large.glb` | Kenney platformer block-snow-large | 2.08×1.00×2.08 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/block-snow.glb` | Kenney platformer block-snow | 1.08×1.00×1.08 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/bomb.glb` | Kenney platformer bomb | 0.49×0.54×0.49 | — | colormap/texture: multiply material.color | 22K |
| `assets/shared/platformer/button-round.glb` | Kenney platformer button-round | 0.58×0.14×0.50 | toggle-on, toggle-off, toggle | colormap/texture: multiply material.color | 19K |
| `assets/shared/platformer/chest.glb` | Kenney platformer chest | 0.50×0.69×0.66 | open, close, open-close | colormap/texture: multiply material.color | 28K |
| `assets/shared/platformer/coin-bronze.glb` | Kenney platformer coin-bronze | 0.40×0.40×0.17 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/coin-gold.glb` | Kenney platformer coin-gold | 0.40×0.40×0.17 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/coin-silver.glb` | Kenney platformer coin-silver | 0.40×0.40×0.17 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/conveyor-belt.glb` | Kenney platformer conveyor-belt | 1.00×0.35×1.00 | — | colormap/texture: multiply material.color | 34K |
| `assets/shared/platformer/crate-item.glb` | Kenney platformer crate-item | 0.50×0.50×0.50 | — | colormap/texture: multiply material.color | 20K |
| `assets/shared/platformer/crate-strong.glb` | Kenney platformer crate-strong | 0.60×0.60×0.60 | — | colormap/texture: multiply material.color | 39K |
| `assets/shared/platformer/crate.glb` | Kenney platformer crate | 0.50×0.50×0.50 | — | colormap/texture: multiply material.color | 20K |
| `assets/shared/platformer/door-rotate.glb` | Kenney platformer door-rotate | 0.67×1.00×0.53 | open, close, open-and-close | colormap/texture: multiply material.color | 37K |
| `assets/shared/platformer/fence-straight.glb` | Kenney platformer fence-straight | 1.00×0.40×0.14 | — | colormap/texture: multiply material.color | 15K |
| `assets/shared/platformer/flag.glb` | Kenney platformer flag | 0.42×0.90×0.11 | — | colormap/texture: multiply material.color | 19K |
| `assets/shared/platformer/flowers.glb` | Kenney platformer flowers | 0.78×0.14×0.79 | — | colormap/texture: multiply material.color | 28K |
| `assets/shared/platformer/grass.glb` | Kenney platformer grass | 0.52×0.31×0.54 | — | colormap/texture: multiply material.color | 17K |
| `assets/shared/platformer/heart.glb` | Kenney platformer heart | 0.41×0.38×0.12 | — | colormap/texture: multiply material.color | 15K |
| `assets/shared/platformer/hedge.glb` | Kenney platformer hedge | 1.00×0.40×0.30 | — | colormap/texture: multiply material.color | 17K |
| `assets/shared/platformer/jewel.glb` | Kenney platformer jewel | 0.33×0.37×0.29 | — | colormap/texture: multiply material.color | 13K |
| `assets/shared/platformer/key.glb` | Kenney platformer key | 0.38×0.22×0.07 | — | colormap/texture: multiply material.color | 20K |
| `assets/shared/platformer/ladder.glb` | Kenney platformer ladder | 0.50×1.00×0.10 | — | colormap/texture: multiply material.color | 16K |
| `assets/shared/platformer/lever.glb` | Kenney platformer lever | 0.78×0.47×0.45 | toggle-on, toggle-off, toggle | colormap/texture: multiply material.color | 23K |
| `assets/shared/platformer/lock.glb` | Kenney platformer lock | 0.34×0.40×0.18 | — | colormap/texture: multiply material.color | 17K |
| `assets/shared/platformer/mushrooms.glb` | Kenney platformer mushrooms | 0.52×0.29×0.51 | — | colormap/texture: multiply material.color | 20K |
| `assets/shared/platformer/pipe.glb` | Kenney platformer pipe | 1.00×0.56×1.00 | — | colormap/texture: multiply material.color | 25K |
| `assets/shared/platformer/platform-ramp.glb` | Kenney platformer platform-ramp | 1.00×0.57×1.03 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/platform.glb` | Kenney platformer platform | 1.00×0.20×1.00 | — | colormap/texture: multiply material.color | 18K |
| `assets/shared/platformer/poles.glb` | Kenney platformer poles | 1.10×1.00×0.35 | — | colormap/texture: multiply material.color | 27K |
| `assets/shared/platformer/rocks.glb` | Kenney platformer rocks | 0.65×0.40×0.66 | — | colormap/texture: multiply material.color | 17K |
| `assets/shared/platformer/saw.glb` | Kenney platformer saw | 0.79×0.79×0.30 | — | colormap/texture: multiply material.color | 20K |
| `assets/shared/platformer/sign.glb` | Kenney platformer sign | 0.48×0.60×0.13 | — | colormap/texture: multiply material.color | 17K |
| `assets/shared/platformer/spike-block.glb` | Kenney platformer spike-block | 0.90×0.90×0.90 | — | colormap/texture: multiply material.color | 21K |
| `assets/shared/platformer/spring.glb` | Kenney platformer spring | 0.75×0.47×0.75 | — | colormap/texture: multiply material.color | 36K |
| `assets/shared/platformer/star.glb` | Kenney platformer star | 0.36×0.36×0.24 | — | colormap/texture: multiply material.color | 15K |
| `assets/shared/platformer/trap-spikes.glb` | Kenney platformer trap-spikes | 0.64×0.26×0.64 | show, hide, show-hide | colormap/texture: multiply material.color | 23K |
| `assets/shared/platformer/tree-pine.glb` | Kenney platformer tree-pine | 0.95×2.00×0.95 | — | colormap/texture: multiply material.color | 26K |
| `assets/shared/platformer/tree.glb` | Kenney platformer tree | 1.09×1.93×1.11 | — | colormap/texture: multiply material.color | 40K |


## Space

Preview: `assets/shared/preview-space.jpg`

### space/q-space — Ultimate Space Kit (Quaternius, CC0, <https://quaternius.com/packs/ultimatespacekit.html>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/space/base-large.glb` | Space kit Base_Large | 8.53×4.97×8.53 | Atlas | 119K |
| `assets/shared/space/bush-1.glb` | Space kit Bush_1 | 3.25×2.48×0.98 | Atlas | 76K |
| `assets/shared/space/geodesic-dome.glb` | Space kit GeodesicDome | 8.53×5.28×8.53 | Atlas | 84K |
| `assets/shared/space/house-cylinder.glb` | Space kit House_Cylinder | 5.61×4.32×5.61 | Atlas | 48K |
| `assets/shared/space/pickup-bullets.glb` | Space kit Pickup_Bullets | 0.83×0.84×0.28 | Atlas | 26K |
| `assets/shared/space/pickup-crate.glb` | Space kit Pickup_Crate | 0.87×0.86×0.90 | Atlas | 69K |
| `assets/shared/space/pickup-health.glb` | Space kit Pickup_Health | 0.97×1.00×0.44 | Atlas | 42K |
| `assets/shared/space/pickup-jar.glb` | Space kit Pickup_Jar | 0.69×1.02×0.69 | Atlas | 16K |
| `assets/shared/space/pickup-key-card.glb` | Space kit Pickup_KeyCard | 1.04×0.67×0.09 | Atlas | 14K |
| `assets/shared/space/pickup-sphere.glb` | Space kit Pickup_Sphere | 0.89×0.89×0.89 | Atlas | 67K |
| `assets/shared/space/pickup-thunder.glb` | Space kit Pickup_Thunder | 0.97×0.86×0.88 | Atlas | 10K |
| `assets/shared/space/planet-1.glb` | Planet 1 | 3.78×3.93×3.80 | Atlas | 107K |
| `assets/shared/space/planet-10.glb` | Planet 10 | 5.74×4.68×5.74 | Atlas | 81K |
| `assets/shared/space/planet-11.glb` | Planet 11 | 5.59×5.67×5.74 | Atlas | 79K |
| `assets/shared/space/planet-2.glb` | Planet 2 | 3.80×3.81×3.84 | Atlas | 110K |
| `assets/shared/space/planet-3.glb` | Planet 3 | 3.62×3.65×3.38 | Atlas | 92K |
| `assets/shared/space/planet-4.glb` | Planet 4 | 4.49×4.09×3.96 | Atlas | 94K |
| `assets/shared/space/planet-5.glb` | Planet 5 | 4.23×4.52×4.03 | Atlas | 45K |
| `assets/shared/space/planet-6.glb` | Planet 6 | 3.76×3.75×3.76 | Atlas | 52K |
| `assets/shared/space/planet-7.glb` | Planet 7 | 4.81×2.87×4.46 | Atlas | 67K |
| `assets/shared/space/planet-8.glb` | Planet 8 | 3.45×3.75×3.75 | Atlas | 39K |
| `assets/shared/space/planet-9.glb` | Planet 9 | 3.82×3.75×3.81 | Atlas | 58K |
| `assets/shared/space/plant-1.glb` | Space kit Plant_1 | 1.80×2.18×0.64 | Atlas | 22K |
| `assets/shared/space/rock-1.glb` | Space kit Rock_1 | 3.10×3.61×2.83 | Atlas | 13K |
| `assets/shared/space/rock-2.glb` | Space kit Rock_2 | 2.74×2.71×2.52 | Atlas | 12K |
| `assets/shared/space/rock-3.glb` | Space kit Rock_3 | 3.30×3.83×3.01 | Atlas | 13K |
| `assets/shared/space/rock-4.glb` | Space kit Rock_4 | 2.16×3.46×1.70 | Atlas | 23K |
| `assets/shared/space/rock-large-1.glb` | Space kit Rock_Large_1 | 7.67×3.29×7.33 | Atlas | 13K |
| `assets/shared/space/rock-large-2.glb` | Space kit Rock_Large_2 | 8.54×8.21×7.62 | Atlas | 24K |
| `assets/shared/space/rock-large-3.glb` | Space kit Rock_Large_3 | 5.31×7.43×5.19 | Atlas | 23K |
| `assets/shared/space/rover-1.glb` | Space kit Rover_1 | 4.58×4.88×5.16 | Atlas | 320K |
| `assets/shared/space/rover-2.glb` | Space kit Rover_2 | 4.58×4.88×6.56 | Atlas.001 | 348K |
| `assets/shared/space/rover-round.glb` | Space kit Rover_Round | 5.79×5.17×3.69 | Atlas | 298K |
| `assets/shared/space/solar-panel-ground.glb` | Space kit SolarPanel_Ground | 1.29×1.10×1.67 | Atlas | 27K |
| `assets/shared/space/spaceship-bee.glb` | Spaceship (bee pilot) | 7.34×5.70×4.96 | Atlas | 210K |
| `assets/shared/space/spaceship-flamingo.glb` | Spaceship (flamingo pilot) | 11.14×2.53×8.66 | Atlas | 132K |
| `assets/shared/space/spaceship-frog.glb` | Spaceship (frog pilot) | 11.62×3.06×4.11 | Atlas | 147K |
| `assets/shared/space/spaceship-red-panda.glb` | Spaceship (red-panda pilot) | 9.95×2.35×11.17 | Atlas | 85K |
| `assets/shared/space/tree-blob-1.glb` | Space kit Tree_Blob_1 | 3.86×5.88×3.86 | Atlas | 166K |
| `assets/shared/space/tree-floating-1.glb` | Space kit Tree_Floating_1 | 2.09×4.61×0.83 | Atlas | 78K |
| `assets/shared/space/tree-lava-1.glb` | Space kit Tree_Lava_1 | 1.20×3.24×1.20 | Atlas | 43K |
| `assets/shared/space/tree-light-1.glb` | Space kit Tree_Light_1 | 2.63×3.76×1.96 | Atlas | 70K |
| `assets/shared/space/tree-spiral-1.glb` | Space kit Tree_Spiral_1 | 2.36×4.49×2.23 | Atlas | 30K |

### space/kenney-space — Kenney Space Kit (Kenney, CC0, <https://kenney.nl/assets/space-kit>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/space/k-craft-cargo-a.glb` | Kenney space craft_cargoA | 1.60×0.80×2.45 | metalDark, dark, metalRed, metal | 14K |
| `assets/shared/space/k-craft-miner.glb` | Kenney space craft_miner | 1.80×0.70×2.60 | dark, metalDark, metal, metalRed | 20K |
| `assets/shared/space/k-craft-racer.glb` | Kenney space craft_racer | 1.20×0.75×2.03 | metal, metalDark, dark, metalRed | 15K |
| `assets/shared/space/k-craft-speeder-a.glb` | Kenney space craft_speederA | 2.00×0.80×2.10 | metal, metalRed, dark, metalDark | 16K |
| `assets/shared/space/k-craft-speeder-b.glb` | Kenney space craft_speederB | 2.00×0.60×2.03 | metal, metalRed, metalDark, dark | 15K |
| `assets/shared/space/k-craft-speeder-c.glb` | Kenney space craft_speederC | 2.80×0.60×1.93 | metalRed, metalDark, metal, dark | 16K |
| `assets/shared/space/k-craft-speeder-d.glb` | Kenney space craft_speederD | 2.80×0.90×2.23 | metal, metalDark, dark, metalRed | 17K |
| `assets/shared/space/k-crater-large.glb` | Kenney space craterLarge | 0.89×0.12×0.89 | rockDark, rock | 4K |
| `assets/shared/space/k-crater.glb` | Kenney space crater | 0.71×0.12×0.83 | rockDark, rock | 4K |
| `assets/shared/space/k-hangar-round-glass.glb` | Kenney space hangar_roundGlass | 3.27×1.40×2.83 | metalRed, metalDark, _defaultMat, dark | 7K |
| `assets/shared/space/k-meteor-detailed.glb` | Kenney space meteor_detailed | 0.87×0.73×0.82 | rockTrack | 11K |
| `assets/shared/space/k-meteor-half.glb` | Kenney space meteor_half | 0.87×0.37×0.75 | rockTrack | 3K |
| `assets/shared/space/k-meteor.glb` | Kenney space meteor | 0.87×0.73×0.75 | rockTrack | 5K |
| `assets/shared/space/k-rock-crystals-large-a.glb` | Kenney space rock_crystalsLargeA | 0.83×0.54×0.92 | rockTrack, rock, crystal | 20K |
| `assets/shared/space/k-rock-crystals.glb` | Kenney space rock_crystals | 0.85×0.34×0.80 | rockTrack, rock, crystal | 19K |
| `assets/shared/space/k-rocket-base-a.glb` | Kenney space rocket_baseA | 1.80×1.60×1.80 | metalDark, metal, metalRed | 16K |
| `assets/shared/space/k-rocket-fuel-a.glb` | Kenney space rocket_fuelA | 1.00×0.50×1.00 | metalRed, metalDark | 5K |
| `assets/shared/space/k-rocket-top-a.glb` | Kenney space rocket_topA | 1.00×0.80×1.00 | metalDark, metalRed, _defaultMat, metal | 5K |
| `assets/shared/space/k-satellite-dish-detailed.glb` | Kenney space satelliteDish_detailed | 0.70×0.62×0.70 | metal, metalDark, _defaultMat, metalRed, dark | 20K |
| `assets/shared/space/k-turret-single.glb` | Kenney space turret_single | 0.60×0.90×0.72 | dark, metal, metalDark, metalRed | 24K |


## Minigolf

Preview: `assets/shared/preview-golf.jpg`

### golf/golf — Kenney Minigolf Kit (Kenney, CC0, <https://kenney.nl/assets/minigolf-kit>)

| file | description | size w×h×d | materials | KB |
|---|---|---|---|---|
| `assets/shared/golf/ball-blue.glb` | Minigolf ball-blue | 0.07×0.07×0.07 | colormap | 48K |
| `assets/shared/golf/ball-green.glb` | Minigolf ball-green | 0.07×0.07×0.07 | colormap | 48K |
| `assets/shared/golf/ball-red.glb` | Minigolf ball-red | 0.07×0.07×0.07 | colormap | 48K |
| `assets/shared/golf/block-borders.glb` | Minigolf block-borders | 1.00×0.15×0.50 | colormap | 11K |
| `assets/shared/golf/block.glb` | Minigolf block | 1.00×0.15×1.00 | colormap | 11K |
| `assets/shared/golf/bump-walls.glb` | Minigolf bump-walls | 1.00×0.15×1.00 | colormap | 17K |
| `assets/shared/golf/bump.glb` | Minigolf bump | 1.00×0.10×1.00 | colormap | 16K |
| `assets/shared/golf/castle.glb` | Minigolf castle | 1.00×0.65×1.00 | colormap | 20K |
| `assets/shared/golf/club-red.glb` | Minigolf club-red | 0.07×1.05×0.21 | colormap | 16K |
| `assets/shared/golf/corner.glb` | Minigolf corner | 1.00×0.15×1.00 | colormap | 11K |
| `assets/shared/golf/crest.glb` | Minigolf crest | 1.00×0.15×1.00 | colormap | 12K |
| `assets/shared/golf/end.glb` | Minigolf end | 1.00×0.15×1.00 | colormap | 11K |
| `assets/shared/golf/flag-blue.glb` | Minigolf flag-blue | 0.40×1.02×0.08 | colormap | 15K |
| `assets/shared/golf/flag-large-red.glb` | Minigolf flag-large-red | 0.30×1.02×0.08 | colormap | 15K |
| `assets/shared/golf/flag-red.glb` | Minigolf flag-red | 0.40×1.02×0.08 | colormap | 15K |
| `assets/shared/golf/gap.glb` | Minigolf gap | 1.00×0.15×1.00 | colormap | 13K |
| `assets/shared/golf/hill-corner.glb` | Minigolf hill-corner | 1.00×0.28×1.00 | colormap | 12K |
| `assets/shared/golf/hill-round.glb` | Minigolf hill-round | 1.00×0.23×1.00 | colormap | 19K |
| `assets/shared/golf/hole-round.glb` | Minigolf hole-round | 1.00×0.15×1.00 | colormap | 17K |
| `assets/shared/golf/hole-square.glb` | Minigolf hole-square | 1.00×0.15×1.00 | colormap | 13K |
| `assets/shared/golf/inner-corner.glb` | Minigolf inner-corner | 1.00×0.15×1.00 | colormap | 11K |
| `assets/shared/golf/narrow-block.glb` | Minigolf narrow-block | 1.00×0.15×1.00 | colormap | 13K |
| `assets/shared/golf/narrow-round.glb` | Minigolf narrow-round | 1.00×0.15×1.00 | colormap | 15K |
| `assets/shared/golf/obstacle-block.glb` | Minigolf obstacle-block | 1.00×0.15×1.00 | colormap | 13K |
| `assets/shared/golf/obstacle-diamond.glb` | Minigolf obstacle-diamond | 1.00×0.15×1.00 | colormap | 12K |
| `assets/shared/golf/obstacle-triangle.glb` | Minigolf obstacle-triangle | 1.00×0.15×1.00 | colormap | 13K |
| `assets/shared/golf/open.glb` | Minigolf open | 1.00×0.06×1.00 | colormap | 11K |
| `assets/shared/golf/ramp-large.glb` | Minigolf ramp-large | 1.00×0.65×2.00 | colormap | 29K |
| `assets/shared/golf/ramp-side.glb` | Minigolf ramp-side | 1.00×0.65×1.00 | colormap | 24K |
| `assets/shared/golf/ramp.glb` | Minigolf ramp | 1.00×0.65×1.00 | colormap | 29K |
| `assets/shared/golf/round-corner-a.glb` | Minigolf round-corner-a | 1.00×0.15×1.00 | colormap | 16K |
| `assets/shared/golf/side.glb` | Minigolf side | 1.00×0.15×1.00 | colormap | 11K |
| `assets/shared/golf/spline-default-curve.glb` | Minigolf spline-default-curve | 3.00×0.15×4.00 | colormap | 19K |
| `assets/shared/golf/spline-default-looping.glb` | Minigolf spline-default-looping | 2.00×4.00×3.98 | colormap | 33K |
| `assets/shared/golf/spline-default-straight.glb` | Minigolf spline-default-straight | 1.00×0.15×4.00 | colormap | 19K |
| `assets/shared/golf/split-t.glb` | Minigolf split-t | 1.00×0.15×1.00 | colormap | 12K |
| `assets/shared/golf/split.glb` | Minigolf split | 1.00×0.15×1.00 | colormap | 13K |
| `assets/shared/golf/start.glb` | Minigolf start | 1.00×0.15×1.00 | colormap | 12K |
| `assets/shared/golf/straight.glb` | Minigolf straight | 1.00×0.15×1.00 | colormap | 11K |
| `assets/shared/golf/support.glb` | Minigolf support | 0.40×1.00×0.40 | colormap | 11K |
| `assets/shared/golf/tunnel-narrow.glb` | Minigolf tunnel-narrow | 1.00×0.30×1.00 | colormap | 14K |
| `assets/shared/golf/tunnel-wide.glb` | Minigolf tunnel-wide | 1.00×0.30×1.00 | colormap | 13K |
| `assets/shared/golf/wall-left.glb` | Minigolf wall-left | 1.00×0.15×1.00 | colormap | 12K |
| `assets/shared/golf/wall-right.glb` | Minigolf wall-right | 1.00×0.15×1.00 | colormap | 12K |
| `assets/shared/golf/walls-to-open.glb` | Minigolf walls-to-open | 1.00×0.15×1.00 | colormap | 12K |
| `assets/shared/golf/windmill.glb` | Minigolf windmill | 1.20×1.56×1.00 | colormap | 27K |

