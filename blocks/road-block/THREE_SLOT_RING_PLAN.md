# 3-Slot Ring System — Road Map Transition Architecture

## Goal
Replace the current 2-slot A/B + separate preview system with a 3-slot ring where maps rotate through roles (active → previous → recycled → next) without unmounting. This eliminates the visual glitch of the preview disappearing and reloading on song change.

## Current Architecture (what exists at commit)
- **Slot A / Slot B**: alternate as active/frozen. Active drives from playhead, frozen latches to active via `anchor + (activePos - origin)`.
- **Preview**: a third RoadMesh that mounts/unmounts via `previewCfg` state. Uses frozen branch with `activePosRef = crossfadeWorldPosRef`, `origin = {0,0,0}`, `anchor = {0,0,0}` to position at the crossfade marker.
- **Problem**: `setPreviewCfg(null)` on song change causes React re-render, unmounting the preview RoadMesh and causing a visible glitch.

## New Architecture: 3-Slot Ring

### Slots
Three persistent slots: **A, B, C**. Each always exists in JSX (renders when cfg is non-null). Roles rotate via refs — no unmounting on role change.

### Roles
At any time, each slot has one role:
- **`active`**: drives from playhead, writes `activePosRef` every frame, writes `crossfadeWorldPosRef` every frame
- **`previous`**: frozen, latches to active map using `anchor + (activePos - origin)` where anchor/origin were snapshotted at freeze time
- **`next`**: frozen, latches to active map the same way, but anchor was set to `crossfadeWorldPosRef` at load time (so it sits at the crossfade marker and follows in lockstep)

### Per-Slot State and Refs
Each slot (A, B, C) gets its own:
```js
const [slotXCfg, setSlotXCfg] = useState(null);   // state — triggers geometry rebuild
const slotXFrozenRef  = useRef(true);               // ref — controls frozen/active branch
const slotXOriginRef  = useRef(null);                // ref — origin snapshot for frozen formula
const slotXAnchorRef  = useRef(null);                // ref — anchor snapshot for frozen formula
```

### Shared Refs (same as current)
```js
const activePosRef         = useRef({ x: 0, y: 0, z: 0 });  // written by active slot every frame
const crossfadeWorldPosRef = useRef({ x: 0, y: 0, z: 0 });  // written by active slot every frame
const roadPlayheadRef      = useRef(0);                       // driven by RAF tick
const rolesRef             = useRef({ active: 'A', previous: null, next: null }); // role assignments
```

### Role Rotation on Song Change (`onSongChange`)

Given roles `{ active: 'A', previous: 'B', next: 'C' }`:

1. **Freeze old active ('A') → becomes previous**:
   - `slotAFrozenRef.current = true`
   - `slotAAnchorRef.current = { ...activePosRef.current }`
   - `slotAOriginRef.current = null` (will be set on first frame by RoadMesh's `if (!originPosRef.current) originPosRef.current = { x, y, z }` — wait, that's the active branch. For frozen, origin must be set here.)

   Actually: the frozen formula needs `origin` to be the value of `activePosRef` at freeze time. The new active map's first frame will write a different `activePosRef`. So:
   - `slotAOriginRef.current = { ...activePosRef.current }` — snapshot what activePos was when we froze

   Wait — this is actually how `originPosRef` already works but there's a subtlety. Currently `originPosRef` is set by the active map on its first frame: `if (!originPosRef.current) originPosRef.current = { x, y, z }`. This is the new active map's first position. The frozen map then uses `origin = originPosRef.current` which is the *new* active map's first position. The formula `anchor + (activePos - origin)` starts at `anchor` (old active's last position) and follows the new active's movement relative to its start.

   In the ring system, each slot has its own `originRef`. When slot A freezes:
   - `slotAAnchorRef.current = { ...activePosRef.current }` — where A was when it froze
   - The origin for A's frozen formula will be: the new active slot's first `activePosRef` value. But A's `originRef` needs to capture this. Since the new active hasn't run yet, we can set `slotAOriginRef.current = null` and have the frozen branch capture `activePosRef.current` on its first frame when origin is null.

   BUT — the existing frozen branch does `if (!anchor || !origin) return;`. It early-returns when origin is null. So the frozen map would skip rendering for one frame until origin is set. That's fine — it's invisible for one frame.

   Actually, let me re-read the existing code more carefully. In the current system, `originPosRef` is SHARED between active and frozen slots. The active slot sets it on first frame. The frozen slot reads it. In the ring system, each slot has its own originRef. The frozen slot's originRef needs to be set to the new active slot's first-frame position.

   **Simplest approach**: when slot A freezes, set `slotAOriginRef.current = null`. On the next frame, the new active slot writes `activePosRef.current`. Then when frozen slot A runs its useFrame, it checks `if (!origin) return` — skips that one frame. On the NEXT frame... wait, origin is still null because nothing sets it.

   The problem is that in the current system, `originPosRef` is shared — the active slot writes it, the frozen slot reads it. In the ring system with per-slot origins, who writes the frozen slot's origin?

   **Solution**: don't use per-slot origins for the previous role. Instead, at freeze time, set `slotAOriginRef.current = null`. Then in the frozen branch of `useFrame`, when origin is null, capture `activePosRef.current` and set it: `if (!slotAOriginRef.current) slotAOriginRef.current = { ...activePosRef.current }`. This is equivalent to the current shared-origin pattern but per-slot.

   Wait — that won't work because `useFrame` runs the frozen branch which currently does:
   ```js
   const origin = originPosRef.current;
   if (!anchor || !origin) return;
   ```
   It reads `originPosRef.current` but doesn't write it. The ACTIVE branch writes it:
   ```js
   if (!originPosRef.current) originPosRef.current = { x, y, z };
   ```

   So in the current system, the active slot writes to the shared `originPosRef`, and the frozen slot reads from it. Both point to the same ref object.

   In the ring system, each slot has its own originRef. When slot C becomes active, it needs to write to its own `slotCOriginRef` on its first frame. But the frozen slot A needs to read from... what? It needs to know where the new active started. It can't read from `slotCOriginRef` because we don't want cross-slot ref sharing.

   **Better solution**: keep `originPosRef` as a SHARED ref (not per-slot) for the active-to-previous handoff. The active slot writes it, the previous slot reads it. This is exactly how it works now. The only change is that we also need a separate mechanism for the next-slot positioning.

   For the **next** role: the anchor is `crossfadeWorldPosRef.current` at load time, and origin is `activePosRef.current` at load time. These are both captured once when the next slot's cfg loads. They don't need to be updated by anyone — they're fixed snapshots that make the frozen formula produce `crossfadeCenter + activeMovement`.

### Revised Per-Slot Refs

```js
// Per-slot: only cfg (state) and frozen (ref) are truly per-slot
const [slotACfg, setSlotACfg] = useState(null);
const [slotBCfg, setSlotBCfg] = useState(null);
const [slotCCfg, setSlotCCfg] = useState(null);
const slotAFrozenRef = useRef(true);
const slotBFrozenRef = useRef(true);
const slotCFrozenRef = useRef(true);

// Per-slot anchor refs (set at freeze/load time, read by frozen branch)
const slotAAnchorRef = useRef(null);
const slotBAnchorRef = useRef(null);
const slotCAnchorRef = useRef(null);

// Per-slot origin refs (set at freeze/load time or captured on first frozen frame)
const slotAOriginRef = useRef(null);
const slotBOriginRef = useRef(null);
const slotCOriginRef = useRef(null);

// Shared (active slot writes, frozen slots read)
const activePosRef         = useRef({ x: 0, y: 0, z: 0 });
const crossfadeWorldPosRef = useRef({ x: 0, y: 0, z: 0 });
const roadPlayheadRef      = useRef(0);
const rolesRef             = useRef({ active: 'A', previous: null, next: null });
```

### RoadMesh.js Changes
**Minimal.** Add one line to the frozen branch: if `originPosRef.current` is null, capture `activePosRef.current` as origin before using it. This replaces the shared-origin pattern:

```js
if (frozenRef.current) {
    const anchor = frozenAnchorRef.current;
    if (!anchor) return;
    // Auto-capture origin on first frozen frame if not set
    if (!originPosRef.current) originPosRef.current = { ...activePosRef.current };
    const origin = originPosRef.current;
    const active = activePosRef.current;
    x = anchor.x + (active.x - origin.x);
    y = anchor.y + (active.y - origin.y);
    z = anchor.z + (active.z - origin.z);
} else {
    // ... active branch unchanged
}
```

The active branch no longer needs `if (!originPosRef.current) originPosRef.current = { x, y, z }` since that was for the shared-origin pattern. Remove it.

The `crossfadeWorldPosRef` write stays in the active branch (unchanged).

### onSongChange Rotation (detailed)

```js
function onSongChange(mapPostId) {
    prevMapPostIdRef.current = mapPostId;
    const roles = rolesRef.current;
    const wasActive   = roles.active;    // e.g. 'A'
    const wasPrevious = roles.previous;  // e.g. 'B' (or null on first change)
    const wasNext     = roles.next;      // e.g. 'C' (or null)

    // 1. Freeze old active → becomes previous
    getSlotFrozenRef(wasActive).current = true;
    getSlotAnchorRef(wasActive).current = { ...activePosRef.current };
    getSlotOriginRef(wasActive).current = null; // will auto-capture on first frozen frame

    // 2. Old next → becomes active (if it has cfg; otherwise fetch will load it)
    if (wasNext) {
        getSlotFrozenRef(wasNext).current = false;
        getSlotOriginRef(wasNext).current = null; // active branch doesn't use it
        getSlotAnchorRef(wasNext).current = null;
    }

    // 3. Old previous → recycled → will become next
    //    Clear its cfg to free geometry. Will be loaded with next track's data.
    if (wasPrevious) {
        getSlotCfgSetter(wasPrevious)(null);
        getSlotFrozenRef(wasPrevious).current = true;
        getSlotAnchorRef(wasPrevious).current = null;
        getSlotOriginRef(wasPrevious).current = null;
    }

    // 4. Update roles
    rolesRef.current = {
        active: wasNext || wasActive,  // next takes over, or active stays if no next
        previous: wasActive,
        next: wasPrevious,             // recycled slot becomes the new next
    };

    roadPlayheadRef.current = 0;

    // 5. Fetch active map cfg (into the new active slot) if needed
    if (mapPostId) fetchRoadCfg();
}
```

### fetchRoadCfg Changes
Instead of using `activeSlotRef` to pick between A/B, use `rolesRef.current.active` to determine which slot setter to call:

```js
const setActive = getSlotCfgSetter(rolesRef.current.active);
setActive(newCfg);
getSlotFrozenRef(rolesRef.current.active).current = false;
// Then fetch preview into the next slot
fetchPreviewRoadCfg();
```

### fetchPreviewRoadCfg Changes
Load cfg into the `next` role's slot:

```js
function fetchPreviewRoadCfg() {
    const nextSlot = rolesRef.current.next;
    if (!nextSlot) return;
    const nextId = getNextMapPostId();
    if (!nextId) { getSlotCfgSetter(nextSlot)(null); return; }
    // ... fetch ...
    .then((cfg) => {
        getSlotCfgSetter(nextSlot)(cfg);
        getSlotFrozenRef(nextSlot).current = true;
        // Anchor at crossfade marker, origin at current active pos
        getSlotAnchorRef(nextSlot).current = { ...crossfadeWorldPosRef.current };
        getSlotOriginRef(nextSlot).current = { ...activePosRef.current };
    });
}
```

### Helper Functions
```js
function getSlotFrozenRef(slot) {
    if (slot === 'A') return slotAFrozenRef;
    if (slot === 'B') return slotBFrozenRef;
    return slotCFrozenRef;
}
function getSlotCfgSetter(slot) {
    if (slot === 'A') return setSlotACfg;
    if (slot === 'B') return setSlotBCfg;
    return setSlotCCfg;
}
function getSlotAnchorRef(slot) {
    if (slot === 'A') return slotAAnchorRef;
    if (slot === 'B') return slotBAnchorRef;
    return slotCAnchorRef;
}
function getSlotOriginRef(slot) {
    if (slot === 'A') return slotAOriginRef;
    if (slot === 'B') return slotBOriginRef;
    return slotCOriginRef;
}
```

### JSX (three persistent slots)
```jsx
{props.roadToAdd && slotACfg && (
    <Suspense fallback={null}>
        <RoadMesh
            cfg={slotACfg}
            playheadRef={roadPlayheadRef}
            frozenRef={slotAFrozenRef}
            activePosRef={activePosRef}
            originPosRef={slotAOriginRef}
            frozenAnchorRef={slotAAnchorRef}
            crossfadeWorldPosRef={crossfadeWorldPosRef}
            pushed={rolesRef.current.active !== 'A'}
        />
    </Suspense>
)}
{props.roadToAdd && slotBCfg && (
    <Suspense fallback={null}>
        <RoadMesh
            cfg={slotBCfg}
            playheadRef={roadPlayheadRef}
            frozenRef={slotBFrozenRef}
            activePosRef={activePosRef}
            originPosRef={slotBOriginRef}
            frozenAnchorRef={slotBAnchorRef}
            crossfadeWorldPosRef={crossfadeWorldPosRef}
            pushed={rolesRef.current.active !== 'B'}
        />
    </Suspense>
)}
{props.roadToAdd && slotCCfg && (
    <Suspense fallback={null}>
        <RoadMesh
            cfg={slotCCfg}
            playheadRef={roadPlayheadRef}
            frozenRef={slotCFrozenRef}
            activePosRef={activePosRef}
            originPosRef={slotCOriginRef}
            frozenAnchorRef={slotCAnchorRef}
            crossfadeWorldPosRef={crossfadeWorldPosRef}
            pushed={rolesRef.current.active !== 'C'}
        />
    </Suspense>
)}
```

### What Gets Removed
- `slotA`, `slotB` state objects (replaced by individual `slotXCfg` states)
- `activeSlotRef` (replaced by `rolesRef`)
- `previewCfg` state (preview is now just the next-role slot)
- `previewFrozenRef`, `previewOriginRef`, `previewAnchorRef` (now per-slot refs)
- The `setPreviewCfg(null)` call in `onSongChange` (no more unmount/remount)
- The per-frame read of `crossfadeWorldPosRef` by the preview (preview used frozen branch with activePosRef=crossfadeWorldPosRef — this hack goes away)

### What Stays
- `crossfadeWorldPosRef` — **still written by the active slot every frame** (active branch: `crossfadeWorldPosRef.current = crossfadeCenterLocal + meshPos`). This is NOT removed.
- **New role for `crossfadeWorldPosRef`**: it is only READ ONCE as a snapshot when setting up the next-slot's anchor in `fetchPreviewRoadCfg`. The next slot does NOT read it per-frame. It uses the frozen formula (`anchor + (activePos - origin)`) where `anchor` was set to `crossfadeWorldPosRef.current` at load time.
- `activePosRef` — still shared, written by active, read by frozen slots (both previous AND next use it)
- `roadPlayheadRef` — unchanged
- `getNextMapPostId()` — unchanged
- All of RoadMesh.js internals (geometry, spline, texture, crossfade line) — unchanged
- The `markerIdx` / `crossfadeCenterLocal` / `crossfadeWorldPosRef` write in the active branch — unchanged
- The `crossfadeWorldPosRef` prop on RoadMesh — still passed to all three slots, but only the active one writes to it

### How the next-slot positioning works (critical detail)
The next-slot is frozen. Its anchor/origin are set ONCE when its cfg loads:
```
anchor = crossfadeWorldPosRef.current   // snapshot of crossfade world pos at load time
origin = activePosRef.current           // snapshot of active mesh pos at load time
```
Then every frame the frozen formula gives:
```
pos = anchor + (activePosLive - origin)
    = (xfWorldSnapshot) + (activeLive - activeSnapshot)
    = xfWorldSnapshot + delta
```
Since `xfWorldSnapshot = crossfadeCenterLocal + activeSnapshot`, this simplifies to:
```
pos = crossfadeCenterLocal + activeSnapshot + activeLive - activeSnapshot
    = crossfadeCenterLocal + activeLive
```
Which is exactly: the next map's origin tracks the active map's crossfade center in lockstep. No per-frame computation of crossfade position needed — the frozen formula does it automatically from the one-time snapshots.

### Edge Cases
- **First load**: `rolesRef = { active: 'A', previous: null, next: null }`. Slot A gets cfg from `fetchRoadCfg`. After it loads, `fetchPreviewRoadCfg` loads into slot C (next role assigned to 'C' — need to initialize this).
- **No next track** (pool empty): `getNextMapPostId` returns null, next slot stays empty (cfg null), renders nothing. Fine.
- **Previous button**: `getNextMapPostId` handles log navigation correctly (already fixed in previous session).

### Initial Role Setup
On first `fetchRoadCfg` completion, set roles:
```js
rolesRef.current = { active: 'A', previous: null, next: 'C' };
```
Then `fetchPreviewRoadCfg` loads into slot C.

On first song change:
- A → previous, C → active, null → B (recycled, but there was no previous to recycle)
- `rolesRef.current = { active: 'C', previous: 'A', next: null }`
- Then fetchRoadCfg for the new active (C already has its cfg from preview load... but the cfg might already be correct if next→active transition just unfreezes it without fetching)

Wait — important subtlety: when next becomes active, it already HAS the cfg loaded (from the preview fetch). The active map just needs to unfreeze and let the playhead drive it. `fetchRoadCfg` would overwrite its cfg with... the same data (same map_post_id). That's wasteful but harmless. Or we could skip `fetchRoadCfg` when the new active already has cfg.

**Optimization**: in `onSongChange`, if the new active slot (old next) already has cfg loaded, skip `fetchRoadCfg` and just call `fetchPreviewRoadCfg`. Only call `fetchRoadCfg` if the new active slot has no cfg (edge case: no next was loaded).

### Summary of File Changes

**RoadMesh.js**: 
- Add auto-capture of origin in frozen branch: `if (!originPosRef.current) originPosRef.current = { ...activePosRef.current }`
- Remove `if (!originPosRef.current) originPosRef.current = { x, y, z }` from active branch (no longer needed)

**EnvironmentFront.js**:
- Replace 2-slot + preview with 3-slot ring (state, refs, helpers)
- Rewrite `onSongChange` as role rotation
- Update `fetchRoadCfg` and `fetchPreviewRoadCfg` to use role-based slot selection
- Update JSX to render three persistent slots
- Remove old slot/preview state and refs
