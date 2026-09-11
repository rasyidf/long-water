/**
 * Steps the level-placed squid and owns the whale-coupling the brain
 * deliberately doesn't touch.
 *
 *  - **Pool:** squid are placed by the level's `squid` spawn directive and live
 *    for the whole run. Each frame this steps only the ones near the camera
 *    (`CULL_DX`); the rest hold at their lair.
 *  - **Integration:** approach the brain's desired velocity, turn-rate limit,
 *    speed-clamp, integrate, keep off the seabed.
 *  - **Latched:** write `whale.grip`, drain reserves/breath, shake the camera,
 *    and accrue `struggle` from the player's tail-kicks, raw speed, being near
 *    the surface, and pod followers piling on (`PodBrain` steers them in).
 *  - **Events:** re-broadcasts the brain's `fire` as `squid:*` for `ScoreSystem`.
 */
import * as K from "../config/squid";
import type { GameContext } from "../core/GameContext";
import { clampTurn } from "../core/math";
import type { System } from "../core/System";
import type { Squid } from "../state/Squid";
import { SquidBrain, type SquidFire } from "./squid/SquidBrain";

const dist = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);

export class SquidSystem implements System {
  readonly name = "squid";

  private readonly brain = new SquidBrain();

  update(dt: number, ctx: GameContext): void {
    const { squid, whale, world, camera } = ctx;

    let latched: Squid | null = null;

    for (const sq of squid.squids) {
      // idle squid off-screen — but always step one that's engaged
      const engaged = sq.state !== "lurk" && sq.state !== "recover";
      if (!engaged && Math.abs(sq.x - camera.x) > K.CULL_DX) continue;

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
   *  the whale (arms toward it) while hunting */
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
      bus.emit("fx:shake", 10);
      bus.emit("fx:bubbles", {
        x: sq.x,
        y: sq.y,
        count: 16,
        splash: false,
        spread: 55,
      });
      if (ctx.stats.once("squid-grab")) {
        bus.emit("hint:show", {
          text: "Something took hold in the dark. Kick, rise toward the light, or let the pod see it off.",
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
        count: 12,
        splash: false,
        spread: 60,
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
}
