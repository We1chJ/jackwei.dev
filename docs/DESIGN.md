# jackwei.dev — Design & Requirements

Living document for the personal-site revamp. Started 2026-10-09.
Updated as decisions are made; see the Decisions log at the bottom.

## Vision

A personal website that says three things at once:

1. **I build a lot of personal projects.**
2. **I'm a delightful person.**
3. **I'm a prankster with a sense of humor.**

Tone: colorful, playful, game-like — "almost a web game." Manga / anime
influences are welcome. 3D components are welcome where they earn their place.
The site should *not* read as "cool and minimal."

Mascot: the profile icon ("Yellow Jack") should appear prominently.

## Mascot: Yellow Jack

Reference: `docs/assets/mascot.jpg` (886×886 JPG, the current profile icon).

What it is: a white, round, sticker-style character with a shocked face —
huge mismatched googly eyes, a wide-open pink mouth with teeth, and a small
green sprout growing out of the top of its head. Thick black outlines, flat
colors, a white sticker border, on a solid yellow background.

What that means for the site:

- **Style anchor.** Thick outlines + flat fills + white sticker edge = the
  whole site's visual language. UI elements (buttons, cards, speech bubbles)
  should look like stickers from the same sheet.
- **Yellow is the brand color.** Pull the exact yellow from the image for the
  primary background / accent.
- **The character is white, not yellow.** "Yellow Jack" refers to the
  background; keep that in mind when designing on non-yellow surfaces.
- **One expression today.** The icon is "shocked/gasp." For a mascot system
  we will want a small set of expressions drawn in the same style, e.g.:
  neutral/idle, happy, annoyed (for the 10-click easter egg), sad/sulking
  (for Boring Mode), smug (for secrets found), dizzy (after a crank/roll).
  Open question: who draws these — Jack, a commissioned artist, or
  generated-then-cleaned-up?
- **The sprout is a hook.** Ideas: it wiggles on hover, grows as the visitor
  collects more projects, is the loading spinner, or gets watered by the
  Konami code.
- **Need a transparent version.** The JPG has the yellow baked in. For use
  over other backgrounds we need a PNG/SVG with alpha. If an SVG source
  exists, that is ideal (scales, recolors, animates per-part).

## Confirmed features (things Jack likes)

### Boring Mode toggle

A button that switches the whole site to a clean, plain resume view.

- **Why:** gives recruiters and other time-pressed visitors a safe exit from the
  playful experience without leaving the site.
- **The toggle itself is a joke.** Label ideas: "Boring Mode (sad)",
  "Boring Mode 😔", "I'm a recruiter, make it stop."
- Boring Mode should be a *real* resume: real HTML text, working links,
  a "Download PDF" button, readable on mobile, good for SEO and screen readers.
- The toggle must be easy to find from anywhere on the site (persistent in a
  corner, or the very first thing a visitor can click).
- Remember the choice (localStorage) so the mode survives reloads.
- Open question: should Boring Mode still carry a tiny bit of personality
  (e.g. Yellow Jack sulking in a corner), or be 100% plain?

### Secrets and easter eggs

Hidden rewards for visitors who poke around. These are the "prankster" layer.

- **Konami code** (↑↑↓↓←→←→BA) triggers something — a secret page, a
  mascot dance, a confetti storm, or a joke "cheat mode."
- **Click the mascot 10 times** — Yellow Jack reacts (gets annoyed, falls
  over, swaps to an alternate costume, or unlocks a bonus project).
- **"Shiny" rare drops** — whatever the project-roll mechanic ends up being,
  some rolls are shiny: a sparkle animation, an alternate card foil, and a
  joke entry (e.g. "Jack's sleep schedule — 0 stars").
- Keep a small, growing list; each egg should be cheap to add. Consider a
  hidden "secrets found: 2/7" counter so people know there is more to find.

## Candidate ideas (brainstormed, not yet decided)

Kept here so they are not lost. Promote to "Confirmed" when chosen.

- **The Jack Gacha** — a 3D capsule machine on the home page. Crank it, a
  capsule drops, a project card pops out with a rarity. A "Jackdex" tracks
  which projects you've collected.
- **Manga / webtoon layout** — the site reads as a manga: panels, halftones,
  speed lines, SFX text, speech bubbles, chapters for bio / projects / bonus.
- **JackOS fake desktop** — retro-OS UI; projects are folders and .exe files,
  Yellow Jack as a Clippy-style assistant, "Lucky Dip.exe" for a random project.
- **Pokémon-style overworld** — walk around a small town; buildings are
  projects; random encounters in tall grass reveal a project.
- **Prank Lab desk** — isometric 3D desk full of clickable objects, each a
  project; "do NOT press" button; fake popups.
- **Visual novel** — dialogue-box interface with Yellow Jack sprite and
  branching choices leading to projects and "endings."
- **Tiny planet** — cozy low-poly planet you spin; projects are houses;
  fishing mini-game to catch a project.

Roll mechanics to pick from: capsule machine, claw machine, slot machine,
booster pack, scratch-off, fortune cookie, spin wheel, pachinko, loot box.

Cross-cutting: rarity/stats for projects, sound off by default, cel-shaded
look with yellow as the anchor color, lazy-loaded 3D, mobile fallback,
project data in one file.

## Mockups (2026-10-09)

Five home-page concepts, one per candidate idea, in `docs/mockups/`. Each has
the mascot, a random project roll, a secrets counter, and a Boring Mode toggle.
Open `docs/mockups/index.html` for the list.

| # | File | Concept | Type pairing | Published |
|---|------|---------|--------------|-----------|
| 1 | `01-gacha.html` | Jack Gacha capsule machine | Lilita One + Nunito | (artifact deleted; open the file) |
| 2 | `02-manga.html` | Vertical manga / webtoon | Bangers + Shantell Sans | https://claude.ai/artifact/FgCkHvwab44jB9pjNkbXKC |
| 3 | `03-jackos.html` | JackOS 95 retro desktop | Pixelify Sans + VT323 | https://claude.ai/artifact/KG5NUaoCPiBQUSr3xqrn7n |
| 4 | `04-visual-novel.html` | Visual novel conversation | Dela Gothic One + M PLUS Rounded 1c | https://claude.ai/artifact/QmL5obv1qKPaiU5ZGRTRpH |
| 5 | `05-prank-lab.html` | Isometric Prank Lab desk | Fredoka + Figtree | https://claude.ai/artifact/UNEa4eqmCqHhT9m8JuzYaA |

Shared visual language across all five: thick black outlines, flat fills,
hard offset shadows (sticker look), yellow `#FFC800` as the brand color.

## Open questions

1. ~~Yellow icon: drawn character or filtered photo? Source file?~~
   Answered: drawn sticker-style character; see Mascot section. Still
   need: transparent/vector source, and extra expressions.
2. Primary audience: recruiters, startup founders, friends?
3. How many projects to feature? Which have images or live demos?
4. How much does mobile matter?
5. Hand-made art/3D assets, or generated / stylized primitives?

## Decisions log

- 2026-10-09 — Rebuild from scratch (do not extend the current PDF-magnifier app).
- 2026-10-09 — Boring Mode toggle is in.
- 2026-10-09 — Secrets and easter eggs (Konami code, mascot clicks, shiny drops) are in.
- 2026-10-09 — Mascot reference received; sticker/cel-shaded style with yellow as brand color.
- 2026-10-09 — Five mockups built and refined through two passes (desktop + phone layouts,
  interactive states). Boring Mode keeps a greyscale Jack "in time-out" on every page.
  Next step is Jack's pick of a direction before deeper polish.
- 2026-10-09 — **Direction chosen: Jack Gacha (mockup 1).** Requirement: the machine and
  the other hero objects must be real 3D (three.js), not CSS illustrations.
  Tooling: `img2threejs` skill installed (v2.0.0) for building procedural three.js
  models from reference images.
- 2026-10-09 — img2threejs blockout pass accepted (Tier 1 IoU 0.91; vision 0.74). Spec and
  evidence live in `3d/gacha-machine/`; generated factory in `src/models/gacha/`;
  headless review harness in `preview/gacha/` (built with `vite.preview.config.ts`).
  Remaining passes: structural → form → material → lighting → interaction → optimization.
- 2026-10-09 — Structural and form passes accepted (vision 0.76 / 0.78; Tier 1 IoU 0.90).
  Hand refinements live in `src/models/gacha/refineGachaMachine.ts` (two-tone capsules +
  seams, rounded housing/sign/tray, tray lip). **Decision (hybrid):** materials, outlines,
  decals, lighting and the crank/drop interaction are built by hand in the app from here;
  the spec is kept updated and the img2threejs gates stay available as checks.
- 2026-10-10 — **Realism + physics decided: "polished toy" (outlines kept) + Rapier.** The real
  app now lives in `src/` (Vite + React + react-three-fiber + @react-three/rapier); the old
  PDF-magnifier app moved to `legacy/`. Hero scene: `src/scene/GachaScene.tsx`; look-dev
  (PBR plastics, transmissive glass, outline shells, mascot + sign decals): `src/models/gacha/materialize.ts`.
  Interactions: drag the pink handle (inertia) or press "Crank it"; one full turn jostles
  the capsules and delivers one through the chute to the tray; the card and Jackdex update.
  Headless verification harness: `scripts/headless-check.mjs` (CDP, real time).
- 2026-10-27 — **"Insert coin" loading screen + startup performance.** A tiny entry (4 KB JS) paints a
  sticker-style loader instantly (markup in `index.html`, logic in `src/loader.ts`): a coin rolls along
  a ramp with real download progress, then drops into the slot and the screen splits open like the
  machine door (auto-enter, no click). The 3D app loads lazily (`src/boot.tsx`; react/three/rapier in
  separate cached chunks). Behind the loader, `src/gacha/Warmup.tsx` compiles shaders, settles the
  capsule pile instantly and finishes the floor-shadow bake, so the first visible frame is smooth.
  Pixel density capped at 1.5x with automatic drop to 1x on slow frames.
- 2026-10-28 — **Arcade room: claw, gacha and vending side by side** in one scene (`src/arcade/`); the
  camera glides between them (tabs, or click a machine). Shared prize choreography
  (`src/arcade/present.ts`: anticipation, Bezier pop with spin-down, squash-and-stretch landing) and a
  sparkle particle pool (`src/arcade/Sparkles.tsx`), used by all three machines.
  - **Vending (`src/vending/`)**: "JACK CARDS" spiral-coil machine. Working keypad (letter + number, CLR, ★ =
    random) with an LED screen; also typeable. The coil turns, the front card tips off the shelf and falls
    with Rapier physics into the bin. Items are graded holo project cards (iridescent foil in acrylic slabs,
    from `src/data/projects.ts`); the held card shows the project in an info panel.
  - **Claw (`src/claw/`)**: on-screen gamepad (joystick + DROP). Gantry with limited acceleration, claw on a
    damped pendulum, physical fingers; random-strength grip so prizes can slip. Prizes: Yellow Jack
    plushies (one shiny gold), prize chute and door.
  - **Gacha**: eased, overshooting flap; capsule pop-out with anticipation, arc, spin and landing wobble.
- 2026-10-28 — **Quality pass on the claw and vending machines** (procedural; Sketchfab models declined for now).
  No extra on-screen UI: the claw is played with its own 3D joystick (drag it; it springs back) and DROP
  button, with a red aim ring under the claw and MOVE/DROP printed on the panel. Camera framings are close
  ("main"), and glide to a "pickup" close-up while a prize waits (`VIEW` in `src/arcade/layout.ts`).
  Added mechanical detail (gantry belt/pulleys/winch spool, claw spring/solenoid/linkages, coin doors, bill
  acceptor, lock, vents, gaskets, side wraps) and guidance glows (key attract wave, row/slot highlight,
  bin and prize-door glow, scrolling LED). One shared interior point light follows focus: every light costs
  on every surface, and per-machine lights dropped the arcade to ~42 fps.

### 2026-10-28: Quieter loader, split reveal, full-height gacha
- Loader is now a hairline bar on near-black, replacing the CSS-3D coin and steel plate: the arcade is the show, the loader should not compete with it. Fun comes from motion instead: wordmark letters drift in and shimmer; a 3D gold coin (embossed faces, stacked discs for thickness, a fixed sheen) falls in from the top tumbling, bounces onto the left end of the sloped line (the line dips, sparks fly) and rolls down it with the progress; the percentage is an odometer whose strips only roll forward.
- Reveal: the coin hops and drops edge-on into a coin slot (letters bounce), the line levels out, flashes and stretches edge to edge, and the screen splits along it (a bright slit, then the halves fly apart) while the arcade settles in with a slight push-in. WAAPI transform/opacity only. (A velvet-curtain version was tried first and dropped.)
- Tab title: a coin rolls along an underscore track (after bruno-simon.com 2019).
- Gashapon scaled 2.3x (0.8 m to 1.84 m) to stand level with the claw and vending machines: one scaled root group (@react-three/rapier scales colliders by world scale), Rapier-facing positions, velocities and the flap joint anchor converted with `SCALE`, and `gravityScale = SCALE` so drops keep real-size timing.

### 2026-10-28: Physical claw, push-flaps, true-scale capsule station
- Claw is fully physical: kinematic gantry carriage, the head hanging on a Rapier rope joint (length set through the raw joint limit, since the JS API exposes no setter), touchdown detected by rope slack, three dynamic fingers on force-based revolute motors. The motor target is kept within REACH of each finger, capping the squeeze at K*REACH like a coil's pull, so fingers grip but can't crush through a plushie. Strong pickup, weaker carry (varies +-20% per play). No grip spring, no slip dice: in automated trials with +-3 cm aim error it wins about 3 in 8.
- Rapier JS 0.14 silently drops revolute joint limits at creation (only prismatic reads them); every hinge now calls setLimits once the joint exists.
- All three prize trays use one push-flap (src/arcade/flap.ts): a dynamic panel on an inward-only hinge that hangs shut under gravity, follows a drag via a compliant motor, is held open by a reaching hand, and clacks with a small rebound. The prize is drawn out under it with its collider on, so it lifts the flap as it passes.
- A true-scale two-unit capsule station (wheeled base, stocked upper unit) was tried and dropped: the single scaled machine reads better as the centrepiece. The suggested Sketchfab model was not used (view-only, marked NoAI).


### 2026-10-29: Hero section, coin-to-enter, machines drop in
- The site opens on a hero: camera from the front-left (`VIEW.hero`) so the three machines recede diagonally across the right of the frame; "JACK WEI" on the left in thick bevelled, clear-coated enamel letters (three.js TextGeometry, a subset of Lilita One converted to a typeface JSON; renamed "Hero Display" because the OFL reserves the name for unmodified copies). The block is pinned to the hero frame by unprojecting a screen anchor. HTML below it: tagline and GitHub / résumé links; an sr-only h1 carries the name. Machines are decoration in the hero for now (`focus: 'hero'`, no tabs, no click-to-focus).
- Loader: no auto-enter. The coin waits at the end of the line; click it or drag it into the slot. That click turns sound on (browsers only start audio from a gesture). Plain caption ("Loading the arcade · 64%") replaces the rolling odometer, which read as garbled mid-roll.
- Drop: each machine's visuals ride a pivot group that free-falls, bounces and rocks on its base (Drop.tsx). The physics bodies never move: @react-three/rapier caches each body's parent inverse at creation, so a parent moved later carries the visuals rigidly while Rapier keeps simulating in place. The group must be at rest while the machine mounts and is lifted only once the scene is ready. Landing fires `impact`: synthesised slam per machine, dust puff, camera shake, and the real contents get jolted (capsules bounce, plushies hop, flap rattles).
- Floor shadows: the baked AccumulativeShadows layer was replaced. It baked machines that are not there yet, picked up meshes added after its scene scan (ghost letters) and darkened the floor far from the lights. Now: a ShadowMaterial floor for the key light's real-time shadows plus ContactShadows rendered live during the drop and frozen after.

### 2026-10-29: Mirrored hero, loader drawn as the hero in light
- Hero camera now from the front-right: the row starts big at the right edge and recedes toward the middle, meeting the name (which turns away to the right). Vending is nearest.
- Loader redesigned in one visual language, warm light on black, replacing a mix of plain text, typographic symbols, flat shapes and a 3D coin. It draws the hero itself as line-art: the three machines (main blocks, camera-facing faces only, painter-ordered, plus recognisable features) and the name (front-face contours of the 3D letters), projected with the hero camera. Placement maths lives in plain TypeScript (src/arcade/heroName.ts, silhouette.ts) shared by the loader and the 3D scene, so outlines match the real scene exactly. Progress is light rising through the outlines (a clipping window and its contents translate in opposite directions: transform-only). The coin, slot and line are line-art too, under the name.
- Reveal: outlines flare, the dark lifts (outlines stay), each machine drops into its own outline, which flashes out on landing; the name's outline gives way as the 3D letters stamp in. Parallax waits until everything has landed so outlines stay registered.
