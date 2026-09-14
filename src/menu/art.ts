/**
 * Almanac portraits and trophy cups as inline SVG strings. Hand-drawn in the
 * game's palette so the book reads as part of the same world as the HUD. Every
 * portrait shares one 120x80 viewBox; the almanac locks an entry by painting
 * the same SVG as a flat silhouette in CSS (`.locked`).
 *
 * Fish portraits are picked by the species' draw strategy and tinted with its
 * `baseColor`, so a new species in `config/species.ts` gets a portrait for free.
 */
import { CORAL_IDS, type TrophyTier } from "../config/almanac";
import { C } from "../config/constants";
import { SPECIES } from "../config/species";

const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

const svg = (body: string): string =>
  `<svg viewBox="0 0 120 80" aria-hidden="true">${body}</svg>`;

function whale(skin: string, belly: string): string {
  return svg(`
    <path d="M14 42C24 32 44 29 66 30C86 31 102 35 110 41C113 44 111 47 106 49C94 54 74 56 54 55C38 54 26 50 18 46Z" fill="${skin}"/>
    <path d="M58 52C74 54 92 52 106 47C100 53 84 56 66 56C62 56 59 54 58 52Z" fill="${belly}" opacity=".8"/>
    <path d="M64 51C68 58 73 62 80 64C78 58 74 53 71 50Z" fill="${skin}" opacity=".85"/>
    <path d="M36 32L40 27L44 32Z" fill="${skin}"/>
    <path d="M16 43C9 37 5 30 6 25C11 31 15 36 20 41Z" fill="${skin}"/>
    <path d="M16 45C9 51 5 58 6 62C11 56 15 51 20 47Z" fill="${skin}"/>
    <circle cx="98" cy="42" r="1.3" fill="#04080e"/>
    <path d="M78 50C88 51 97 49 104 46" stroke="${belly}" stroke-width=".8" fill="none" opacity=".5"/>
  `);
}

function krill(): string {
  const k = hex(C.krill);
  const motes = [
    [18, 20],
    [28, 60],
    [96, 18],
    [104, 58],
    [14, 44],
    [110, 38],
    [86, 66],
    [36, 12],
  ]
    .map(
      ([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="1.6" fill="${k}" opacity=".55"/>`,
    )
    .join("");
  return svg(`
    ${motes}
    <path d="M34 46C40 32 60 26 76 30C86 33 90 40 86 46C80 40 70 38 60 40C50 42 42 46 34 46Z" fill="${k}"/>
    <path d="M34 46C30 48 26 52 22 52C26 48 28 44 32 42Z" fill="${k}" opacity=".85"/>
    <path d="M48 44L46 54M56 42L55 53M64 41L64 51M72 40L73 50" stroke="${k}" stroke-width="1.2" opacity=".75"/>
    <path d="M86 34C94 28 102 24 110 22M86 36C96 34 104 34 112 36" stroke="${k}" stroke-width="1" fill="none" opacity=".7"/>
    <circle cx="82" cy="35" r="2" fill="#04080e"/>
  `);
}

/** one fish body, nose at (x,y) pointing right, length `l` */
function fishBody(
  kind: string,
  x: number,
  y: number,
  l: number,
  col: string,
): string {
  const h = l * 0.3;
  switch (kind) {
    case "dart":
      return `<path d="M${x} ${y}C${x - l * 0.4} ${y - h * 0.5} ${x - l * 0.8} ${y - h * 0.4} ${x - l} ${y}C${x - l * 0.8} ${y + h * 0.4} ${x - l * 0.4} ${y + h * 0.5} ${x} ${y}Z" fill="${col}"/>
        <path d="M${x - l} ${y}L${x - l * 1.2} ${y - h * 0.5}L${x - l * 1.14} ${y}L${x - l * 1.2} ${y + h * 0.5}Z" fill="${col}"/>`;
    default:
      return `<path d="M${x} ${y}C${x - l * 0.2} ${y - h} ${x - l * 0.7} ${y - h} ${x - l * 0.85} ${y}C${x - l * 0.7} ${y + h} ${x - l * 0.2} ${y + h} ${x} ${y}Z" fill="${col}"/>
        <path d="M${x - l * 0.8} ${y}L${x - l * 1.1} ${y - h * 0.9}L${x - l * 1.02} ${y}L${x - l * 1.1} ${y + h * 0.9}Z" fill="${col}"/>
        <circle cx="${x - l * 0.16}" cy="${y - h * 0.18}" r="${Math.max(0.8, l * 0.035)}" fill="#04080e"/>`;
  }
}

function fish(speciesId: string): string {
  const s = SPECIES.find((sp) => sp.id === speciesId);
  if (!s) return svg("");
  const col = hex(s.baseColor);
  const hi = hex(s.glowColor ?? s.baseColor);
  switch (s.draw) {
    case "eelRibbon":
      return svg(`
        <path d="M12 46C24 30 36 30 48 42C60 54 72 54 84 42C92 34 100 32 108 34" stroke="${col}" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M12 46C24 30 36 30 48 42C60 54 72 54 84 42C92 34 100 32 108 34" stroke="${hi}" stroke-width="1.2" fill="none" opacity=".6"/>
        <circle cx="104" cy="33" r="1.3" fill="#04080e"/>
      `);
    case "rayGlide":
      return svg(`
        <path d="M60 18C70 26 96 34 110 40C96 44 72 48 62 54C58 50 50 46 10 40C24 34 50 26 60 18Z" fill="${col}"/>
        <path d="M62 54C60 60 52 68 34 74" stroke="${col}" stroke-width="1.6" fill="none"/>
        <path d="M60 22C62 32 64 42 62 52" stroke="${hi}" stroke-width="1" fill="none" opacity=".45"/>
        <circle cx="54" cy="26" r="1.1" fill="#04080e"/><circle cx="66" cy="26" r="1.1" fill="#04080e"/>
      `);
    case "jellyBell":
      return svg(`
        <path d="M34 40C34 20 86 20 86 40C80 42 74 40 68 42C62 40 58 40 52 42C46 40 40 42 34 40Z" fill="${col}" opacity=".85"/>
        <path d="M44 34C48 28 54 30 52 34M62 32C66 26 72 28 70 33" stroke="${hi}" stroke-width="1.4" fill="none" opacity=".7"/>
        <path d="M42 42C40 52 46 60 42 72M54 42C56 54 50 62 54 74M66 42C64 52 70 62 66 72M78 42C80 50 74 58 78 68" stroke="${col}" stroke-width="1.2" fill="none" opacity=".6"/>
      `);
    case "dart":
      return svg(
        [
          [96, 28, 30],
          [78, 44, 26],
          [104, 54, 28],
          [60, 30, 22],
          [66, 60, 20],
        ]
          .map(([x, y, l]) => fishBody("dart", x, y, l, col))
          .join(""),
      );
    default: {
      // a lone fish for reef dwellers, a school for open-water baitfish
      const school = s.habitat !== "reef";
      const fishes = school
        ? [
            [98, 26, 22],
            [80, 40, 24],
            [104, 50, 20],
            [62, 26, 18],
            [66, 56, 22],
            [44, 42, 18],
            [86, 64, 16],
          ]
        : [[98, 40, 70]];
      return svg(
        fishes.map(([x, y, l]) => fishBody("forked", x, y, l, col)).join(""),
      );
    }
  }
}

function squid(): string {
  const skin = "#8a4a56";
  const pale = "#dcc4cb";
  return svg(`
    <path d="M110 40C104 32 96 32 90 34L56 36C50 37 48 43 56 44L90 46C96 48 104 48 110 40Z" fill="${skin}"/>
    <path d="M110 40L100 30C104 34 106 37 110 40ZM110 40L100 50C104 46 106 43 110 40Z" fill="${skin}" opacity=".8"/>
    <path d="M56 38C44 34 30 30 12 30M56 40C42 40 28 40 8 42M56 42C44 46 30 50 14 54M56 39C40 36 26 26 16 18M56 43C40 48 28 58 20 66" stroke="${skin}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <path d="M94 38C98 38 104 39 106 40" stroke="${pale}" stroke-width="1" opacity=".5"/>
    <circle cx="62" cy="40" r="3" fill="#05070b"/><circle cx="62" cy="40" r="1.2" fill="#d9603f"/>
  `);
}

function ship(): string {
  const foam = hex(C.foam);
  return svg(`
    <path d="M4 52C20 49 36 53 60 51C84 49 100 53 116 51" stroke="${foam}" stroke-width="1.2" fill="none" opacity=".6"/>
    <path d="M10 42L104 42L96 56L18 56Z" fill="#3a4a56"/>
    <path d="M18 56L96 56L94 60L22 60Z" fill="#6e3b35" opacity=".8"/>
    <rect x="24" y="30" width="12" height="12" fill="#4d5d69"/><rect x="38" y="32" width="12" height="10" fill="#5a6a52"/>
    <rect x="52" y="30" width="12" height="12" fill="#6e5b45"/><rect x="66" y="32" width="12" height="10" fill="#4d5d69"/>
    <path d="M82 26L94 26L94 42L82 42Z" fill="#c9d4d8"/><rect x="86" y="20" width="4" height="6" fill="#3a4a56"/>
    <path d="M4 58C20 55 36 59 60 57C84 55 100 59 116 57" stroke="${foam}" stroke-width="1" fill="none" opacity=".35"/>
  `);
}

function coral(id: string): string {
  const hue = hex(
    [0xff6f6b, 0xdd6f9e, 0xe0b45c, 0xc27bd6, 0x8f83d8, 0xf09a6a, 0x7fc9a6][
      CORAL_IDS.indexOf(id as (typeof CORAL_IDS)[number])
    ] ?? C.coral,
  );
  const rock = `<path d="M8 74C24 66 44 68 60 70C78 66 98 66 112 74Z" fill="${hex(C.seabed)}" opacity=".8"/>`;
  switch (id) {
    case "sea-fan":
      return svg(`${rock}
        <path d="M60 70L60 50M60 56L42 30M60 56L78 30M60 50L52 20M60 50L68 20M42 30L32 22M42 30L40 14M78 30L88 22M78 30L80 14M52 20L48 10M68 20L72 10" stroke="${hue}" stroke-width="2" stroke-linecap="round"/>
        <path d="M30 34C36 12 84 12 90 34C80 44 40 44 30 34Z" fill="${hue}" opacity=".18"/>`);
    case "staghorn":
      return svg(`${rock}
        <path d="M60 70L58 44L46 24M58 44L70 28L78 14M70 28L84 30M58 52L36 42L28 28M36 42L24 46M46 24L40 12M46 24L56 14" stroke="${hue}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
    case "brain-coral":
      return svg(`${rock}
        <path d="M28 70C28 44 92 44 92 70Z" fill="${hue}"/>
        <path d="M36 66C40 58 48 62 52 56C56 50 64 58 68 52C72 48 78 56 84 60M40 70C46 64 54 68 58 62C62 58 70 64 76 62" stroke="#04080e" stroke-width="1.4" fill="none" opacity=".35"/>`);
    case "tube-sponge":
      return svg(`${rock}
        ${[
          [40, 36, 9],
          [54, 22, 10],
          [68, 32, 9],
          [80, 44, 8],
        ]
          .map(
            ([x, top, w]) =>
              `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${70 - top}" rx="${w / 2}" fill="${hue}"/>
               <ellipse cx="${x}" cy="${top + 2}" rx="${w / 2 - 1.5}" ry="1.8" fill="#04080e" opacity=".5"/>`,
          )
          .join("")}`);
    case "anemone":
      return svg(`${rock}
        <path d="M46 70C44 56 46 46 48 40L72 40C74 46 76 56 74 70Z" fill="${hue}" opacity=".85"/>
        <ellipse cx="60" cy="40" rx="14" ry="4" fill="${hue}"/>
        <ellipse cx="60" cy="40" rx="4" ry="1.6" fill="#04080e" opacity=".5"/>
        <path d="M48 38C40 30 34 26 30 16M52 37C48 28 44 22 42 12M57 36C56 26 54 18 56 8M63 36C64 26 66 18 64 8M68 37C72 28 76 22 78 12M72 38C80 30 86 26 90 16M50 39C42 34 34 34 26 30M70 39C78 34 86 34 94 30" stroke="${hue}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`);
    case "table-coral":
      return svg(`${rock}
        <path d="M56 70L55 42L65 42L64 70Z" fill="${hue}" opacity=".8"/>
        <path d="M18 40C22 32 40 30 60 30C80 30 98 32 102 40C96 46 80 48 60 48C40 48 24 46 18 40Z" fill="${hue}"/>
        <path d="M22 41C40 47 80 47 98 41C90 44 74 46 60 46C46 46 30 44 22 41Z" fill="#04080e" opacity=".3"/>
        <path d="M34 32L33 24M46 30L46 20M60 30L60 18M74 30L74 20M86 32L87 24" stroke="${hue}" stroke-width="2.4" stroke-linecap="round"/>`);
    default: // sea-whip
      return svg(`${rock}
        <path d="M56 70C54 50 44 34 38 10M60 70C62 48 58 30 64 8M64 70C70 52 80 40 88 18M58 70C50 56 36 48 26 30" stroke="${hue}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`);
  }
}

/** the portrait for an almanac creature id */
export function creatureArt(id: string): string {
  switch (id) {
    case "blue-whale":
      return whale("#4a6f8c", hex(C.belly));
    case "pod-whale":
      return whale(hex(C.wildSkin), hex(C.wildBelly));
    case "krill":
      return krill();
    case "squid":
      return squid();
    case "ship":
      return ship();
  }
  if ((CORAL_IDS as readonly string[]).includes(id)) return coral(id);
  return fish(id);
}

const TIER_FILL: Record<TrophyTier, [string, string]> = {
  bronze: ["#c98a55", "#8a5a34"],
  silver: ["#d6dee2", "#8c9aa2"],
  gold: ["#f2c96b", "#b08a32"],
};

/** a trophy cup in the tier's metal */
export function trophyArt(tier: TrophyTier): string {
  const [hi, lo] = TIER_FILL[tier];
  return `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M14 8H34V18C34 25 29 29 24 29C19 29 14 25 14 18Z" fill="${hi}"/>
    <path d="M14 11H8C8 18 11 21 15 21M34 11H40C40 18 37 21 33 21" stroke="${lo}" stroke-width="2.4" fill="none"/>
    <path d="M22 29H26V35H22Z" fill="${lo}"/>
    <path d="M15 35H33V40H15Z" fill="${hi}"/>
    <path d="M18 11C18 17 19 21 22 24" stroke="#fff" stroke-width="1.6" fill="none" opacity=".35"/>
  </svg>`;
}
