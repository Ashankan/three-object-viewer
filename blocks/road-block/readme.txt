== Next to do ==

Should look at adding a 3rd container for chaching next-map.
we need a way to measure time in world units so that we can attach the next-map to the right world cordinate on current track (at end but minus crossfade time) and let current track run next-track just like it runs previous-map.
On next track play it should just resync to playhead, Important to let fix the logic so so all 3 containers shuffle correctly.

== Done in previous edit ==
_
Sometimes now; previous-map shows at end of current-map, but not always. It is replaced when next track loads.
Hard to reproduce, but I have witnessed it a couple of times.
The scrub bar also stops working some times, and suddenly it works again:
The fix is clean: RAF still runs every frame for smooth movement, but if el.duration is temporarily NaN during track loading, it falls back to lastValidDuration so the playhead keeps updating without a gap.
_ 
Change freeze duration 2s to remove to "something else" as condition.
The remove condition will be changed in the future when more functionality is in place.
I think a good enough remove condition for this stage is that the old-map isn't removed until current-map becomes old-map.
This way the old map will stay in place when using the scrub on the media-bar.
_
I would like to make the snapshot offset world origin so that snapshot position becomes 0 at snapshot position, and let playhead still move it.
With this edit the old map should movie in sync with the new map before it's removed:
That's it. Every tick, frozenPlayheadRef = frozenOffset + newSongProgress. At the moment of the song change, newSongProgress = 0, so the old road sits exactly where it was frozen. As the new song plays, both roads scroll forward together in sync, with the old one leading ahead by its offset amount until it's removed after 2s.
_ 
When a new song starts playing (detected by map_post_id change in the RAF tick):

The old road mesh freezes at its last position — polygon-offset so it renders behind the new one
A new road mesh is built from the new song's map config, starting at playhead 0
After 2 seconds the old frozen road is removed
The snapshot of the old road's position is taken at the exact frame the song change is detected (before roadPlayheadRef gets overwritten with the new track's time = 0), which is what fixed the jump-to-0 bug.
_