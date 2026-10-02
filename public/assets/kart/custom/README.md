# Kart Chaos: custom karts and drivers

Put your own `.glb` models in this folder and list them in `karts.json` (same folder). Kart Chaos picks them up the
next time the game loads; no code changes or rebuild needed (for a production build, re-run `npm run build`, which
copies this folder into `dist/`). If `karts.json` is missing or broken, the game uses its built-in roster.

Custom karts appear at the end of the **KART** carousel on the phone (marked "custom"). An entry without a
`driver` is raced exactly as modelled (no seated character), so add a driver unless your kart model has one built in.
CPU racers also use custom karts to fill empty grid slots.

Only use models you are allowed to use (your own, or CC0/CC-BY). Don't use ripped game models.

## karts.json

```json
{
  "karts": [
    {
      "name": "Rocket Tub",
      "kart": "rocket-tub.glb",
      "driver": "my-racer.glb",
      "driverClip": "Sit",
      "scale": 1,
      "rotationY": 0,
      "offset": [0, 0, 0],
      "tintMaterial": "body|paint",
      "wheels": "wheel",
      "driverScale": 1,
      "driverOffset": [0, 0.22, -0.08],
      "stats": { "speed": 3.5, "accel": 3, "handling": 3, "weight": 3, "turbo": 3 }
    }
  ]
}
```

| field | required | meaning |
|---|---|---|
| `name` | yes | Name shown on the phone, TV and results. |
| `kart` | yes | Kart model file in this folder. |
| `driver` | no | Rigged character file in this folder, seated in the kart. Without it the kart is shown as-is. |
| `driverClip` | no | Animation clip to loop (partial, case-insensitive name match). Falls back to `drive`, `sit`, `idle`. |
| `scale` | no | Extra scale after automatic fitting (default 1). |
| `rotationY` | no | Degrees to turn the kart so it faces **+Z** (forward). |
| `offset` | no | `[x, y, z]` nudge in kart units (1 unit ≈ the kart's length / 1.43). |
| `tintMaterial` | no | Regex matched against material or mesh names; matching parts take the player's paint colour. |
| `wheels` | no | Regex matched against node names; matching nodes spin. Names containing `front` + `left`/`right` also steer. |
| `driverScale` | no | Extra driver scale (the driver is first fitted to 0.8 kart units tall). |
| `driverOffset` | no | `[x, y, z]` seat position in kart units (default `[0, 0.22, -0.08]`). |
| `stats` | no | 0.5 to 6 for `speed`, `accel`, `handling`, `weight`, `turbo` (3 = average). Missing values use the Cruiser kart. |

## Model format

- **glTF binary (`.glb`)**, Y-up, metres, facing **+Z**. Draco/meshopt compression is not supported; export plain glb.
- Size doesn't matter: the kart is auto-scaled to the standard kart length and its lowest point is put on the road.
- Keep it light: under ~20k triangles and 2 MB per kart, with textures at most 1024×1024. Split screen draws every
  kart up to four times per frame.
- Wheels should be separate nodes with their pivot at the wheel centre if you want them to spin.
- Drivers need a skeleton and at least one animation (a sitting or idle clip looks best).
- Avoid transparent materials; they are forced opaque.
