# Fix: Eliminate Previous Map Freeze on Song Change (Revised)

## Problem
When a song change occurs, the previous map freezes for the entire duration of the async `fetchRoadCfg` call. This is because `onSongChange` immediately freezes the old active and nulls `originPosRef`, but the new active's RoadMesh doesn't exist yet (cfg hasn't loaded). The frozen branch early-returns on `if (!origin) return` for potentially hundreds of milliseconds until the fetch completes, React re-renders, and the new active writes origin.

## Why previous approaches failed
1. **Snapshot origin (origin = activePosRef)**: When anchor === origin, frozen formula degenerates to `activePos`. When new active starts at playhead=0, frozen map teleports to origin.
2. **wasFrozenRef transition detection**: Overwrote origin at wrong time, broke frozen formula.
3. **Velocity coasting**: Added complexity to RoadMesh without addressing the root cause, introduced new bugs.

## Root cause (refined)
The transition happens **too early**. `onSongChange` is triggered by the RAF tick detecting `map_post_id` changed, which happens the instant the media bar switches tracks. But the 3D map data for the new track isn't loaded yet — it requires an async REST API fetch. The old active is frozen and the shared origin is nulled *before* there's any new active to write origin.

The old active map should keep driving from the playhead as normal until the new active is actually ready to take over.

## Fix approach: Deferred transition — keep old active running until new active is ready

Split `onSongChange` into two phases:

### Phase 1: Song detected (synchronous, in RAF tick)
When the RAF tick detects `map_post_id` changed:
- Record the new `mapPostId` in `prevMapPostIdRef` (so we don't re-trigger)
- Start `fetchRoadCfg()` to load the new map cfg into the designated new-active slot
- **Do NOT freeze the old active yet** — it keeps driving from playhead normally
- **Do NOT null origin** — the shared refs stay untouched
- Store `pendingTransition` info: which slot is the old active, which is the new active

### Phase 2: New active ready (async, in fetchRoadCfg .then())
When `fetchRoadCfg` completes and sets cfg on the new active slot:
- **NOW** freeze the old active: `frozenRef = true`, snapshot `frozenAnchorRef`, null `originPosRef`
- Unfreeze the new active: `frozenRef = false`
- The new active's RoadMesh is now mounted (cfg was just set) and will run its first `useFrame` on the very next frame
- Origin gap is exactly **1 frame** (the single frame between freezing and the new active's first useFrame), not hundreds of ms

### Why this works
- The old active map keeps moving smoothly during the entire fetch window — no freeze, no jitter
- The playhead keeps updating from the player's currentTime, so the map stays in sync with audio
- When the transition finally executes (in the .then()), it's essentially instant — the new RoadMesh mounts and runs useFrame on the next frame, writing origin immediately
- The 1-frame gap where origin is null is imperceptible (the frozen branch skips one frame, then origin is written)

## Implementation

### EnvironmentFront.js changes

Add a `pendingTransitionRef` to track deferred transitions:

```js
const pendingTransitionRef = useRef(null);
// Shape: { mapPostId, wasActive, wasPrevious, wasNext, newActive, recycledSlot }
```

**Rewrite `onSongChange`** — only do role bookkeeping and start the fetch, don't freeze/unfreeze:

```js
function onSongChange(mapPostId) {
    prevMapPostIdRef.current = mapPostId;
    const roles = rolesRef.current;
    const wasActive   = roles.active;
    const wasPrevious = roles.previous;
    const wasNext     = roles.next;

    // Pick new active slot — never same as wasActive
    let newActive;
    if (wasNext && wasNext !== wasActive) {
        newActive = wasNext;
    } else {
        newActive = ['A','B','C'].find(s => s !== wasActive) || 'B';
    }

    // Recycle old previous
    if (wasPrevious && wasPrevious !== wasActive && wasPrevious !== newActive) {
        getSlotCfgSetter(wasPrevious)(null);
        getSlotFrozenRef(wasPrevious).current = true;
        getSlotAnchorRef(wasPrevious).current = null;
        getSlotOriginRef(wasPrevious).current = null;
    }

    const recycledSlot = ['A','B','C'].find(s => s !== newActive && s !== wasActive) || null;

    // Update roles — but DON'T freeze/unfreeze yet
    rolesRef.current = {
        active: newActive,
        previous: wasActive,
        next: recycledSlot,
    };

    // Store pending transition so fetchRoadCfg can complete it
    pendingTransitionRef.current = { wasActive };

    // Start loading the new active's cfg
    if (mapPostId) {
        fetchRoadCfg();
    }
}
```

**Rewrite `fetchRoadCfg` .then()** — execute the freeze/unfreeze here:

```js
// ... existing cfg parsing ...

// Execute deferred transition if pending
const pending = pendingTransitionRef.current;
if (pending) {
    pendingTransitionRef.current = null;

    // NOW freeze the old active → becomes previous
    getSlotFrozenRef(pending.wasActive).current = true;
    frozenAnchorRef.current = { ...activePosRef.current };
    originPosRef.current = null;
}

// Unfreeze and set cfg on new active
getSlotFrozenRef(activeSlot).current = false;
getSlotOriginRef(activeSlot).current = null;
getSlotAnchorRef(activeSlot).current = null;
getSlotCfgSetter(activeSlot)(newCfg);

// ... existing preview fetch ...
```

### What stays the same
- **RoadMesh.js**: No changes at all. The frozen branch, active branch, origin write (`if (!originPosRef.current)`), and in-place mutation all stay exactly as they are.
- **The playhead RAF tick**: Keeps reading `player.getCurrentTime()` and updating `roadPlayheadRef`. The old active map continues to drive from this playhead normally during the fetch window.
- **The frozen formula**: `anchor + (activePos - origin)` — unchanged. Origin is written by the new active on its first frame (1 frame after the .then() freezes the old active).
- **Preview/next slot logic**: `fetchPreviewRoadCfg` — unchanged.
- **Per-slot vs shared ref conditional in JSX** — unchanged.

### Timing after fix

```
Frame N:   RAF tick detects map_post_id changed
           onSongChange: records pending, starts fetchRoadCfg (async)
           Old active KEEPS RUNNING from playhead — no freeze

Frame N+1..N+K: Old active continues driving normally
                Playhead updates from player.getCurrentTime()
                No visual change — smooth motion continues

Frame N+K: fetchRoadCfg .then() fires:
           - Freezes old active (frozenRef=true, anchor snapshot, origin=null)
           - Sets cfg on new active slot → React re-render → RoadMesh mounts
           
Frame N+K+1: New active's useFrame runs:
             if (!originPosRef.current) originPosRef.current = { x, y, z }  ← SET
             Frozen branch: origin is null → skips ONE frame (imperceptible)

Frame N+K+2: Frozen branch: origin is set, formula works perfectly
             pos = anchor + (newActivePos - origin)  ← smooth
```

The freeze is reduced from ~50-200ms (async fetch time) to exactly **1 frame** (~16ms).

### Edge cases

**Double song change during fetch**: If the user presses next twice quickly, the second `onSongChange` fires while the first fetch is still in-flight. The second call overwrites `pendingTransitionRef` with the new `wasActive`. When the first fetch completes, it reads `pendingTransitionRef` which now has the second transition's data. This is fine — the first fetch's cfg gets set on a slot that will be overwritten by the second fetch anyway. The second fetch will complete and execute the correct transition.

**Natural crossfade (end of track)**: Same flow. The media bar starts the next track, `map_post_id` changes, `onSongChange` fires. The old active continues playing out its last seconds normally while the new cfg loads. When the fetch completes, the transition happens cleanly.

**Player reports stale currentTime during fetch**: The playhead keeps reading from the player. If the player has already switched internally, `getCurrentTime()` may return the new track's time (near 0) while the old active is still running. The old active at playhead=0 would show the start of its map. This is a minor visual artifact during the fetch window. If this is noticeable, a fix would be to cache the old track's last playhead value and coast at that position during the pending window — but this is a refinement, not a blocker.

Actually, looking more carefully: the RAF tick sets `roadPlayheadRef.current = ct / effectiveDur` every frame. After the media bar switches tracks, `ct` jumps to ~0 for the new track. The old active (still running, not frozen yet) reads `playheadRef.current` which is now ~0 — it jumps back to the start of its map. This **IS** a problem.

**Fix for playhead jump**: In the RAF tick, don't update `roadPlayheadRef` while a transition is pending:

```js
function tick() {
    const player = window.MediaBarPlayer;
    if (player) {
        const mapPostId = player.getCurrentItem()?.map_post_id ?? null;
        if (mapPostId !== prevMapPostIdRef.current) onSongChange(mapPostId);
        // Don't update playhead during pending transition — old active
        // should hold its last position, not jump to new track's time=0
        if (!pendingTransitionRef.current) {
            const ct = player.getCurrentTime();
            const dur = player.getDuration();
            const effectiveDur = (isFinite(dur) && dur > 0) ? dur : lastValidDuration;
            if (isFinite(dur) && dur > 0) lastValidDuration = dur;
            if (effectiveDur > 0) roadPlayheadRef.current = ct / effectiveDur;
        }
    }
    raf = requestAnimationFrame(tick);
}
```

This freezes the playhead value during the pending window. The old active holds at its last playhead position (where it was when the user pressed next). The map stays still — no backward jump, no jitter. When the transition completes, the playhead resumes updating from the new track's time.

### Files to change

**`blocks/environment/components/EnvironmentFront.js`**:
1. Add `pendingTransitionRef = useRef(null)`
2. Rewrite `onSongChange`: don't freeze/unfreeze, store pending, start fetch
3. Rewrite `fetchRoadCfg` .then(): execute deferred freeze/unfreeze before setting cfg
4. Update RAF `tick`: don't update playhead while transition is pending

**`blocks/environment/components/core/front/RoadMesh.js`**:
- No changes needed.
