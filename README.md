# kracked.sh

A terminal-framed reimagination of the Kracked Devs community page, built for the
open creative bounty (deadline 18 Oct 2026).

Visitors land on a compact mission briefing, not a command prompt. **Start
exploring** opens Kracked City: a lightweight isometric world connecting
Community, School and Labs. **Browse without playing** opens the same 15 KD
destinations as a directory; nothing is locked behind gameplay. The Cave and
Hermes Malaysia are labelled Coming soon, without fake links.

Showcase opens the existing project browser: search by title, builder or stack,
load all 535 projects, and follow real screenshots, source and live-site links.

**Use terminal** opens the optional shell. **Back to browse** restores the current
search, builder filter, loaded cards and scroll position; terminal output and
history also survive view changes. No boot sequence or mobile keyboard interrupts
the welcome. In the shell, `attach` opens a canvas community topology.

`explore` opens the other world: a top-down ASCII city where every project is a
building you walk up to. `WASD` / arrows move, `Enter` goes inside, `Esc` leaves.

`sky` opens the third: the showcase as a night sky where **rarity is magnitude**.
535 projects are stars, one per `SHOWCASE` record, placed from a hash of the
author's handle so each builder's work lands as its own constellation. Brightness
and size come from `rarity`, so the rarest project in the community is literally
the brightest thing on screen — readable from across the map without reading a
word. Colour comes from the project's first stack tag, so a run of TypeScript
projects reads as one blue field. Drag to pan, scroll to zoom, click a star to
open that project, `Esc` to leave.

The dinosaur walks through KD's three districts, collecting three water cells
in each before its hose can extinguish that district's fire. Restored districts
light up; their landmarks lead to the corresponding KD service. The city is a
fictional local mission, not a live outage display or KD Raid. City points and
progress are local to this browser and never count as real KD XP.

## Why a shell

Kracked Devs is a community *of developers*. A terminal signals the audience
immediately and turns every conventional landing-page section into an
interaction the visitor performs rather than scrolls past:

| Landing-page section | Here |
|---|---|
| hero + tagline | ASCII banner + `motd` |
| about | `cat about` |
| team grid | `members` (filterable) |
| member profile | `whois <handle>` |
| job board | `bounties` / `cat bounty <id>` |
| portfolio | `showcase` / `open <project>` |
| values | `cat manifesto` |
| signup CTA | `join` |
| "community map" | `attach` → canvas topology |
| portfolio, again | `sky` → the showcase sorted by rarity |

## Commands

```
help                    list everything
whoami                  the operator behind this terminal
members [stack|role]    list builders, filterable
whois <handle>          full profile for one builder
bounties                open bounties and deadlines
cat bounty <id>         full bounty brief
showcase [filter]       browse shipped projects
open <project>          open one project
cat about|manifesto     read a document
attach                  enter the community topology layer
explore [project]       walk the city; each building is a project
sky [project]           the projects as stars; rarity is brightness
join                    how to become a builder
stats                   community numbers + power distribution
clear                   clear the screen
motd                    message of the day
exit                     there is no exit

the run
scan [project]          inspect a project        +15 xp, first time only
visit <project>         open its live site       +10 xp
repo <project>          open its source          +10 xp
follow <handle>         follow a builder         +10 xp
player                  your card: xp, level, elements
progress                your raw numbers
save                    print a transferable save code
load <code>             restore a run from a code
reset                   wipe the run

hidden: sudo, rm, vim, matrix, .join
```

Shell features: **Tab** completion (commands and arguments), **↑/↓** history,
**Ctrl+L** to clear, **Ctrl+C** to detach from the topology.

The city: **WASD** or arrows to walk, hold a key to keep walking, **Enter** to go
into the building you are standing at, **Esc** to leave. 420 projects are placed
as buildings; the rest stay reachable through `showcase`.

The sky: **drag** to pan, **scroll** or **+/−** to zoom, **0** to reset, pinch on
a touchscreen, **click** a star to open that project, **Esc** to leave. All 535
projects are placed.

Kracked City: **Start exploring** from the briefing, or **Explore city** from
the frame footer. The frame becomes a compact mission HUD over the full scene.

- **WASD / arrows** move; **tap or click the ground** follows a walkable route.
  Community, School and Labs buttons walk to that district without teleporting.
- Collect **three distinct water cells per district**. Each pickup awards 10
  local city points once. Before all three, the hose cannot extinguish its fire.
- Near the fire, hold **Space** or the **water** button for 2.4 seconds total.
  Partial spray progress survives release; an unlocked hose cannot run dry.
  Restoration awards 50 local points. All districts restored totals 240 points.
- Click a building or press **Enter** nearby to inspect its destination. The
  **Destinations** directory remains available anywhere, before collecting.
- **P / Pause** pauses; **Escape** closes a destination panel first, then exits
  the city and restores focus to the prior view. **Back to browse** also exits.
- **Replay city** resets the mission after all three districts are restored.
  Otherwise collected cells and restored districts survive leaving and reloads.

The game clears held input on blur, hidden tabs, cancelled touches and dialogs.
Reduced motion disables idle animation and camera easing, but deliberate play
still works. Search and command inputs never receive gameplay handlers.

In terminal mode only, 14 seconds of inactivity starts a guided demo. Typing,
switching to browsing or entering Kracked City cancels it.

## Stack

- **Vite 7** + TypeScript, zero runtime dependencies (production `deps` is empty)
- **Hand-written CSS** — design tokens, CRT scanline/vignette/flicker layers
- **Own shell**: tokenizer, command registry, history ring, completion
- **Canvas 2D** topology: golden-angle seed, spring/repulsion relaxation run once
  at load, slow orbital drift, hover raycast, status-coloured nodes
- **GitHub Pages** deploy workflow

The city uses Canvas 2D with cached terrain and building sprites, depth ordering
and capped device pixel ratio; no WebGL, 3D model downloads or physics engine.

Sound is **generated, never shipped**: `src/term/audio.ts` runs a Web Audio
look-ahead scheduler over a minor-pentatonic loop, plus short cues for water
cells, hose, restoration and blocked routes. It is off until the visitor presses
**Music**, the choice persists in `kracked-music-v1`, and it suspends when the
tab is hidden, the city is detached or the page unloads.

## Layout of the source

```
index.html            briefing, directory, browser and terminal frame, world roots
src/
  main.ts             view lifecycle, commands, focus, world integration
  style.css           tokens + frame + browsing + terminal + legacy worlds
  district-world.css  mission HUD, touch controls and destination dialog
  destinations.ts     verified public KD navigation URLs and descriptions
  browse.ts           project/browser filtering and pagination
  data.ts             community snapshot (members, bounties, projects, edges)
  term/
    shell.ts          tokenizer, history ring, Ctx contract
    output.ts         DOM output primitives (line, table, kv, pwrBar, tag…)
    commands.ts       command registry, banner, boot sequence
    graph.ts          canvas topology layer
    city.ts           walkable ASCII city, one building per project
    sky.ts            the showcase as a night sky; rarity is magnitude
    district-world.ts isometric city, navigation, supplies, fire and local progress
    audio.ts          procedural chiptune loop and event cues (Web Audio)
    progress.ts       the run: xp, elements, save/load
scripts/
  sync-showcase.mjs   regenerate src/showcase.ts from the live site
  test-city.py        drive the city in a real browser and assert it works
  test-sky.py         drive the sky in a real browser and assert it works
```

## Run

```bash
npm install
npm run dev              # http://localhost:5173
npm run build            # → dist/
npm run preview

npm run sync-showcase      # refresh src/showcase.ts from krackeddevs.com
npm run sync-showcase:dry  # show what a sync would change, touch nothing
```

### Testing the city

The city is a game, so it is tested by playing it, not by unit tests. Start a
Chrome with `--remote-debugging-port=9555`, serve the build, then:

```bash
npm run build
(cd dist && python3 -m http.server 5299) &
npm run test:city          # needs `websockets`
```

It opens the city, walks with WASD and the arrows, holds a key, walks into a
wall, walks to a project, taps a building to reach its door, opens it, and fails
non-zero on any console error. Screenshot of the final state: `/tmp/city-shot.png`.

### Testing the sky

The sky is an instrument, so it is tested by driving it. Same Chrome and server
as above, then:

```bash
npm run test:sky           # needs `websockets`
```

It opens the sky, checks one star per project and that the brightest star is the
rarest project (rarity 17), hovers a star, pans, zooms by wheel, keyboard and
two-finger pinch, checks the clamp, flies to a project, opens it, leaves with
`Esc`, and fails non-zero on any console error.

### Refreshing the showcase

`src/showcase.ts` is **generated** — do not hand-edit it. The site has no public
API, so the sync script reads the project list out of the page's React Server
Component payload and rewrites the file:

```bash
npm run sync-showcase
```

The same sync generates `src/showcase-images.ts` from the payload's `image_url`
cover field. To refresh covers without changing project IDs, order or saves:

```bash
npm run sync-showcase:images
```

The current cover snapshot includes 535/535 projects. Images load lazily from
their source URLs. Unknown image schema or zero usable covers aborts the sync.

It refuses to write when the result looks wrong rather than shipping a short
file: zero projects parsed, a drop of more than 20% against the previous
snapshot, or fewer than half the projects carrying a link all abort with a
non-zero exit. Run it after the community ships new projects, then `build`.

Because the game stores a run as **indices** into that table, a rebuild changes
what an index means. Save codes carry a fingerprint of the table they were
minted against, and a code or stored run from a different snapshot is refused
with an explanation instead of silently crediting the wrong projects.

## Data

`src/data.ts` is a static snapshot seeded from the live Kracked Devs community
plus a small hand-written roster so the profiles and collaboration edges read as
a real community rather than placeholder text.

`src/showcase.ts` is generated from the live site by `npm run sync-showcase`:
project id, title, author, the author's level, a one-liner, up to five stack
tags, the live/git links and the site's own rarity score. Numbers on screen are
the ones in those files — no invented telemetry.

## Accessibility & performance notes

- Output region is `role="log"` with `aria-live="polite"`; the input is a real
  labelled `<input>` inside a form, so Enter submits.
- `prefers-reduced-motion` disables the CRT flicker and softens scanlines.
- The graph layer is `aria-hidden`; all of its information is reachable through
  `members`, `whois` and `showcase` as text.
- The canvas animation stops entirely when detached (Ctrl+C) — no idle rAF loop
  burning battery behind the terminal.
- The optional district world has a labelled keyboard canvas, live mission
  announcements, native destination dialog and touch controls. Every destination
  also exists in the non-game directory. Inactive controls cannot take focus.
- City rendering stops while hidden or suspended behind another world;
  reduced-motion idle is static. Cached scenery avoids rebuilding buildings
  during movement.