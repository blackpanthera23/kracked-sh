# Submission — KD-COMM-01

Bounty: *Reimagine the community landing page.* Zero constraints. Any style, any format.
Reward: 3 × $150 AI tokens. Deadline 2026-10-18.

## Fields for the form

**Live**
https://blackpanthera23.github.io/kracked-sh/

**Code**
https://github.com/blackpanthera23/kracked-sh

**Title**
kracked.sh — a city that teaches the community by walking it

**One-liner**
Kracked Devs as a small isometric city: walk the dinosaur through real KD
destinations, collect supplies, put the fires out — or skip all of it and just
browse 535 shipped projects.

**Description (markdown)**

```markdown
Kracked Devs is a community *of developers* — so the landing page is a place
you walk, not a page you scroll.

## A briefing, not a prompt

You arrive at a small terminal briefing: **Start exploring**, **Browse without
playing**, **Use terminal**. Nothing is hidden behind a game: every KD
destination works on the first click.

## Kracked City

**Start exploring** opens one isometric Canvas 2D world joining three districts.

| District | Landmarks (live KD services) |
|---|---|
| Community | KD Square, Events & Hackathons, Members, Showcase, Bounties, KD Raid |
| School | AI Classes, Builders Sandbox, Learning portal, The Cave*, Hermes Malaysia* |
| Labs | Enroll Labs, My Lab, JomQR, Kuntum & Embun |

*labelled coming soon, with no invented link.*

Walk with WASD/arrows or tap the ground. Each district holds three water cells;
pick all three up and the dinosaur's hose can finally put that district's fire
out. Landmarks open their destination, so the taxonomy — community, school,
labs — is taught by the map instead of a menu.

## The same work, browsable

**Showcase** opens a real browser over the generated snapshot: search 535
projects by title, builder or stack, filter to one builder, load them all, and
follow real covers, live sites and repos. **Browse without playing** lists all
15 destinations as a directory.

## Craft

- **Zero runtime dependencies.** Production `dependencies` is empty.
- Hand-written CSS on a phosphor palette; the city is Canvas 2D with cached
  buildings and depth ordering — no WebGL, no engine, no asset downloads.
- City points are **local to your browser** and never pretend to be KD XP.
- Reduced motion keeps a static city: deliberate play still works, idle
  animation and camera easing do not.
- Search and command inputs keep Space, A/D and the arrow keys; gameplay only
  reads keys inside its focused canvas.
- Live at https://blackpanthera23.github.io/kracked-sh/ ·
  code at https://github.com/blackpanthera23/kracked-sh
```

**Classification**
- Staging level: `Launched`
- Event identifier: `Bounty — KD-COMM-01` (confirm against the form's event list)

**Tech stack** (max 5)
`Vite`, `TypeScript`, `Canvas 2D`, `CSS`, `GitHub Pages`

<!-- The terminal-era submission below is kept for history; the form fields
     above are the current build. -->

## Earlier build — the terminal-era submission

```markdown
Kracked Devs is a community *of developers*, so the landing page is a shell.

You arrive at a prompt, a boot sequence mounts `/dev/community`, and the whole
site becomes something you operate instead of scroll.

## Every section is a command

| Conventional page | kracked.sh |
|---|---|
| hero | ASCII banner + `motd` |
| about | `about` |
| team grid | `members` (filter by stack or role) |
| member profile | `whois <handle>` |
| job board | `bounties` → `cat bounty <id>` |
| portfolio | `showcase` → `open <project>` |
| values | `manifesto` |
| signup | `join` |
| community map | `attach` |

## The signature moment: `attach`

The terminal collapses and a canvas topology takes over — 22 builders, 42
collaboration edges, laid out by a spring/repulsion relaxation run once at load
then drifting on a slow orbit. Nodes are coloured by status (online / building /
away) and sized by power; hovering raycasts and lights every edge that builder
shares, with the profile in the HUD.

## Shell, not a mock

- Tab completion over the command registry **and** its arguments
- ↑/↓ history, Ctrl+L to clear, Ctrl+C to detach
- Levenshtein "did you mean" — `shocase` → `showcase`, `atach` → `attach`
- Idle 9 s and a demo types itself out, so the page always demonstrates itself
- Easter eggs: `sudo`, `rm`, `vim`, `matrix`, `.join`

## Craft

- **Zero runtime dependencies.** Production `dependencies` is empty.
- ~35 KB JS + 9 KB CSS — ~12 KB + 3 KB gzipped.
- Hand-written CSS: design tokens, CRT scanline/vignette/flicker layers.
- `prefers-reduced-motion` disables the flicker; the graph is `aria-hidden` with
  every fact reachable as text via `members` / `whois` / `showcase`.
- The canvas rAF loop stops entirely when you detach — no idle battery burn.
- Data in `src/data.ts` is a static snapshot from the live showcase
  (3,408 builders, 565 projects) plus a hand-written roster so profiles read real.
```

**Classification**
- Staging level: `Live`
- Event: `Bounty — KD-COMM-01`

**Tech stack** (max 5)
`Vite`, `TypeScript`, `Canvas 2D`, `CSS`, `GitHub Pages`

## Files

| File | What to do with it |
|---|---|
| `submit-01-cover.png` | **cover** — 22 builders, roles, stacks, power meters |
| `submit-02-members.png` | `whois` profile + bounty board |
| `submit-03-bounties.png` | full bounty brief + manifesto |
| `submit-04-showcase.png` | project showcase + power distribution |
| `submit-05-topology.png` | the `attach` layer, hover active |

All 1920×1080, PNG, largest 400 KB (cap is 4 MB).

## Run it

```bash
npm install && npm run dev     # http://localhost:5173
```