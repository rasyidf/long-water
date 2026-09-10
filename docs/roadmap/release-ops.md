# Release and operations

Deploy pipeline, save/version migration policy, and telemetry. Becomes more urgent as the project
moves from prototype toward shippable — see the branding/splash signal noted in
[ANALYSIS.md](../ANALYSIS.md).

## 1. Deploy pipeline

**Current state:** the working tree has an uncommitted `package.json` change adding
`"deploy": "bun run build && bunx wrangler@latest pages deploy dist --project-name=long-water"`.
This is a manual, local, pull-the-trigger-yourself deploy — no CI runs before it, no staging step,
`wrangler@latest` is unpinned (a Wrangler major-version bump could silently change deploy behavior
between runs).

**Do, once `engineering-foundations.md` #2 (CI) lands:**
1. Pin the `wrangler` version used for deploy rather than `@latest`, so a deploy today and a deploy
   in three months behave the same way.
2. Decide whether deploy stays a manual local command (fine for a solo project — explicit control
   over *when* a build goes live) or moves into CI on a tag/branch push. Manual-but-CI-gated (i.e.,
   `bun run deploy` still run by hand, but only after `build` has passed in CI on that commit) is a
   reasonable middle ground that doesn't require picking a full release-automation strategy yet.

## 2. Save / version migration policy

**Current state:** `ARCHITECTURE.md` §11 — `state/Snapshot.ts` serializes the dynamic run state to
`localStorage["long-water:save"]`, keyed against a matching seed, level `id`, and schema
`VERSION`. A mismatch's behavior isn't spelled out beyond "a save only loads against a matching...
`VERSION`" — implying a version bump currently just invalidates old saves silently.

**Why this matters more soon:** it's a fine policy today (short sessions, single level, low save
value). It matters more once there are multiple levels/legs (`gameplay-and-content.md` §2) and
players have saves they'd be annoyed to lose silently on an update.

**Do:** no urgent action — just write down the current behavior explicitly (silent invalidation on
`VERSION` mismatch, no migration) in `ARCHITECTURE.md` §11 so it's a documented decision rather
than an implicit one, and revisit if/when save value goes up.

## 3. Telemetry

**Current state:** none. No analytics, no crash reporting, no aggregate signal on win/loss rates,
run length, or which mechanics (song, feeding, squid encounters, pod recruiting) actually get used
by players.

**Why this matters:** tuning right now is entirely feel-based — the squid "calm retune"
(`29bf266`) and scoring system (`5ff1c3a`) both ship without any way to observe how they land with
real players beyond direct observation. That's appropriate at solo-prototype scale; it stops
scaling once there's more than one person playing or more than one level to balance against each
other.

**Do:** not urgent while the project is pre-release. Worth planning *before* a public launch rather
than after, though — retrofitting telemetry after players already have expectations about privacy
is harder than building it in from the first public build. Keep it minimal and aggregate (run
outcome, run length, zone reached) rather than anything identity-linked; this is a static site with
no backend today, so any telemetry adds the project's first server dependency — worth choosing
deliberately (e.g. a privacy-respecting hosted analytics endpoint) rather than defaulting to
whatever's fastest to wire up.

## 4. No CONTRIBUTING / PR process

**Current state:** solo project, direct commits to `main`, one PR merged so far (`c0c97ca`). Not a
gap worth fixing now — only relevant if/when the project opens up to other contributors. Listed
here so it's not forgotten rather than because it's actionable today.
