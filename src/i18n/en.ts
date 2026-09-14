/**
 * English strings — the source of truth for all user-facing HUD/card copy.
 * One flat table; keys are dotted paths. `{token}` slots are filled by `t()`.
 * A new language is a sibling file with the same keys, added to the map in
 * `./index.ts`.
 */
export const en: Record<string, string> = {
  // boot
  "boot.nowebgl":
    "This browser could not start WebGL, so the ocean cannot render.",

  // instrument panel
  "hud.leg": "{done} of {total} km",
  "hud.draft.alone": "Swimming alone",
  "hud.draft.drafting": "Drafting, {pct}% less effort",

  // zones (keyed by Zone.id)
  "zone.shelf": "Continental shelf",
  "zone.open-blue": "The open blue",
  "zone.lane": "Shipping lane",
  "zone.seamount": "Seamount chain",
  "zone.warm": "Warm water",

  // per-leg copy (keyed by Leg.id)
  "leg.crossing.goal": "South to warm water. The krill is below the light.",
  "leg.crossing.distanceSpelled": "Twelve kilometres.",

  // opening controls strip (shown briefly on a fresh New Game)
  "keyhint.swim": "swim, with a very large animal's momentum",
  "keyhint.surge": "hold to surge, tap to tail-kick",
  "keyhint.sing": "sing, and call the pod in with you",
  "keyhint.pause": "pause",

  // trick / milestone popups (score layer)
  "trick.breach": "Breach",
  "trick.breachBig": "Soaring Breach",
  "trick.flip1": "Backflip",
  "trick.flip2": "Double Backflip",
  "trick.flip3": "Triple Backflip",
  "trick.clean": "Clean Entry",
  "trick.bellyFlop": "Belly Flop",
  "trick.splashFeast": "Splashdown Feast",
  "trick.feast": "Krill Feast",
  "trick.podJoin": "Whale Joined",
  "trick.chorus": "Chorus",
  "trick.closePass": "Close Pass",
  "trick.squidDodge": "Squid Dodge",
  "trick.squidShaken": "Predator Shaken",
  "trick.squidPod": "Pod Defense",
  "milestone.distance": "{km} km down",
  "milestone.depth.dark": "Into the dark",
  "milestone.depth.deep": "The deep water",
  "milestone.depth.abyssal": "The abyss",
  "milestone.pod.1": "The pod begins",
  "milestone.pod.3": "A travelling pod",
  "milestone.pod.6": "A full chorus line",

  // end screen
  "card.end.win.h1": "Warm water<br><em>you made the crossing</em>",
  "card.end.lose.h1": "Out of reserves<br><em>the leg ends here</em>",
  "card.end.win.body": "{distance} {stats}",
  "card.end.lose.body": "You covered {distance}. {stats}",
  "card.end.stats":
    "{answered} whales answered, {joined} joined you, {lost} were driven off " +
    "by ship noise. {behind} still behind you at the end. {fed} swarms fed on, " +
    "{chorus} calls sung together. {score} points, best {best}.",
  "card.end.bestNone": "no trick landed",
  "end.finds": "New in the almanac",
  "end.again": "Swim it again",
  "end.title": "Back to title",

  // title screen
  "title.tagline": "one leg of the migration",
  "title.new": "New Game",
  "title.continue": "Continue",
  "title.multiplayer": "Multiplayer",
  "title.options": "Options",
  "title.almanac": "Almanac",
  "title.credits": "Credits",
  "title.soon": "Coming soon",
  "title.noSave": "No run in progress",
  "title.continueMeta": "{km} km in · {score} pts · {when}",
  "title.shelf": "{won} / {total} trophies",
  "title.almanacMeta": "{seen} / {total} seen",
  "title.best": "Best {score} pts",
  "title.furthest": "Furthest {km} km",
  "title.crossings": "{n} crossings made",
  "title.crossings.one": "{n} crossing made",

  // "new in the almanac" toast
  "toast.creature": "New in the almanac",
  "toast.trophy": "Trophy earned",

  // pause menu
  "menu.title": "Paused",
  "menu.resume": "Resume",
  "menu.restart": "Restart this leg",
  "menu.save": "Save",
  "menu.load": "Load",
  "menu.options": "Options",
  "menu.exit": "Exit to title",
  "menu.back": "Back",
  "menu.note.saved": "Saved.",
  "menu.note.saveFail": "Could not save.",
  "menu.note.noSave": "No save yet.",
  "menu.note.loaded": "Loaded.",
  "menu.note.wrongWorld": "That save is for a different world.",

  // shared options panel
  "options.title": "Options",
  "options.volume": "Volume",
  "options.controls": "Controls",
  "options.reset": "Reset progress",
  "options.resetConfirm": "Press again to confirm",
  "options.resetDone": "Progress reset",
  "options.graphics": "Graphics",
  "options.graphicsNote":
    "Changes land at once, even mid-run. If the frame rate drops, start " +
    "with render scale and the glow, then switch the water effects off one " +
    "at a time.",
  "quality.preset.low": "Low",
  "quality.preset.medium": "Medium",
  "quality.preset.high": "High",
  "quality.preset.custom": "Custom",
  "quality.on": "On",
  "quality.off": "Off",
  "quality.renderScale": "Render scale",
  "quality.bloom": "Glow bloom",
  "quality.godRays": "God-rays",
  "quality.caustics": "Caustics",
  "quality.clouds": "Clouds",
  "quality.skyLife": "Stars & gulls",
  "quality.surfaceDetail": "Foam, glitter & spray",
  "quality.slabs": "Sunlit water",
  "quality.murk": "Drifting silt",
  "quality.thermocline": "Thermocline shimmer",
  "quality.snow": "Marine snow",
  "quality.sparks": "Bioluminescence",
  "quality.creatureDetail": "Creature detail",
  "quality.reefDetail": "Reef detail",
  "quality.terrainDetail": "Far ridge & rubble",
  "controls.wasd": "swim, with a very large animal's momentum",
  "controls.shift": "hold to surge and build speed; tap for a tail-kick burst",
  "controls.space": "sing, and call the pod in with you",
  "controls.esc": "pause",
  "controls.r": "back to title, on the end screen",

  // credits
  "credits.title": "Credits",
  "credits.made": "Made by",
  "credits.name": "Muhammad Fahmi Rasyid",
  "credits.site": "rasyid.dev",

  // almanac
  "almanac.title": "Almanac",
  "almanac.tab.creatures": "Creatures",
  "almanac.tab.trophies": "Trophies",
  "almanac.unknown": "???",
  "almanac.locked": "Not yet seen. Find it out on the crossing.",
  "almanac.fact.size": "Size",
  "almanac.fact.found": "Found",
  "almanac.fact.temper": "Temper",

  "almanac.blue-whale.name": "Blue Whale",
  "almanac.blue-whale.size": "~28 m, adult",
  "almanac.blue-whale.found": "Everywhere — you're swimming it",
  "almanac.blue-whale.temper": "Migratory, deliberate",
  "almanac.blue-whale.body":
    "Twenty-eight metres of migrating animal, moving south on sunlight and " +
    "krill. You sing to call in a pod and to find what the light can't show " +
    "you below a hundred and eighty metres.",

  "almanac.pod-whale.name": "Travelling Whale",
  "almanac.pod-whale.size": "~26–30 m",
  "almanac.pod-whale.found": "Answers a song, falls in behind",
  "almanac.pod-whale.temper": "Wary until it isn't",
  "almanac.pod-whale.body":
    "A blue whale making the same crossing. Sing near enough and it may " +
    "answer, then trail your wake — a pod swims easier and sings further " +
    "than one whale alone.",

  "almanac.krill.name": "Krill Swarm",
  "almanac.krill.size": "individually tiny; swarms span hundreds of metres",
  "almanac.krill.found": "Below the light, thickest past 90 m",
  "almanac.krill.temper": "Skittish — scatters under a lunge",
  "almanac.krill.body":
    "The reason you're diving. A swarm reads as a smear of amber on sonar; " +
    "lunge through the middle of one to feed, and the pod that's with you " +
    "will thank you for it.",

  "almanac.squid.name": "Deep Squid",
  "almanac.squid.size": "several metres, arms included",
  "almanac.squid.found": "Deep water, where it's calm and dark",
  "almanac.squid.temper": "Patient, then sudden",
  "almanac.squid.body":
    "A rare, cold threat that lurks in the blind spots below the light. It " +
    "gives one slow, telegraphed lunge if you linger too close too long — " +
    "sing, surge, or let the pod see it off.",

  "almanac.ship.name": "Ship",
  "almanac.ship.size": "a few hundred metres, hull and wake",
  "almanac.ship.found": "The shipping lane, at the surface",
  "almanac.ship.temper": "Indifferent — the noise is the danger",
  "almanac.ship.body":
    "Surface traffic that doesn't know you're there. Its engine noise can " +
    "spook a nervous pod whale off; pass close at speed instead and it " +
    "scores as nerve, not risk.",

  "almanac.silver-baitball.name": "Silver Baitball",
  "almanac.silver-baitball.size": "small, schools by the hundred",
  "almanac.silver-baitball.found": "Open water and reef alike",
  "almanac.silver-baitball.temper": "Tight schooling, harmless",
  "almanac.silver-baitball.body":
    "A ball of small silver fish that scatters and re-forms as you pass. " +
    "Not food — the krill is what you're after — but a sure sign you're " +
    "near life.",

  "almanac.blue-dart.name": "Blue Dart",
  "almanac.blue-dart.size": "small, built for speed",
  "almanac.blue-dart.found": "Open blue water",
  "almanac.blue-dart.temper": "Fast, flighty",
  "almanac.blue-dart.body":
    "Quick little fish that dart in loose formation through open water, " +
    "gone the instant a shadow crosses them.",

  "almanac.reef-tang.name": "Reef Tang",
  "almanac.reef-tang.size": "small, deep-bodied",
  "almanac.reef-tang.found": "Shallow reef, near coral",
  "almanac.reef-tang.temper": "Bold near shelter, shy in the open",
  "almanac.reef-tang.body":
    "A deep-bodied reef fish that shelters in coral when something large " +
    "bears down, then drifts back out once it's clear.",

  "almanac.ribbon-eel.name": "Ribbon Eel",
  "almanac.ribbon-eel.size": "long, slender",
  "almanac.ribbon-eel.found": "Threaded through reef coral",
  "almanac.ribbon-eel.temper": "Shy, rarely still",
  "almanac.ribbon-eel.body":
    "A long ribbon of a fish that winds through the reef's coral, never " +
    "quite holding still long enough to get a good look at.",

  "almanac.eagle-ray.name": "Eagle Ray",
  "almanac.eagle-ray.size": "broad, wing-like",
  "almanac.eagle-ray.found": "Open water, gliding",
  "almanac.eagle-ray.temper": "Unhurried",
  "almanac.eagle-ray.body":
    "A wide-winged ray that glides through open water at its own pace, " +
    "untroubled by whatever's swimming past it.",

  "almanac.moon-jelly.name": "Moon Jelly",
  "almanac.moon-jelly.size": "small, translucent",
  "almanac.moon-jelly.found": "Drifting in open water",
  "almanac.moon-jelly.temper": "None — it just drifts",
  "almanac.moon-jelly.body":
    "A pale, translucent drifter with no more urgency than the current " +
    "carrying it.",

  "almanac.sea-fan.name": "Sea Fan",
  "almanac.sea-fan.size": "a low, branching lattice",
  "almanac.sea-fan.found": "The shallow shelf reef",
  "almanac.sea-fan.temper": "Stationary — sways with the swell",
  "almanac.sea-fan.body":
    "A fan-shaped colony that opens wide to filter the water, rooted to the " +
    "reef and swaying gently with every pass of current.",

  "almanac.staghorn.name": "Staghorn Coral",
  "almanac.staghorn.size": "branching, antler-like",
  "almanac.staghorn.found": "The shallow shelf reef",
  "almanac.staghorn.temper": "Stationary — brittle, fast-growing",
  "almanac.staghorn.body":
    "Fast-growing branches that fork like antlers, forming most of the " +
    "reef's shallow structure.",

  "almanac.brain-coral.name": "Brain Coral",
  "almanac.brain-coral.size": "a dense, rounded mass",
  "almanac.brain-coral.found": "The shallow shelf reef",
  "almanac.brain-coral.temper": "Stationary — patient",
  "almanac.brain-coral.body":
    "A slow-growing, convoluted dome that can sit on the same patch of " +
    "reef for centuries.",

  "almanac.tube-sponge.name": "Tube Sponge",
  "almanac.tube-sponge.size": "upright, hollow tubes",
  "almanac.tube-sponge.found": "The shallow shelf reef",
  "almanac.tube-sponge.temper": "Stationary — quietly filtering",
  "almanac.tube-sponge.body":
    "A cluster of hollow tubes that filters the water passing through it, " +
    "unhurried by anything swimming nearby.",

  "almanac.sea-whip.name": "Sea Whip",
  "almanac.sea-whip.size": "tall, whip-thin branches",
  "almanac.sea-whip.found": "The shallow shelf reef",
  "almanac.sea-whip.temper": "Stationary — flexes in the current",
  "almanac.sea-whip.body":
    "Thin, whip-like branches that bend with the current rather than " +
    "fight it, reaching higher off the reef than most of its neighbours.",

  "almanac.anemone.name": "Anemone",
  "almanac.anemone.size": "a squat column, crowned with tentacles",
  "almanac.anemone.found": "The shallow shelf reef",
  "almanac.anemone.temper": "Stationary — every tentacle on its own time",
  "almanac.anemone.body":
    "Not a coral at all but a single soft animal: a stout column topped with " +
    "a ring of tentacles that each wave to their own rhythm, closing over " +
    "whatever the current delivers.",

  "almanac.table-coral.name": "Table Coral",
  "almanac.table-coral.size": "a broad plate on a short stem",
  "almanac.table-coral.found": "The shallow shelf reef",
  "almanac.table-coral.temper": "Stationary — reaching for the light",
  "almanac.table-coral.body":
    "A flat plate spread wide on a single stem to catch as much sun as the " +
    "reef allows, its rim scalloped and its underside kept in permanent " +
    "shade for whatever shelters there.",

  // trophies
  "trophy.unearned": "Not yet earned.",
  "trophy.earned": "Earned {date}.",
  "trophy.tier.bronze": "Bronze",
  "trophy.tier.silver": "Silver",
  "trophy.tier.gold": "Gold",

  "trophy.first-breath.name": "First Breath",
  "trophy.first-breath.desc": "Start a crossing.",
  "trophy.first-feast.name": "First Feast",
  "trophy.first-feast.desc": "Feed on a krill swarm.",
  "trophy.breach.name": "Breach",
  "trophy.breach.desc": "Clear the surface.",
  "trophy.backflip.name": "Backflip",
  "trophy.backflip.desc": "Land a full aerial turn.",
  "trophy.belly-flop.name": "Belly Flop",
  "trophy.belly-flop.desc": "Come down flat instead of nose-first.",
  "trophy.pod-begins.name": "The Pod Begins",
  "trophy.pod-begins.desc": "Have your first whale fall in behind you.",
  "trophy.into-dark.name": "Into the Dark",
  "trophy.into-dark.desc": "Pass the light line, 90 m down.",
  "trophy.clean-entry.name": "Clean Entry",
  "trophy.clean-entry.desc": "Land a rotating trick nose-first.",
  "trophy.chorus.name": "Chorus",
  "trophy.chorus.desc": "Sing together with your pod.",
  "trophy.close-pass.name": "Close Pass",
  "trophy.close-pass.desc": "Pass a ship's hull close and fast, unbothered.",
  "trophy.squid-dodge.name": "Squid Dodge",
  "trophy.squid-dodge.desc": "Evade a squid's strike.",
  "trophy.predator-shaken.name": "Predator Shaken",
  "trophy.predator-shaken.desc": "Shake off a latched squid yourself.",
  "trophy.glutton.name": "Glutton",
  "trophy.glutton.desc": "Feed on 12 krill swarms in one run.",
  "trophy.flow.name": "In the Flow",
  "trophy.flow.desc": "Reach the top of the trick flow multiplier.",
  "trophy.triple.name": "Triple Backflip",
  "trophy.triple.desc": "Land three full turns in one breach.",
  "trophy.deep-water.name": "The Deep Water",
  "trophy.deep-water.desc": "Pass 400 m down.",
  "trophy.full-pod.name": "Full Pod",
  "trophy.full-pod.desc": "Travel with six whales behind you.",
  "trophy.pod-defense.name": "Pod Defense",
  "trophy.pod-defense.desc": "Have your pod tear a latched squid off for you.",
  "trophy.crossing.name": "The Crossing",
  "trophy.crossing.desc": "Reach warm water — finish a leg.",
  "trophy.escort.name": "Escort",
  "trophy.escort.desc":
    "Finish a leg with three or more whales still behind you.",
  "trophy.high-score.name": "High Achiever",
  "trophy.high-score.desc": "Score 10,000 points in one run.",
  "trophy.naturalist.name": "Naturalist",
  "trophy.naturalist.desc": "See every creature in the almanac.",
};
