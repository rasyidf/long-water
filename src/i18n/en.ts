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

  // title card
  "card.title.h1": "Long Water<br><em>one leg of the migration</em>",
  "card.title.body":
    "You are a blue whale, twenty-eight metres, moving south. Sunlight gives " +
    "out around a hundred and eighty metres and the krill lives below that " +
    "line, so you sing to find it. Singing costs air, and air is at the " +
    "surface. Whales that answer you will fall in behind, and a pod sings " +
    "further than one whale can.",
  "card.title.start": "Press any key to take a breath",
  "card.title.keys.wasd": "swim, with the momentum of a very large animal",
  "card.title.keys.shift":
    "hold to surge and build speed; tap for a tail-kick burst",
  "card.title.keys.space": "sing, and call the pod in with you",
  "card.title.keys.esc": "pause",

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

  // end card
  "card.end.win.h1": "Warm water<br><em>you made the crossing</em>",
  "card.end.lose.h1": "Out of reserves<br><em>the leg ends here</em>",
  "card.end.win.body": "{distance} {stats}",
  "card.end.lose.body": "You covered {distance}. {stats}",
  "card.end.stats":
    "{answered} whales answered, {joined} joined you, {lost} were driven off " +
    "by ship noise. {behind} still behind you at the end. {fed} swarms fed on, " +
    "{chorus} calls sung together. {score} points, best {best}.",
  "card.end.restart": "Press R to swim it again",
  "card.end.bestNone": "no trick landed",

  // pause menu
  "menu.title": "Paused",
  "menu.resume": "Resume",
  "menu.restart": "Restart this leg",
  "menu.save": "Save",
  "menu.load": "Load",
  "menu.options": "Options",
  "menu.exit": "Exit to title",
  "menu.volume": "Volume",
  "menu.note.saved": "Saved.",
  "menu.note.saveFail": "Could not save.",
  "menu.note.noSave": "No save yet.",
  "menu.note.loaded": "Loaded.",
  "menu.note.wrongWorld": "That save is for a different world.",
};
