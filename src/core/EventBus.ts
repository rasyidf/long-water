/**
 * Typed publish/subscribe. This is the primary decoupling seam: systems never
 * import each other, they emit and listen for events on the bus that lives in
 * the GameContext.
 *
 * Add a mechanic by adding its events to `GameEvents` and emitting/handling
 * them; no existing system needs to change.
 */

import type { Vec2 } from "./math";

export interface GameEvents {
  /** any key pressed while the title/end card is up */
  "game:start": void;
  "game:over": { won: boolean };
  "game:restart": void;
  "game:pause": void;
  "game:resume": void;
  /** persist / rehydrate the run via localStorage */
  "game:save": void;
  "game:load": void;
  /** master audio volume, 0..1 */
  "audio:volume": number;

  /** a song ring was emitted into the water */
  "song:emitted": {
    x: number;
    y: number;
    strength: number;
    friendly: boolean;
    chorus: number;
  };
  /** a low-frequency audio call to play (freq sweep) */
  "audio:call": {
    f0: number;
    f1: number;
    dur: number;
    vol: number;
    delay?: number;
  };

  "pod:answered": { count: number };
  "pod:joined": { count: number };
  "pod:lost": { count: number };
  "pod:chorus": void;

  "whale:surfaced": { impactVy: number; pos: Vec2 };
  "whale:submerged": { pos: Vec2 };
  /** the whale left the water fast enough to somersault; `flips` full turns,
   * `up` the upward speed at the surface (drives the cinematic's airtime) */
  "whale:breach": { flips: number; up: number; pos: Vec2 };
  /** the whale came back down after clearing the surface — pairs with the
   * exit for trick scoring. `cleanArc` 0..1 = how square the re-entry was to a
   * whole number of turns (1 = nose-first, 0 = belly-flop). */
  "whale:reentry": {
    airtime: number;
    entryVy: number;
    entrySpeed: number;
    turns: number;
    cleanArc: number;
    pos: Vec2;
  };
  "krill:fed": { swarmsFed: number };

  /** points banked — a trick, a feed, or a close pass. `mult` is the flow
   * multiplier already folded into `points`. */
  "score:award": { points: number; label: string; mult: number; pos?: Vec2 };
  /** a one-shot route / pod / depth milestone was reached */
  "score:milestone": { id: string; label: string; points: number };

  /** a squid latched onto the whale */
  "squid:grab": { pos: Vec2 };
  /** a squid strike whiffed; `closeness` 0..1 how near it came */
  "squid:evaded": { closeness: number; pos: Vec2 };
  /** a latched squid was thrown off — `byPod` if the pod did the work */
  "squid:struck": { byPod: boolean; pos: Vec2 };
  /** a latched squid let go on its own */
  "squid:released": { pos: Vec2 };

  /** request a transient on-screen hint */
  "hint:show": { text: string; secs: number };

  /** camera shake request, in screen px */
  "fx:shake": number;
  /** spawn bubbles */
  "fx:bubbles": {
    x: number;
    y: number;
    count: number;
    splash: boolean;
    spread?: number;
  };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(
    type: K,
    handler: Handler<GameEvents[K]>,
  ): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(
    type: K,
    ...payload: GameEvents[K] extends void ? [] : [GameEvents[K]]
  ): void {
    const set = this.handlers.get(type);
    if (!set) return;
    const arg = (payload[0] ?? undefined) as GameEvents[K];
    for (const h of set) (h as Handler<GameEvents[K]>)(arg);
  }

  clear(): void {
    this.handlers.clear();
  }
}
