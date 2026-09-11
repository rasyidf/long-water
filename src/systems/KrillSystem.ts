/**
 * Krill swarms: an amorphous, drifting patch rather than a spinning disc. Each
 * mote rides a slowly evolving eddy field (so neighbours move together and the
 * patch stretches and folds), wanders on its own in short swim bursts, and is
 * held to a breathing, horizontally drawn-out envelope by a pull that stays
 * gentle inside and only firms up past the rim — a fuzzy margin, never a hard
 * ring. Diel vertical migration carries the whole patch; when the whale
 * charges, the envelope contracts (balling up) and motes near the whale scatter
 * around it and fold back in behind. Only swarms near the camera are stepped.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import type { Swarm } from "../state/Fauna";

/** eddy speed per stream-function wave, world units / s */
const EDDY = 12;
/** a mote's own cruising speed at the top of a swim burst */
const SWIM = 26;
/** envelope pull, units / s² — scaled by how far out the mote is */
const PULL = 38;
/** how fast a mote's velocity settles onto eddy + swim, 1 / s */
const RELAX = 1.4;
/** the whale scatters motes inside this radius */
const FLEE_R = 340;
const FLEE = 520;
const VMAX = 360;

// per-swarm eddy waves, rebuilt each step: unit direction, wavenumber, phase
const N_EDDY = 3;
const DX = new Float64Array(N_EDDY);
const DY = new Float64Array(N_EDDY);
const K = new Float64Array(N_EDDY);
const PH = new Float64Array(N_EDDY);

export class KrillSystem implements System {
  readonly name = "krill";

  update(dt: number, ctx: GameContext): void {
    const { krill, camera, clock, whale } = ctx;
    for (const s of krill.swarms) {
      s.lit *= Math.exp(-dt / 4.2);
      if (Math.abs(s.x - camera.x) < 7000)
        stepSwarm(s, dt, clock.t, whale.x, whale.y);
    }
  }
}

export function stepSwarm(
  s: Swarm,
  dt: number,
  t: number,
  wx: number,
  wy: number,
): void {
  const dw = Math.hypot(wx - s.x, wy - s.y);
  const near = dw < s.r + 900;
  s.panic = near
    ? Math.min(1, s.panic + dt * 1.6)
    : Math.max(0, s.panic - dt * 0.7);
  s.y = s.baseY + Math.sin(t * 0.055 + s.ph) * 430; // diel migration
  s.x += Math.sin(t * 0.09 + s.ph * 1.7) * 6 * dt;
  s.r = s.r0 * (1 - 0.32 * s.panic);

  // the envelope: wider than tall, slowly breathing in both axes
  const ex = s.r * (1.15 + 0.25 * Math.sin(t * 0.05 + s.ph));
  const ey = s.r * (0.48 + 0.1 * Math.sin(t * 0.071 + s.ph * 1.3));
  const iex2 = 1 / (ex * ex);
  const iey2 = 1 / (ey * ey);

  // Eddies: travelling waves of a stream function ψ = Σ sin(k·o + φ). Its
  // velocity (∂ψ/∂y, -∂ψ/∂x) is divergence-free, so it shears and folds the
  // patch without clumping it or tearing holes. Directions and wavelengths are
  // seeded by the swarm's phase and veer slowly.
  for (let i = 0; i < N_EDDY; i++) {
    const th = s.ph * (1.7 + i) + i * 2.1 + t * 0.021 * (i - 1);
    DX[i] = Math.cos(th);
    DY[i] = Math.sin(th);
    K[i] = (Math.PI * 2) / (s.r0 * (0.8 + 0.45 * i));
    PH[i] = t * (0.23 + 0.09 * i) + s.ph * (i + 3);
  }

  const eddy = EDDY * (1 - 0.5 * s.panic);
  const swim = SWIM * (1 + 1.2 * s.panic); // agitated when the whale is close
  const pull = PULL * (1 + 1.5 * s.panic);
  const relax = 1 - Math.exp(-RELAX * dt);

  for (const p of s.parts) {
    let tx = 0;
    let ty = 0;
    for (let i = 0; i < N_EDDY; i++) {
      const c = eddy * Math.cos(K[i] * (DX[i] * p.ox + DY[i] * p.oy) + PH[i]);
      tx += DY[i] * c;
      ty -= DX[i] * c;
    }

    // its own wander: a meandering heading, speed arriving in bursts
    const h =
      p.ph * 0.7 +
      Math.sin(t * 0.43 + p.ph * 3.1) * 2.2 +
      Math.sin(t * 0.17 + p.ph) * 3;
    const b = Math.max(0, Math.sin(t * 2.1 + p.ph * 5.3));
    const sp = swim * (0.3 + b * b);
    tx += Math.cos(h) * sp;
    ty += Math.sin(h) * sp * 0.55; // krill hold depth better than heading

    p.vx += (tx - p.vx) * relax;
    p.vy += (ty - p.vy) * relax;

    // envelope pull along the ellipse normal: spring-soft inside, firm past it
    const nx = p.ox * iex2;
    const ny = p.oy * iey2;
    const q = Math.sqrt(p.ox * nx + p.oy * ny);
    const nl = Math.hypot(nx, ny);
    if (nl > 1e-9) {
      const g = (pull * (0.12 * q + 3 * Math.max(0, q - 0.9))) / nl;
      p.vx -= nx * g * dt;
      p.vy -= ny * g * dt;
    }

    // scatter from the whale — they part around it and rejoin behind
    const dx = s.x + p.ox - wx;
    const dy = s.y + p.oy - wy;
    const d = Math.hypot(dx, dy);
    if (d < FLEE_R) {
      const f = ((1 - d / FLEE_R) * FLEE * dt) / (d || 1);
      p.vx += dx * f;
      p.vy += dy * f;
    }

    const v = Math.hypot(p.vx, p.vy);
    if (v > VMAX) {
      p.vx *= VMAX / v;
      p.vy *= VMAX / v;
    }
    p.ox += p.vx * dt;
    p.oy += p.vy * dt;
    p.px = s.x + p.ox;
    p.py = s.y + p.oy;
  }
}
