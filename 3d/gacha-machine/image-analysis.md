# Image analysis — Jack Gacha capsule machine

Reference: `docs/assets/gacha-machine-ref.png` (1200×1700 render of the mockup's CSS machine,
front elevation, orthographic-like, flat toon lighting). Intended use: real-time browser hero
prop, interactive (crank rotates, one capsule drops into the tray), target < 60k triangles.

Object-space convention: Y up, +Z toward the viewer (front), X lateral. Reference dimension:
**dome diameter D = 1.0** (world units); everything below is relative to D.

## Layer 1 — Identification

- Work type: **capsule-toy vending machine (gashapon)**, stylized sticker/toon illustration.
- Broad class: mechanical appliance / toy.
- `primaryDomain`: `object` (the mascot medallion on top is a flat decal, not a character mesh).
- Confidence 0.95. Observation: this is a 2D illustration, not a photograph; all lighting is
  painted (one glass highlight ellipse, inner shadow on the dome). Inference: the 3D build should
  be **toon/cel-shaded with an outline pass**, not PBR-realistic.

## Layer 2 — Form & silhouette

- Bounding volume: a tall stack, bilateral symmetry about the vertical axis.
  - Dome: **sphere**, diameter D, centered on the axis.
  - Body: **rounded cuboid**, width ≈ 1.1 D, height ≈ 0.72 D, depth hidden (inference: ≈ 0.75 D),
    corner radius ≈ 0.08 D, top edge sits ≈ 0.08 D above the dome's lowest point so the sphere
    appears to rest in a collar.
  - Mascot medallion: **short cylinder / disc**, diameter ≈ 0.39 D, centered on top of the dome,
    overlapping the dome's top ≈ 0.12 D.
- Total height ≈ D + 0.72 D + 0.3 D (medallion) ≈ 2.0 D. Footprint ≈ 1.1 D × ~0.75 D.
- Shape language: geometric, soft (rounded edges everywhere).

## Layer 3 — Macro → meso → micro

**Macro**
1. `dome` — glass sphere.
2. `collar` — the flat light-blue disc where the dome meets the body (the capsule "floor"),
   diameter ≈ 0.95 D, visible as a thin band at the dome's bottom.
3. `body` — rounded cuboid housing.
4. `medallion` — circular sticker frame on top with the mascot image.
5. `capsules` — ten two-tone spheres inside the dome, diameter ≈ 0.19 D each.

**Meso**
- `dome.rim` — black outline + white sticker halo + black outer line (three concentric rings).
  Inference: model as a torus rim at the dome equator-to-collar seam, plus an outline pass.
- `dome.highlight` — one painted white ellipse upper-front-lateral (≈ 0.23 D × 0.11 D), rotated
  ≈ −30°. In 3D this becomes a specular highlight from a key light up-front-left.
- `body.sign` — yellow rounded rectangle plate, ≈ 0.48 D × 0.13 D, rotated −2°, with black text
  "JACK GACHA" (display face). Sits on the body's front face just under the collar.
- `body.crank` — white disc ≈ 0.28 D diameter, black outline, with a horizontal pink bar
  (≈ 0.21 D × 0.05 D, rounded ends) and a black sphere knob (≈ 0.07 D) at its lateral end.
  Center at ≈ 0.55 of body height. Inference: the disc is a short cylinder protruding ≈ 0.03 D
  from the front face; the bar and knob protrude further (≈ 0.05 D) — this is the interactive part.
- `body.tray` — dark rounded rectangle opening ≈ 0.25 D × 0.17 D at the front-lower-left of the
  body, with a lighter inner lip at the top. Inference: a recessed chute opening ≈ 0.1 D deep.
- `capsule.seam` — black equatorial line splitting each capsule into a colored top hemisphere and a
  white bottom hemisphere.
- `capsule.highlight` — small white inset highlight on the upper-left of each capsule.

**Micro**
- `outline` — every silhouette and part boundary carries a uniform black line (≈ 0.013 D) and most
  carry an extra white "sticker" halo (≈ 0.013 D) outside the black line.
- `drop-shadow` — a hard offset shadow (dark, 18% opacity) below-right of the body and dome rim.
  Inference: a directional key light up-front-left; the shadow can be a ground contact shadow.

## Layer 4 — Spatial relationships

- `<dome, rests-in, collar>` contact: overlap (sphere intersects the collar plane).
- `<collar, flush-with, body.top>` contact: butt.
- `<medallion, attached-to, dome.top>` contact: overlap (disc partly sinks into the sphere).
- `<capsules, inside, dome>` contact: resting on the collar plane, loosely packed, two rows.
- `<sign, attached-to, body.front>` contact: overlap (thin plate on the face).
- `<crank, embedded-in, body.front>` contact: socket (axle through the face).
- `<tray, embedded-in, body.front>` contact: embed (recess).

## Layer 5 — Materials (PBR terms, but toon-rendered)

| Component | Albedo | Metalness | Roughness | Translucency | Notes |
|---|---|---|---|---|---|
| dome | very light cyan-white tint | 0 | 0.05 | transparent (transmission ≈ 0.9) | slight blue tint toward the lower rim; thickness ≈ 0.02 D |
| collar | light blue-grey (#C9DCE8) | 0 | 0.5 | opaque | |
| body | off-white (#FFFDF5) | 0 | 0.6 | opaque | matte plastic |
| medallion.frame | white ring + black ring | 0 | 0.5 | opaque | |
| medallion.face | yellow (#FFC800) with the mascot decal | 0 | 0.5 | opaque | **decal: use the mascot image as a texture** |
| sign | yellow (#FFC800) | 0 | 0.6 | opaque | black text decal |
| crank.disc | white | 0 | 0.4 | opaque | |
| crank.bar | pink (#FF7A9E) | 0 | 0.4 | opaque | |
| crank.knob | black (#000) | 0 | 0.4 | opaque | |
| tray | near-black (#1A1A1A) | 0 | 0.8 | opaque | inner lip lighter |
| capsule.top | one of pink #FF7A9E, mint #5FE3B1, sky #5BC8FF, grape #B48CFF, yellow #FFC800 | 0 | 0.3 | opaque | glossy plastic |
| capsule.bottom | white | 0 | 0.3 | opaque | |
| outlines | black | — | — | — | outline pass / inverted-hull |

Observation: no metals anywhere. Observation: the dome's interior shows a warm yellow tint
because the yellow page shows through; in 3D this is environment color, not albedo.

## Layer 6 — Color & finish

- Palette is flat (no gradients) except the dome: radial gradient from white (upper-left, 0%) →
  white 45% alpha (35%) → light blue 55% alpha (70%) → mid blue 70% alpha (100%).
- Finish: matte to satin plastics; capsules gloss; dome glass.

## Layer 7 — Identity-defining features

1. Black outline + white sticker halo on every part (the whole visual language).
2. Mascot medallion on top (the character decal).
3. Two-tone capsules with a black equatorial seam, in exactly five colors.
4. "JACK GACHA" yellow sign plate, slightly rotated.
5. Pink crank bar with black knob on a white disc.
6. Single large glass highlight ellipse upper-left of the dome.
7. Dark tray opening at lower-left of the body.

## Layer 8 — Uncertainty / what the single view hides

- **Hidden:** body depth; back face; whether the dome is a full sphere or a hemisphere on a cup
  (assume full sphere, lower part inside the collar); crank axle; tray chute interior; medallion
  thickness and whether it is a separate disc or painted on the dome (assume a separate disc on a
  short post).
- **Undetermined:** the collar's true shape (assume a shallow cylinder cup, diameter 0.95 D,
  height 0.06 D, with the blue floor on top).
- **Perspective:** none (orthographic illustration); 3D camera for review should be a slightly
  elevated front view (≈ 10° pitch) with a long lens to match.
- Everything above is stylized; the output is explicitly **approximate / toon**, not a replica of
  a real machine.
