== Done in previous edit ==
When a new song starts playing (detected by map_post_id change in the RAF tick):

The old road mesh freezes at its last position — polygon-offset so it renders behind the new one
A new road mesh is built from the new song's map config, starting at playhead 0
After 2 seconds the old frozen road is removed
The snapshot of the old road's position is taken at the exact frame the song change is detected (before roadPlayheadRef gets overwritten with the new track's time = 0), which is what fixed the jump-to-0 bug.

== Next to do ==
I would like to make the snapshot offset world origin so that snapshot position becomes 0 at snapshot position, and let playhead still move it.
With this edit the old map should movie in sync with the new map before it's removed.