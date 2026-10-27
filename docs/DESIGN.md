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
