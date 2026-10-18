# kracked.sh

A terminal-first reimagination of the Kracked Devs community page, built for the
open creative bounty (deadline 18 Oct 2026).

Instead of a conventional landing page, the whole site **is a shell**. Visitors
land at a prompt, a boot sequence runs, and they explore the community by typing
commands. The signature moment is `attach`: the terminal collapses and a live
community topology takes over — a canvas graph of builders, their collaborations
and their power levels.

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
join                    how to become a builder
stats                   community numbers + power distribution
clear                   clear the screen
motd                    message of the day
exit                     there is no exit

hidden: sudo, rm, vim, matrix, .join
```

Shell features: **Tab** completion (commands and arguments), **↑/↓** history,
**Ctrl+L** to clear, **Ctrl+C** to detach from the topology.

If a visitor types nothing for 9 seconds, a demo sequence types itself out so
the page always demonstrates itself.

## Stack

- **Vite 7** + TypeScript, zero runtime dependencies (production `deps` is empty)
- **Hand-written CSS** — design tokens, CRT scanline/vignette/flicker layers
- **Own shell**: tokenizer, command registry, history ring, completion
- **Canvas 2D** topology: golden-angle seed, spring/repulsion relaxation run once
  at load, slow orbital drift, hover raycast, status-coloured nodes
- **GitHub Pages** deploy workflow

Production build is ~30 KB JS + ~9 KB CSS (≈11 KB + 3 KB gzipped).

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
```

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # → dist/
npm run preview
```

## Accessibility & performance notes

- Output region is `role="log"` with `aria-live="polite"`; the input is a real
  labelled `<input>` inside a form, so Enter submits.
- `prefers-reduced-motion` disables the CRT flicker and softens scanlines.
- The graph layer is `aria-hidden`; all of its information is reachable through
  `members`, `whois` and `showcase` as text.
- The canvas animation stops entirely when detached (Ctrl+C) — no idle rAF loop
  burning battery behind the terminal.

## Data

`src/data.ts` is a static snapshot seeded from the live Kracked Devs showcase
(565 projects, 3,408 builders) plus a small hand-written roster so the profiles
and collaboration edges read as a real community rather than placeholder text.
Numbers on screen are the ones in that file — no invented telemetry.