# kracked.sh

A terminal-first reimagination of the Kracked Devs community page, built for the
open creative bounty (deadline 18 Oct 2026).

Instead of a conventional landing page, the whole site **is a shell**. Visitors
land at a prompt, a boot sequence runs, and they explore the community by typing
commands. The signature moment is `attach`: the terminal collapses and a live
community topology takes over — a canvas graph of builders, their collaborations
and their power levels.

`explore` opens the other world: a top-down ASCII city where every project is a
building you walk up to. `WASD` / arrows move, `Enter` goes inside, `Esc` leaves.

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

If a visitor types nothing for 9 seconds, a demo sequence types itself out so
the page always demonstrates itself.

## Stack

- **Vite 7** + TypeScript, zero runtime dependencies (production `deps` is empty)
- **Hand-written CSS** — design tokens, CRT scanline/vignette/flicker layers
- **Own shell**: tokenizer, command registry, history ring, completion
- **Canvas 2D** topology: golden-angle seed, spring/repulsion relaxation run once
  at load, slow orbital drift, hover raycast, status-coloured nodes
- **GitHub Pages** deploy workflow

Production build is ~205 KB JS + ~10 KB CSS (≈74 KB + 3 KB gzipped), most of
which is the generated showcase snapshot.

## Layout of the source

```
index.html            terminal chrome, prompt, graph layer
src/
  main.ts             wiring: boot, input, completion, history, idle demo
  style.css           tokens + CRT + terminal + output primitives + graph
  data.ts             community snapshot (members, bounties, projects, edges)
  term/
    shell.ts          tokenizer, history ring, Ctx contract
    output.ts         DOM output primitives (line, table, kv, pwrBar, tag…)
    commands.ts       command registry, banner, boot sequence
    graph.ts          canvas topology layer
    city.ts           walkable ASCII city, one building per project
    progress.ts       the run: xp, elements, save/load
scripts/
  sync-showcase.mjs   regenerate src/showcase.ts from the live site
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

### Refreshing the showcase

`src/showcase.ts` is **generated** — do not hand-edit it. The site has no public
API, so the sync script reads the project list out of the page's React Server
Component payload and rewrites the file:

```bash
npm run sync-showcase
```

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