== Next to do ==

Need to fix settings from editor-block being passed, road width can't be set.
_ 
Need to add start of track/map marking overlay that blends road stitching with an overlay.
The goal is to make it possible to let track-meta data or something else for that matter style it.
It would be 


== Done in previous edit ==
_ 
Outlines for road  follow the morph.
Set up mesh-warp to affect all layers for the road, both current and for future overlays and objects that may be added.
_ 
warpipng from no playback to full playback:
no playback (0) = straight road, full playback(1) full curvature of road-mesh, driven/animated by addition of playback speed.
_ 
A mesh morph function for when skipping track.
When skipping track the current map geometry gets shifted to the new map right away.
When on song change happens we need to store the splines (control points) in front of the playhead (playhead is at world origin, road moves past) before changing map.
On the new map loaded, the stored control points controls take priority over the control points in the new map for the length that is stored.
This will make the new map appear in the same geometry as the previous map.
On song change it will morph the new map from the stored values to its own values with a transition time of the crossfade duration setting (2s).
This will make a smooth morph transition of the geometry when skipping song.
_ 
need to clip geometry in front of playhead/offset of previous map so that it doesn't show parallel to  current map.
_ 
Need to stitch the crossover mesh points between the 3 maps.
_ 
need to make next map polygon layer higher than current, make sure previous stays below current.
_ 
Fixed smooth scrolling on map transition, still a little jittery
_
fixed pressing previous track puts next map at playhead.
_
added:
3-Slot Ring System — Road Map Transition Architecture
three-object-viewer\blocks\road-block\THREE_SLOT_RING_PLAN.md
_ 
Fixed map id on on next map on pressing previous song.
_ 
need to add next track at crossfade line.
_
fixed crossfade marker position to sit at correct time, and removed marker from previous map so that it doesn't come on top of new map if track is skipped.
_
changed texture to not freeze whilewaiting for next map load, doesn't really help since mesh isn't loaded for next track and it still lags a little.

also added yellow line at crossfade point on road-mesh. the line doesn't align at the correct point.
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