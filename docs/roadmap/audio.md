# Audio

**Current state:** `ARCHITECTURE.md` §12 and §1 — a hand-built WebAudio graph, no audio library. A
low sine-cluster ambient bed (~46–92 Hz) through a heavy low-pass, fading in over the first few
seconds of a run. Calls (player song, pod replies, joins, tail-kick, surface impacts) are
frequency-swept sines with a feedback delay, each with its own sweep/level; pod replies attenuate
with distance. Master volume is the only option; the audio context suspends on pause.

This is a small, self-contained system (`systems/AudioSystem.ts`, no update loop — `ARCHITECTURE.md`
§4 lists it as render-only, driven entirely by the `audio:call` event). That's a good sign for how
cheap most of the items below should be to add.

## 1. Audio is load-bearing for mechanics, with no non-audio fallback

**Why this matters:** song/sonar (`ARCHITECTURE.md` §5) and ship noise (§7) are both core
mechanics conveyed through sound *and* a visual ring/footprint — but the audio side carries real
information (chorus strength, ship proximity, pod replies) that a player with audio off or hearing
loss gets none of. The visual rings already exist, so this isn't "add a whole new modality," it's
"make sure the existing visual side is never strictly secondary to the audio cue."

**Do:** audit whether any state change is audio-only (i.e., has no visual tell at all). The design
doc doesn't currently document one, but it's worth confirming directly against `SongSystem` and
`PodSystem` rather than assuming from the design doc's prose. See also `ux-accessibility-mobile.md`
for the broader accessibility framing this sits under.

## 2. No per-zone ambient variation

**Current state:** one ambient bed, fading in once at run start. `ARCHITECTURE.md` Part I §7
describes five zones with distinct water colour and mood (continental shelf → open blue → shipping
lane → seamount chain → warm water) but the audio doesn't appear to shift with them.

**Do:** the cheapest version is modulating the existing bed's filter cutoff / amplitude per zone
(reuse `config/zones.ts` / `config/route.ts`'s `zoneAt()` read-through, already consumed by the HUD
and water texture) rather than adding new sound sources — keeps the "quiet, unhurried" tone intact
while making the shipping lane audibly tenser than the open blue.

## 3. No music/score layer

**Current state:** ambient bed + event-driven calls only; no melodic or rhythmic layer at all. This
may be entirely intentional given the design doc's "quiet, unhurried, naturalistic" pillar and "no
fail-spam" framing — flagging it here as a decision to make explicitly (silence-as-design vs.
gap-to-fill), not as an assumed gap.

## 4. Options are minimal

**Current state:** master volume only (`ARCHITECTURE.md` §11, `localStorage["long-water:opts"]`).
No separate ambient/call/SFX mix, no mute-specific-cue toggle. Low priority relative to the items
above — only worth doing once there's more than one audio "layer" to actually separate.
