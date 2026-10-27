#!/usr/bin/env python3
"""Author object-sculpt-spec.json for the Jack Gacha machine from the starter spec.

Units: D = dome diameter = 1.0 world unit. Y up, +Z toward the viewer.
Measurements come from docs/assets/gacha-machine-ref.png (1200x1700): the dome is 650 px wide,
so 1 D = 650 px. Image-space pixel readings are noted inline as `px`.
"""
import json, math, sys

SPEC = sys.argv[1]
spec = json.load(open(SPEC))
# NOTE: run this against the LIVE spec, never a fresh starter copy, once passes have been
# reviewed: reviewHistory, sculptPipeline and the recorded Tier-1 results live in the spec
# and must survive a rebuild. This script only rewrites the authored sections below.

EV = "full-object"
ZONES = [f"zone-r{r}c{c}" for r in range(3) for c in range(3)]

def rgba(hexs, a=1.0):
    h = hexs.lstrip('#'); return f"rgba({int(h[0:2],16)}, {int(h[2:4],16)}, {int(h[4:6],16)}, {a})"

# ---------------------------------------------------------------- materials
def material(mid, name, hexc, roughness, cls, notes, *, secondary=None, transmission=None, overrides=None, flat=True):
    sec = secondary or hexc
    m = {
        "id": mid, "name": name,
        "type": "physical" if transmission else "standard",
        "shaderModel": "MeshPhysicalMaterial" if transmission else "MeshStandardMaterial / PBR approximation",
        "baseColor": hexc, "color": hexc,
        "albedo": {"dominant": hexc, "secondary": [sec], "samplingNotes": "Flat toon fill sampled from the reference region; no gradient except the dome glass."},
        "colorVariation": {"palette": [hexc, sec], "pattern": "flat", "amplitude": 0.0, "heightCorrelation": 0.0},
        "textureless": {"declared": flat, "reason": "Toon illustration: every surface is a flat fill with a hard outline; procedural mottling would contradict the reference."},
        "textureResolution": 1024,
        "textureProjection": {"mode": "uv", "repeat": [1.0, 1.0], "anisotropy": 4, "texelDensityIntent": "Flat fills; decals are placed by UV region, not tiled."},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 1.0, "amplitude": 0.0, "role": "none: flat fill"},
            {"id": "meso", "frequency": 8.0, "amplitude": 0.0, "role": "none: flat fill"},
            {"id": "micro", "frequency": 48.0, "amplitude": 0.02, "role": "faint highlight breakup so gloss parts do not read as a single pixel value"},
        ],
        "roughness": {"base": roughness, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "uniform; toon shading"},
        "metalness": {"base": 0.0, "variation": 0.0},
        "normal": {"pattern": "none", "strength": 0.0, "scale": 1.0, "space": "tangent"},
        "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0},
        "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": False},
        "ambientOcclusion": {"cavityStrength": 0.15, "contactShadowBias": 0.35, "notes": "Only at the dome/body seam, tray opening and under the crank disc."},
        "wear": {"edgeWear": 0.0, "scratches": [], "chips": []},
        "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"},
        "localOverrides": overrides or [],
        "flatShading": False,
        "shaderNotes": [
            "Toon look: flat albedo, a 2-step gradient-map toon ramp (MeshToonMaterial or a gradient map on the physical material) is acceptable at lighting-pass.",
            "Every mesh gets an inverted-hull outline shell (black, 0.013 D) and a second white shell (0.026 D) for the sticker halo; see root.localFeatures.outline-halo.",
        ],
        "notes": notes,
        "materialClass": cls,
    }
    if flat:
        # A textureless material may not also describe texture channels.
        for key in ("normal", "bump", "displacement", "surfaceFrequencyBands", "textureProjection", "textureResolution"):
            m.pop(key, None)
        m["textureless"]["evidence"] = [
            EV,
            "image-analysis.md Layer 6: palette is flat with no gradients except the dome glass; every zone crop shows a single fill value per part",
        ]
    if transmission:
        m["transmission"] = {"base": transmission}
        m["ior"] = {"value": 1.5}
        m["thickness"] = {"amount": 0.02}
        m["attenuationColor"] = "#DDEFFF"
        m["attenuationDistance"] = {"value": 2.0}
        m["envMapIntensity"] = 1.0
    return m

materials = [
    material("housing-cream", "Housing shell, off-white matte plastic", "#FFFDF5", 0.6, "plastic", "Body housing. px: fill inside the rounded rectangle 240..960 x 755..1215.", secondary="#F3F0E6"),
    material("floor-blue", "Capsule floor, light blue-grey", "#C9DCE8", 0.5, "plastic", "The disc the capsules rest on, visible through the dome bottom (px y 755..800).", secondary="#B7CBD9"),
    material("dome-glass", "Dome glass", "#EAF6FF", 0.05, "glass", "Transmissive sphere. The reference paints a white ellipse highlight upper-front-left and a blue tint toward the lower rim.", secondary="#BFE0FF", transmission=0.9, flat=True,
             overrides=[{"id": "glass-highlight", "kind": "gloss", "region": "upper-front-left of the sphere, ellipse 0.23 D x 0.11 D rotated -30 deg (px 365..520 x 240..330)", "roughness": 0.02, "notes": "Realised by a key light up-front-left; if the specular does not land there at lighting-pass, add a white decal ellipse.", "evidenceRefs": ["zone-r0c0"]},
                        {"id": "glass-rim-tint", "kind": "stain", "region": "lower 30% of the sphere", "patinaColor": "#BFE0FF", "dirtAmount": 0.0, "cavityBias": False, "notes": "Reference radial gradient stops: white 0%, white@45% alpha 35%, light blue@55% 70%, mid blue@70% 100%.", "evidenceRefs": ["zone-r1c0", "zone-r1c2"]}]),
    material("sticker-white", "Sticker white", "#FFFFFF", 0.45, "plastic", "Medallion frame ring, crank disc, capsule bottoms (hand-refined two-tone)."),
    material("outline-ink", "Outline ink", "#000000", 0.6, "plastic", "Black outlines, crank knob, capsule seams. Used by the inverted-hull outline shells.", secondary="#111111"),
    material("sign-yellow", "Sign plate yellow", "#FFC800", 0.6, "plastic", "Yellow rounded plate under the dome with black text.", secondary="#F2A900",
             overrides=[{"id": "jack-gacha-text", "kind": "decal", "region": "front face of sign-plate, centred, 80% of plate width", "text": "JACK GACHA", "font": "Lilita One, Arial Black", "textColor": "#000000", "rotationDeg": -2, "notes": "Canvas-rendered text texture on the +Z face only.", "evidenceRefs": ["zone-r2c1"]}]),
    material("medallion-face", "Medallion face with mascot decal", "#FFC800", 0.5, "plastic", "Yellow disc face; the mascot image is applied as a decal on the +Z cap.", secondary="#F2A900",
             overrides=[{"id": "mascot-decal", "kind": "decal", "region": "+Z cap of medallion, full disc", "imageSource": "docs/assets/mascot.jpg", "notes": "Hand-refined: TextureLoader on the cap only; the cylinder side stays yellow.", "evidenceRefs": ["zone-r0c1"]}]),
    material("crank-pink", "Crank bar pink", "#FF7A9E", 0.4, "plastic", "The pink rounded bar on the crank disc.", secondary="#F06A8E"),
    material("tray-dark", "Tray opening near-black", "#1A1A1A", 0.8, "plastic", "Dark chute opening at front-lower-left; a lighter lip (#3A3A3A) along the top edge.", secondary="#3A3A3A",
             overrides=[{"id": "tray-lip", "kind": "ridge", "region": "top 12% of the tray front face", "color": "#3A3A3A", "notes": "Lighter inner lip; realised as a thin box in hand refinement if the override alone does not read.", "evidenceRefs": ["zone-r2c0"]}]),
]
CAPSULE_COLOURS = {"pink": "#FF7A9E", "mint": "#5FE3B1", "sky": "#5BC8FF", "grape": "#B48CFF", "yellow": "#FFC800"}
for key, hexc in CAPSULE_COLOURS.items():
    materials.append(material(f"capsule-{key}", f"Capsule top, {key}", hexc, 0.3, "plastic",
        "Glossy toy plastic; coloured top hemisphere. The white bottom hemisphere and black equatorial seam are hand-refined (split SphereGeometry by thetaLength).",
        overrides=[{"id": f"capsule-{key}-highlight", "kind": "gloss", "region": "upper-left of each capsule, 0.05 D", "roughness": 0.1, "notes": "Specular from the key light.", "evidenceRefs": ["zone-r1c1"]}]))
materials.append(material("capsule-white", "Capsule bottom white", "#FFFFFF", 0.3, "plastic", "Bottom hemisphere of every capsule (hand-refined split)."))

# ---------------------------------------------------------------- components
def recipe(hexc, cls, note, sec=None):
    return {"dominantAlbedo": rgba(hexc), "secondaryAlbedo": rgba(sec or hexc), "materialClass": cls, "materialClassConfidence": 0.9, "evidence": [EV], "samplingNotes": note}

def action(role, pivot_pos, axis, *, rotate=False, translate=False, detach=False, collider="box", sockets=None):
    return {
        "animationRole": role,
        "pivot": {"mode": "explicit", "localPosition": pivot_pos, "axis": axis, "confidence": 0.8},
        "transformChannels": {"translate": translate, "rotate": rotate, "scale": False, "bend": False, "twist": False, "detach": detach, "visibility": True, "materialState": True},
        "sockets": sockets or [],
        "collider": {"type": collider, "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False, "notes": "Simple proxy matching the primitive."},
        "constraints": [],
        "destruction": {"breakable": False, "breakImpulse": 0.0, "fractureGroup": "", "debrisMaterial": "", "seamRefs": [], "detachableFragments": []},
    }

def comp(cid, name, level, role, prim, topo, rationale, dims, pos, mat, hexc, cls, note, *, parent="root", rot=(0,0,0), importance=0.7, conf=0.85, edge=None, attachment=None, features=None, act=None, extra_desc=None, evidence=None):
    d = {
        "id": cid, "name": name, "level": level, "role": role, "importance": importance, "confidence": conf,
        "primitive": prim, "topologyClass": topo, "topologyRationale": rationale,
        "geometryDescriptor": {
            "topologyIntent": extra_desc or "hard-surface toon prop",
            "edgeTreatment": edge or {"type": "none", "bevelRadius": 0.0, "segments": 1},
            "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry",
        },
        "parent": parent, "attachment": attachment,
        "dimensions": dict(dims, units="relative", confidence=conf),
        # No explicit scale: the generator treats transform.scale as authoritative and would
        # ignore `dimensions`; leaving it out bakes the dimensions into the geometry.
        "transform": {"position": list(pos), "rotation": list(rot)},
        "material": mat, "materialLayers": [mat],
        "colorMaterialRecipe": recipe(hexc, cls, note),
        "actionProfile": act or action("static-part", [0, 0, 0], [0, 1, 0]),
        "deformations": [], "joints": [], "seams": [],
        "localFeatures": features or [],
        "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.02, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "flat toon"},
        "evidenceRefs": evidence or [EV],
        "details": [], "fidelityTier": "blockout",
    }
    return d

def feat(fid, desc, level, conf=0.9, ev=None):
    return {"id": fid, "description": desc, "confidence": conf, "level": level, "evidence": ev or [EV]}

ROUND = {"type": "rounded", "bevelRadius": 0.08, "segments": 4}
SMALL_ROUND = {"type": "rounded", "bevelRadius": 0.02, "segments": 3}

components = []
# Housing: 1.1 D x 0.72 D x 0.75 D (depth inferred), centred at the origin. px 240..960 x 755..1215.
components.append(comp("root", "Housing body", "macro", "body", "box", "assembled-solid",
    "Rigid rounded-cuboid housing with countable flat faces; a box with a 0.08 D fillet.",
    {"width": 1.1, "height": 0.72, "depth": 0.75}, [0, 0, 0], "housing-cream", "#FFFDF5", "plastic",
    "Off-white fill of the housing (px 300,1000).", parent=None, importance=1.0, conf=0.9, edge=ROUND,
    act=action("root", [0, 0, 0], [0, 1, 0], rotate=True, translate=True, sockets=[
        {"id": "domeSeat", "localPosition": [0, 0.36, 0], "axis": [0, 1, 0], "notes": "dome rests here"},
        {"id": "crankAxle", "localPosition": [0, -0.13, 0.375], "axis": [0, 0, 1], "notes": "crank rotates about +Z"},
        {"id": "trayMouth", "localPosition": [-0.346, -0.194, 0.375], "axis": [0, 0, 1], "notes": "capsule exit"}]),
    extra_desc="rounded cuboid, fillet 0.08 D on all 12 edges",
    features=[
        feat("outline-halo", "Inverted-hull outline: black shell scaled +0.013 D and a white shell +0.026 D on every mesh (sticker language).", "micro", 0.95, ["zone-r1c0"]),
        feat("body-fillet", "0.08 D fillet on all housing edges, 4 segments.", "macro", 0.9, ["zone-r2c2"]),
    ]))
# Floor cup inside the dome seat: cylinder r 0.30, y 0.34..0.38 (overlaps housing top 0.36 by 0.02).
components.append(comp("collar", "Capsule floor cup", "meso", "seat-cup", "cylinder", "assembled-solid",
    "Short flat cylinder (cup) the capsules rest on; a real lathed solid, not relief.",
    {"width": 0.6, "height": 0.04, "depth": 0.6}, [0, 0.36, 0], "floor-blue", "#C9DCE8", "plastic",
    "Blue-grey band at the dome bottom (px 600,780).", importance=0.6, conf=0.75,
    attachment={"parentId": "root", "parentSocket": "domeSeat", "localStart": [0, 0.34, 0], "localEnd": [0, 0.38, 0], "baseRadius": 0.30, "endRadius": 0.30, "contactType": "butt-seat", "overlap": 0.02, "gapTolerance": 0.002, "evidenceRefs": [EV]},
    features=[feat("collar-floor", "Flat blue-grey top face at y=0.38 (root space) that the capsule row rests on; visible as a band through the glass.", "meso", 0.8, ["zone-r1c1"])],
    evidence=[EV, "zone-r1c1"]))
# Dome: full sphere D=1.0, centre y=0.78 so the bottom (0.28) dips 0.08 D into the housing top.
components.append(comp("dome", "Glass dome", "macro", "glass-dome", "sphere", "assembled-solid",
    "A true sphere primitive (px circle 280..930 x 155..805); not a sculpted organic form.",
    {"width": 1.0, "height": 1.0, "depth": 1.0}, [0, 0.78, 0], "dome-glass", "#EAF6FF", "glass",
    "Glass tint read from the upper-left of the dome away from the highlight (px 450,400).", importance=1.0, conf=0.9,
    act=action("static-part", [0, 0, 0], [0, 1, 0], collider="sphere"),
    extra_desc="UV sphere, 48x32 segments, transmissive",
    features=[feat("glass-highlight", "Single white specular ellipse 0.23 D x 0.11 D, rotated -30 deg, upper-front-left (px 365..520 x 240..330).", "meso", 0.9, ["zone-r0c0"])],
    evidence=[EV, "zone-r0c0", "zone-r1c1"]))
# Medallion: vertical disc 0.39 D diameter, 0.06 D thick, standing on top of the dome, face toward +Z.
components.append(comp("medallion", "Mascot medallion disc", "macro", "badge-disc", "cylinder", "assembled-solid",
    "Short cylinder (coin) with its axis along +Z so the sticker face looks at the camera.",
    {"width": 0.39, "height": 0.06, "depth": 0.39}, [0, 0.505, 0], "medallion-face", "#FFC800", "plastic",
    "Yellow of the medallion face around the mascot (px 520,130).", parent="dome", importance=0.9, conf=0.8,
    # px: medallion spans y 25..280, dome top at 155 -> the disc rises 0.2 D above the sphere and overlaps it by 0.19 D.
    attachment={"parentId": "dome", "parentSocket": "domeTop", "localStart": [0, 0.505, -0.03], "localEnd": [0, 0.505, 0.03], "baseRadius": 0.195, "endRadius": 0.195, "contactType": "overlap-embed", "embedDepth": 0.19, "gapTolerance": 0.002, "evidenceRefs": ["zone-r0c1"]},
    extra_desc="coin disc, axis +Z, rises 0.2 D above the sphere top and overlaps it by 0.19 D",
    features=[feat("mascot-decal-face", "Mascot image fills the +Z cap; yellow background; see materials.medallion-face.localOverrides.mascot-decal.", "meso", 0.95, ["zone-r0c1"])],
    evidence=[EV, "zone-r0c1"]))
# Medallion frame: white ring (torus in XY plane, faces +Z) at the disc's front edge.
components.append(comp("medallion-frame", "Medallion sticker ring", "meso", "frame-ring", "torus", "assembled-solid",
    "A ring is a torus; sits proud of the disc edge as the white sticker halo.",
    {"width": 0.433, "height": 0.433, "depth": 0.433}, [0, 0, 0.06], "sticker-white", "#FFFFFF", "plastic",
    "White ring around the medallion (px 460,130).", parent="medallion", importance=0.5, conf=0.8,
    extra_desc="torus, ring radius 0.195 D, tube 0.013 D (torusTubeRatio 0.03)", evidence=[EV, "zone-r0c1"]))
components[-1]["geometryDescriptor"]["torusTubeRatio"] = 0.03
# Sign plate: 0.54 D x 0.146 D x 0.02 D on the front face, rotated -2 deg. px 425..775 x 830..925.
components.append(comp("sign-plate", "Sign plate", "meso", "name-plate", "box", "assembled-solid",
    "Thin rounded rectangular plate with real thickness (sticker edge), stuck on the front face.",
    {"width": 0.54, "height": 0.146, "depth": 0.02}, [0, 0.172, 0.38], "sign-yellow", "#FFC800", "plastic",
    "Yellow plate fill (px 470,870).", rot=(0, 0, -0.0349), importance=0.8, conf=0.9, edge=SMALL_ROUND,
    features=[feat("sign-text", "Black 'JACK GACHA' display-face text centred on the plate; see materials.sign-yellow.localOverrides.jack-gacha-text.", "micro", 0.95, ["zone-r2c1"])],
    evidence=[EV, "zone-r2c1"]))
# Crank disc: axis +Z through the front face at (0, -0.13); protrudes 0.03 D. px disc 520..700 x 985..1165.
components.append(comp("crank-disc", "Crank disc", "macro", "crank-rotor", "cylinder", "assembled-solid",
    "Short cylinder (puck) on an axle through the front face; a discrete rigid part.",
    {"width": 0.28, "height": 0.03, "depth": 0.28}, [0, -0.13, 0.37], "sticker-white", "#FFFFFF", "plastic",
    "White disc fill (px 560,1050).", importance=0.9, conf=0.9,
    attachment={"parentId": "root", "parentSocket": "crankAxle", "localStart": [0, -0.13, 0.37], "localEnd": [0, -0.13, 0.405], "baseRadius": 0.14, "endRadius": 0.14, "contactType": "axle-socket", "embedDepth": 0.005, "gapTolerance": 0.002, "evidenceRefs": ["zone-r2c1"]},
    act=action("rotor", [0, 0, 0], [0, 0, 1], rotate=True, collider="cylinder"),
    extra_desc="puck, axis +Z; the crank-bar and knob are children so they rotate with it",
    evidence=[EV, "zone-r2c1"]))
# Crank bar: pink rounded bar 0.21 x 0.05 x 0.04, offset +X on the disc face.
components.append(comp("crank-bar", "Crank bar", "meso", "crank-arm", "box", "assembled-solid",
    "Rounded rectangular bar; a rigid lever, box with 0.02 D fillet.",
    {"width": 0.21, "height": 0.05, "depth": 0.04}, [0.045, 0.0, 0.035], "crank-pink", "#FF7A9E", "plastic",
    "Pink bar fill (px 590,1075).", parent="crank-disc", importance=0.8, conf=0.9, edge=SMALL_ROUND,
    act=action("rotor-child", [-0.045, 0, 0], [0, 0, 1], rotate=True),
    features=[feat("crank-bar-knob-offset", "Bar runs from 0.06 D left of the disc centre to 0.15 D right; the knob sits at the lateral end, so the assembly is visibly off-centre and reads as a handle when rotated.", "meso", 0.95, ["zone-r2c1"])],
    evidence=[EV, "zone-r2c1"]))
components.append(comp("crank-knob", "Crank knob", "micro", "knob", "sphere", "assembled-solid",
    "Small sphere cap at the bar's lateral end.",
    {"width": 0.07, "height": 0.07, "depth": 0.07}, [0.10, 0.0, 0.0], "outline-ink", "#000000", "plastic",
    "Black knob (px 645,1075).", parent="crank-bar", importance=0.6, conf=0.9,
    act=action("rotor-child", [0, 0, 0], [0, 0, 1], rotate=True, collider="sphere"),
    evidence=[EV, "zone-r2c1"]))
# Tray opening: approximated as a dark plate 0.23 x 0.154 x 0.06 whose front face is 0.004 D proud. px 300..450 x 1065..1165.
components.append(comp("tray-opening", "Tray opening plate", "macro", "chute-plate", "box", "assembled-solid",
    "Dark rectangular plate standing in for the chute mouth; a real recess (boolean cut into the housing) is deferred to form-refinement hand work and recorded as a risk.",
    {"width": 0.23, "height": 0.154, "depth": 0.06}, [-0.346, -0.194, 0.349], "tray-dark", "#1A1A1A", "plastic",
    "Near-black fill (px 375,1115).", importance=0.7, conf=0.85, edge={"type": "rounded", "bevelRadius": 0.03, "segments": 3},
    features=[feat("tray-lip", "Lighter (#3A3A3A) lip band along the top 12% of the opening.", "micro", 0.8, ["zone-r2c0"]),
              feat("tray-mouth", "0.23 D x 0.154 D opening at front-lower-left, ~0.1 D deep; rounded corners 0.03 D. Approximated as a proud dark plate until form-refinement.", "meso", 0.9, ["zone-r2c0"])],
    evidence=[EV, "zone-r2c0"]))

# Capsules: ten spheres, diameter 0.19 D, in dome-local space (dome centre = origin, floor at y=-0.40).
CAPS = [  # (colour, x, y, z)
    ("mint", -0.26, -0.305, 0.0), ("yellow", -0.087, -0.305, 0.05), ("pink", 0.087, -0.305, 0.05), ("sky", 0.26, -0.305, 0.0),
    ("pink", -0.18, -0.14, -0.05), ("mint", 0.0, -0.14, -0.08), ("sky", 0.18, -0.14, -0.05), ("grape", 0.36, -0.14, -0.05),
    ("grape", -0.09, 0.025, 0.02), ("yellow", 0.09, 0.025, 0.02),
]
for i, (colour, x, y, z) in enumerate(CAPS, 1):
    r = math.sqrt(x * x + y * y + z * z)
    assert r + 0.095 <= 0.5, (i, r)  # stays inside the glass
    components.append(comp(f"capsule-{i:02d}", f"Capsule {i} ({colour})", "meso", "toy-capsule", "sphere", "assembled-solid",
        "A toy capsule is a sphere; two-tone split and seam are material/hand-refined.",
        {"width": 0.19, "height": 0.19, "depth": 0.19}, [x, y, z], f"capsule-{colour}", CAPSULE_COLOURS[colour], "plastic",
        f"{colour} top-hemisphere fill, white bottom.", parent="dome", importance=0.7, conf=0.85,
        act=action("loose-capsule", [0, 0, 0], [0, 1, 0], translate=True, rotate=True, detach=True, collider="sphere"),
        extra_desc="sphere; thetaLength split at the equator into top (colour) and bottom (white) meshes at hand-refinement",
        features=[feat(f"capsule-{i:02d}-seam", "Black equatorial seam ring 0.01 D wide (thin torus or dark band).", "micro", 0.9, ["zone-r1c1"])] if i == 1 else [],
        evidence=[EV, "zone-r1c1"]))

spec["componentTree"] = components
spec["materials"] = materials
spec["repetitionSystems"] = [{
    "id": "capsule-set", "name": "Ten two-tone capsules", "level": "meso", "parent": "dome",
    "elementComponentIds": [f"capsule-{i:02d}" for i in range(1, 11)],
    "count": 10, "primitive": "sphere", "material": "capsule-pink",
    "instanceScale": [0.19, 0.19, 0.19],
    "placement": {"mode": "authored", "notes": "Positions authored per element in dome-local space: four on the floor (y=-0.305), four nested above (y=-0.14), two on top (y=0.025); colours cycle pink/mint/sky/grape/yellow as in the reference."},
    "distributionRule": "two loose rows resting on the floor cup, no two capsules overlapping, all inside the sphere (|p| + 0.095 <= 0.415)",
    "evidenceRefs": [EV, "zone-r1c1"],
}]

# ---------------------------------------------------------------- evidence, silhouette, camera, targets
spec["viewEvidence"] = [{
    "id": EV, "view": "primary", "imageRegion": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "units": "normalized"},
    "observations": [
        "Front elevation, orthographic toon illustration on a transparent background; 1 D (dome diameter) = 650 px.",
        "Stack: medallion disc (0.39 D) on a glass sphere (1.0 D) on a rounded housing (1.1 D x 0.72 D).",
        "Ten two-tone capsules in the lower half of the sphere; sign plate, crank disc and tray opening on the housing front.",
        "Every part carries a black outline and white sticker halo; one glass highlight ellipse upper-left; hard offset drop shadow lower-right.",
    ], "confidence": 0.9,
}] + [{
    "id": z, "view": "zone", "imageRegion": {"x": (i % 3) / 3, "y": (i // 3) / 3, "width": 1 / 3, "height": 1 / 3, "units": "normalized"},
    "observations": [f"grid-3x3 crop {z} of the primary view (3d/gacha-machine/di-zones/{z}.png)"], "confidence": 0.85,
} for i, z in enumerate(ZONES)]

spec["silhouette"] = {
    "boundingShape": "vertical stack: small disc on a sphere on a rounded cuboid; total height ~2.0 D, width 1.1 D",
    "aspectRatios": ["total width:height ~ 1.1:2.0", "housing width:height ~ 1.1:0.72", "housing width:depth ~ 1.1:0.75 (inferred)"],
    "symmetry": "bilateral about the vertical axis; the crank bar, tray and sign rotation break it slightly on the front face",
    "dominantCurves": ["full circle of the dome", "0.08 D fillets on the housing", "0.39 D medallion circle", "0.28 D crank disc circle"],
    "negativeSpaces": ["the concave notches where the sphere meets the housing top on both sides", "the dark tray opening"],
    "landmarks": ["sphere/housing seam at 0.08 D below the sphere bottom", "sign plate 0.02 D under the housing top", "crank disc centre 0.49 D below the housing top", "tray centre 0.35 D left of the axis"],
}
spec["referenceCamera"] = {"solved": False, "fovDegrees": 20.0, "aspect": 1200 / 1700, "orientation": {"yaw": 0.0, "pitch": 8.0, "roll": 0.0}, "positionHint": [0.0, 0.95, 6.2],
    "note": "Orthographic-like front elevation; review with a long lens (20 deg) from slightly above so the collar floor and disc caps read. Not solved: no projection route."}
spec["scores"] = {"object_isolation": 3, "silhouette_readability": 3, "depth_inference": 2, "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 2, "interaction_fit": 3}
spec["suitability"] = "conditional"
spec["qualityTargets"]["reviewViewpoints"] = ["front", "front-three-quarter-left", "side-right", "top", "rear"]
spec["qualityTargets"]["fpsTarget"] = 60
spec["performanceBudget"] = {"qualityPriority": "real-time-hero", "targetTriangles": 60000, "maxDrawCalls": 60, "textureSize": 1024, "fpsTarget": 60,
    "optimizationPolicy": "Hero prop on a landing page: keep under 60k triangles and 60 draw calls after outline shells; instance capsules if draw calls exceed budget."}
spec["featureReviewTargets"] = [
    {"id": "stack-silhouette", "name": "Disc-on-sphere-on-rounded-box stack and proportions", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["root", "dome", "medallion"], "evidenceRefs": [EV]},
    {"id": "capsule-system", "name": "Ten two-tone capsules resting inside the dome", "tier": "critical", "passIds": ["structural-pass", "form-refinement"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["capsule-01", "capsule-05", "capsule-09"], "evidenceRefs": [EV, "zone-r1c1"]},
    {"id": "front-face-hardware", "name": "Sign plate, crank disc+bar+knob, tray opening placement", "tier": "critical", "passIds": ["structural-pass", "form-refinement"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["sign-plate", "crank-disc", "crank-bar", "crank-knob", "tray-opening"], "evidenceRefs": [EV, "zone-r2c0", "zone-r2c1"]},
    {"id": "decals", "name": "Mascot medallion image and JACK GACHA text", "tier": "critical", "passIds": ["material-pass", "surface-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["medallion", "sign-plate"], "evidenceRefs": ["zone-r0c1", "zone-r2c1"]},
    {"id": "glass-and-toon", "name": "Transmissive dome with one highlight; flat toon fills with outline halo", "tier": "critical", "passIds": ["material-pass", "lighting-pass"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["dome", "root"], "evidenceRefs": [EV, "zone-r0c0"]},
    {"id": "crank-rotation", "name": "Crank disc/bar/knob rotate together about +Z; a capsule can detach and reach the tray", "tier": "important", "passIds": ["interaction-pass"], "minimumScore": 0.7, "mustPass": False, "componentRefs": ["crank-disc", "capsule-03"], "evidenceRefs": [EV]},
]
spec["lightingFromPhoto"] = [
    {"id": "key", "type": "directional", "direction": "upper-front-left (from the viewer's left, ~35 deg elevation, ~30 deg left of the view axis)", "color": "#FFFFFF", "intensity": 1.0, "evidence": "glass highlight ellipse upper-left; capsule highlights upper-left; drop shadow offset lower-right"},
    {"id": "fill", "type": "ambient", "direction": "omni", "color": "#FFF3C4", "intensity": 0.6, "evidence": "no dark side on any part; toon flat fills"},
    {"id": "contact-shadow", "type": "shadow", "direction": "offset lower-right", "color": "#000000", "intensity": 0.18, "evidence": "hard offset contact shadow / ground shadow under the housing and dome rim; small ambient occlusion only at the dome seam, tray mouth and under the crank disc"},
    {"id": "environment", "type": "environment", "direction": "omni", "color": "#FFF7D6", "intensity": 0.8, "evidence": "needed for the transmissive dome to read as glass (a warm studio room environment, no visible HDRI detail)"},
    {"id": "exposure-tonemapping", "type": "exposure", "exposure": 1.0, "toneMapping": "ACESFilmic", "background": "#FFC800 page yellow (transparent in the reference)", "evidence": "flat toon value range: exposure 1.0 with ACES filmic tone mapping keeps the saturated fills from clipping; shadow softness 0 (hard offset) to match the sticker drop shadow"},
]
# Unknowns are resolved here as explicit assumptions (strict validation refuses open unknowns).
spec["preSpecAssessment"]["unknownsToResolveBeforeImplementation"] = []
MAPS = {
    "d-medallion-decal": "medallion-face/mascot-decal",
    "d-dome-highlight": "dome-glass/glass-highlight",
    "d-outline-halo": "root/outline-halo",
    "d-capsule-seam": "capsule-01/capsule-01-seam",
    "d-capsule-highlight": "capsule-pink/capsule-pink-highlight",
    "d-collar-floor": "collar/collar-floor",
    "d-sign-decal": "sign-yellow/jack-gacha-text",
    "d-crank-bar-knob": "crank-bar/crank-bar-knob-offset",
    "d-tray-opening": "tray-opening/tray-mouth",
    "d-body-bevel": "root/body-fillet",
}
for d in spec["preSpecAssessment"]["detailInventory"]["details"]:
    d["mapsTo"]["ref"] = MAPS[d["id"]]
    d["mapsTo"]["type"] = "material.localOverrides" if d["mapsTo"]["ref"].split("/")[0] in {m["id"] for m in materials} else "component.localFeatures"
spec["assumptions"] = [
    "Housing depth 0.75 D is inferred (front view only); back face is plain.",
    "The dome is a full sphere whose bottom 0.08 D sinks into the housing top; the reference cannot distinguish this from a hemisphere on a cup.",
    "The medallion is a separate coin disc standing on the sphere with its face toward +Z, rising 0.2 D above the dome and overlapping the glass by 0.19 D (px 25..280 vs dome top 155).",
    "The tray opening is approximated as a dark plate at blockout/structural passes; a real recess is a form-refinement hand edit.",
    "Two-tone capsules and the black seam are realised at hand-refinement by splitting each SphereGeometry at the equator; the generator emits single-colour spheres.",
    "The mascot image is a supplied texture (docs/assets/mascot.jpg) applied to the medallion cap at hand-refinement; the generator emits a yellow cap.",
]
spec["risks"] = [
    "Transmission on the dome needs an environment map or the glass reads milky; lighting-pass must add one.",
    "Inverted-hull outlines double the draw calls; budget 60 draw calls assumes capsules are merged or instanced.",
    "The generator cannot emit split hemispheres, text canvases, image decals or boolean recesses: four hand-refinement edits that must be carried back into this spec's localOverrides/localFeatures notes.",
]
spec["proceduralStrategy"] = [
    "Block out the stack: rounded housing box, glass sphere, medallion coin, sign plate, crank disc, tray plate.",
    "Add the ten capsule spheres inside the dome, the floor cup, the crank bar + knob, the medallion ring.",
    "Hand-refine: split capsules into two hemispheres + seam, text canvas on the sign, mascot texture on the medallion cap, optional real tray recess.",
    "Material pass: flat toon fills, transmissive dome, gloss capsules; lighting pass: key up-front-left, warm fill, environment map, contact shadow; add inverted-hull outline shells.",
    "Interaction pass: crank rotor pivot (+Z), capsule detach path from the dome floor through the housing to the trayMouth socket.",
]
spec["coordinateFrame"] = {"front": "+Z (camera-facing side in the reference)", "up": "+Y (image up)", "scaleReference": "1 world unit = dome diameter D (650 px in the reference)"}
bp = {p["id"]: p for p in spec["buildPasses"]}
bp["blockout"]["componentRefs"] = ["root", "dome", "medallion", "collar", "sign-plate", "crank-disc", "tray-opening"]
bp["structural-pass"]["componentRefs"] = ["medallion-frame", "crank-bar", "crank-knob"] + [f"capsule-{i:02d}" for i in range(1, 11)]
for pid in ("form-refinement", "material-pass", "surface-pass", "lighting-pass", "interaction-pass", "optimization-pass"):
    bp[pid]["componentRefs"] = [c["id"] for c in components]
spec["lookDevTargets"]["materialPass"]["referencePbrExtraction"] = {
    "requiredWhenSourceImagePresent": False, "targetThreshold": 0.7, "stopOnLowConfidence": True,
    "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry",
    "skipReason": "The reference is a flat-colour toon illustration: every material is a solid fill (rule: solid albedo for flat paint). Scalar PBR values are set per material from sampled hex fills; see spec.risks and materials[].textureless.",
}
json.dump(spec, open(SPEC, "w"), indent=2)
print("components", len(components), "materials", len(materials))
