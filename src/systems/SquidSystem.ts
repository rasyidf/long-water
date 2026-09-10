/**
 * Owns the squid pool and the whale-coupling the brain deliberately doesn't
 * touch.
 *
 *  - **Spawning:** lairs are seed-derived and deterministic — one every
 *    ~`LAIR_SPACING` past `FIRST_LAIR_X`, position jittered by `hash01`. A lair
 *    spawns its squid when the whale closes within `ACTIVATE_DX` and the squid
 *    is removed once the whale is `DESPAWN_DX` past it. `MAX_ACTIVE` cap.
 *  - **Integration:** approach the brain's desired velocity, turn-rate limit,
 *    speed-clamp, integrate, keep off the seabed.
 *  - **Latched:** write `whale.grip`, drain reserves/breath, shake the camera,
 *    and accrue `struggle` from the player's tail-kicks, raw speed, being near
 *    the surface, and pod followers piling on (`PodBrain` steers them in).
 *  - **Events:** re-broadcasts the brain's `fire` as `squid:*` for `ScoreSystem`.
 */
import * as K from "../config/squid";
import type { GameContext } from "../core/GameContext";
import { clampTurn, hash01 } from "../core/math";
import type { System } from "../core/System";
import type { Squid } from "../state/Squid";
import { SquidBrain, type SquidFire } from "./squid/SquidBrain";

const dist = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);

export class SquidSystem implements System {
  readonly name = "squid";

  private readonly brain = new SquidBrain();
  /** lairs whose squid has already been spawned (or spent), by lair index */
  private readonly used = new Set<number>();
  private seed = 0;

  init(ctx: GameContext): void {
    this.seed = ctx.rng.seedValue >>> 0;
    ctx.bus.on("game:restart", () => {
      ctx.squid.squids.length = 0;
      ctx.squid.latched = null;
      ctx.whale.grip = 0;
      this.used.clear();
    });
  }

  update(dt: number, ctx: GameContext): void {
    const { squid, whale, world } = ctx;

    this.manageLairs(ctx);

    let latched: Squid | null = null;

    for (let i = squid.squids.length - 1; i >= 0; i--) {
      const sq = squid.squids[i];

      // despawn once well behind the whale and not currently engaged
      if (
        whale.x - sq.homeX > K.DESPAWN_DX &&
        (sq.state === "lurk" || sq.state === "recover")
      ) {
        squid.squids.splice(i, 1);
        continue;
      }

      const o = this.brain.intent(sq, ctx, dt);

      // approach the desired velocity, then turn-rate + speed limit
      const pvx = sq.vx;
      const pvy = sq.vy;
      const gain = sq.state === "latched" ? 14 : 6;
      sq.vx += (o.dvx - sq.vx) * Math.min(1, gain * dt);
      sq.vy += (o.dvy - sq.vy) * Math.min(1, gain * dt);
      const turned = clampTurn(pvx, pvy, sq.vx, sq.vy, o.turnRate, dt);
      sq.vx = turned.x;
      sq.vy = turned.y;

      const cap = this.speedCap(sq);
      const sp = dist(sq.vx, sq.vy);
      if (sp > cap) {
        sq.vx = (sq.vx / sp) * cap;
        sq.vy = (sq.vy / sp) * cap;
      }

      sq.x += sq.vx * dt;
      sq.y += sq.vy * dt;

      // seabed / ceiling
      const floor = world.floorAt(sq.x) - 140;
      if (sq.y > floor) {
        sq.y = floor;
        if (sq.vy > 0) sq.vy = 0;
      }
      if (sq.y < 80) {
        sq.y = 80;
        if (sq.vy < 0) sq.vy = 0;
      }

      // pose: jet pulse, eased arm flare, eased heading
      sq.jet += dt * (2 + sp / 120);
      sq.flare += (o.flare - sq.flare) * Math.min(1, dt * 4);
      this.easeHeading(sq, ctx, sp, dt);

      if (sq.state === "latched") latched = sq;

      this.fire(ctx, sq, o.fire);
    }

    // ── latched: the passenger ──────────────────────────────────────────────
    squid.latched = latched;
    if (latched) {
      this.ride(ctx, latched, dt);
      whale.grip += (K.GRIP - whale.grip) * Math.min(1, dt * 6);
    } else {
      whale.grip *= 1 - Math.min(1, dt * 3);
      if (whale.grip < 0.01) whale.grip = 0;
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private speedCap(sq: Squid): number {
    switch (sq.state) {
      case "strike":
        return K.STRIKE_SPEED;
      case "flee":
        return K.FLEE_SPEED;
      case "latched":
        return K.STRIKE_SPEED; // must keep up with a breaching whale
      case "stalk":
        return K.STALK_SPEED * 1.15;
      default:
        return K.LURK_SPEED * 1.4;
    }
  }

  /** ease the display heading: mantle-tip leads when swimming, points away from
   *  the whale (arms toward it) on a strike / while latched */
  private easeHeading(
    sq: Squid,
    ctx: GameContext,
    sp: number,
    dt: number,
  ): void {
    let target: number;
    if (
      sq.state === "stalk" ||
      sq.state === "strike" ||
      sq.state === "latched"
    ) {
      // hunting: mantle points away from the whale so the arms track it
      const wb = ctx.whale.body;
      target = Math.atan2(wb.y - sq.y, wb.x - sq.x) + Math.PI;
    } else if (sp > 30) {
      target = Math.atan2(sq.vy, sq.vx); // jetting: mantle leads
    } else {
      return;
    }
    const diff =
      ((target - sq.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    sq.heading += diff * Math.min(1, dt * 6);
  }

  /** drain + struggle while a squid rides the whale */
  private ride(ctx: GameContext, sq: Squid, dt: number): void {
    const { whale, pod, input, bus } = ctx;
    const wb = whale.body;

    whale.energy = Math.max(K.ENERGY_FLOOR, whale.energy - K.DRAIN_ENERGY * dt);
    whale.breath = Math.max(0, whale.breath - K.DRAIN_BREATH * dt);

    sq.struggle += K.STRUGGLE_SPEED * Math.min(1, wb.speed / 500) * dt;
    if (wb.y < 140) sq.struggle += K.STRUGGLE_SURFACE * dt;
    if (input.justPressed("ShiftLeft", "ShiftRight")) {
      sq.struggle += K.STRUGGLE_KICK;
      bus.emit("fx:bubbles", {
        x: sq.x,
        y: sq.y,
        count: 6,
        splash: false,
        spread: 30,
      });
    }

    // pod mobbing — followers PodBrain has steered onto the squid
    let rammers = 0;
    for (const w of pod.followers()) {
      const rd = dist(w.body.x - sq.x, w.body.y - sq.y);
      if (rd < K.RAM_RANGE) {
        rammers++;
        if (rd < 260) {
          // a close rammer shoves the squid and takes a knock back
          sq.vx += (sq.x - w.body.x) * 0.4;
          sq.vy += (sq.y - w.body.y) * 0.4;
        }
      }
    }
    sq.struggle += K.STRUGGLE_POD * rammers * dt;

    if (Math.random() < dt * 3) bus.emit("fx:shake", K.LATCH_SHAKE);
  }

  private fire(ctx: GameContext, sq: Squid, f: SquidFire): void {
    if (!f) return;
    const { bus } = ctx;
    const pos = { x: sq.x, y: sq.y };

    if (f === "grab") {
      bus.emit("squid:grab", { pos });
      bus.emit("fx:shake", 12);
      bus.emit("fx:bubbles", {
        x: sq.x,
        y: sq.y,
        count: 18,
        splash: false,
        spread: 60,
      });
      if (ctx.stats.once("squid-grab")) {
        bus.emit("hint:show", {
          text: "A squid! Kick hard, run for the surface — or let the pod tear it off.",
          secs: 6,
        });
      }
      return;
    }
    if (f === "broke" || f === "released") {
      const byPod = this.podWasClose(ctx, sq);
      bus.emit("squid:struck", { byPod: f === "broke" && byPod, pos });
      bus.emit("fx:bubbles", {
        x: sq.x,
        y: sq.y,
        count: 14,
        splash: false,
        spread: 70,
      });
      return;
    }
    // { evaded }
    bus.emit("squid:evaded", { closeness: f.evaded, pos });
  }

  private podWasClose(ctx: GameContext, sq: Squid): boolean {
    for (const w of ctx.pod.followers()) {
      if (dist(w.body.x - sq.x, w.body.y - sq.y) < K.RAM_RANGE) return true;
    }
    return false;
  }

  // ── lairs ────────────────────────────────────────────────────────────────

  private manageLairs(ctx: GameContext): void {
    const { whale, squid, world } = ctx;
    if (whale.x < K.FIRST_LAIR_X - K.ACTIVATE_DX) return;
    if (squid.squids.length >= K.MAX_ACTIVE) return;

    // which lair indices could be near the whale right now
    const lo = Math.floor(
      (whale.x - K.ACTIVATE_DX - K.FIRST_LAIR_X) / K.LAIR_SPACING,
    );
    const hi = Math.ceil(
      (whale.x + K.ACTIVATE_DX - K.FIRST_LAIR_X) / K.LAIR_SPACING,
    );

    for (let i = Math.max(0, lo); i <= hi; i++) {
      if (this.used.has(i)) continue;
      const h = hash01(this.seed ^ ((i + 1) * 0x9e3779b1));
      const h2 = hash01((this.seed >>> 3) ^ ((i + 7) * 0x85ebca77));
      const lx =
        K.FIRST_LAIR_X + i * K.LAIR_SPACING + (h - 0.5) * K.LAIR_SPACING * 0.8;
      if (Math.abs(whale.x - lx) > K.ACTIVATE_DX) continue;
      if (whale.x > lx + K.DESPAWN_DX) {
        this.used.add(i);
        continue;
      }

      const floor = world.floorAt(lx);
      const ly = Math.min(
        floor - K.LAIR_FLOOR_GAP,
        K.LAIR_Y[0] + h2 * (K.LAIR_Y[1] - K.LAIR_Y[0]),
      );
      if (ly < K.LAIR_Y[0] - 200) continue; // shelf too shallow here — no lair

      this.used.add(i);
      squid.squids.push(this.spawn(i, lx, ly, h2));
      if (squid.squids.length >= K.MAX_ACTIVE) return;
    }
  }

  private spawn(lair: number, x: number, y: number, h: number): Squid {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      heading: Math.PI,
      jet: h * 6,
      flare: 0.18,
      state: "lurk",
      age: 0,
      arousal: 0,
      struggle: 0,
      grip: { x: 0, y: 0 },
      size: 0.8 + h * 0.5,
      ph: h * Math.PI * 2,
      lair,
      homeX: x,
      homeY: y,
      cool: 0,
    };
  }
}
