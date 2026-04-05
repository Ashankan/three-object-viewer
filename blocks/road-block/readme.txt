road-block is now a proof of concept that shows a working road system.
But the road-block does not work as needed for the page.
Now the road block stores the road-map and texture in the block post.
The point of the road-block is to visualize the audio content of the media-bar.
This means the source of truth for the road-block needs to be the media-bar.
The road-block needs to load the texture and curvature for the road-block mesh from the "3D map page" post of the playing track set in media-bar.
This means we need a gutenberg editor block for the road-mesh that can be used on the "3D map page" (curvature+texture). It would be nice with a 3D-mesh-map at in it, showing the road map.
Point being: the point is that the road-block shouldn't get its infromation from the enviroment-block, it should always render whatever the media-bar tells it.
The road-block and media-bar plugin is dependent on each other, needs to develop them in sync.

So the road-block just needs MediaBarPlayer.getCurrentTime() and MediaBarPlayer.getDuration() to compute the playhead,
and MediaBarPlayer.getCurrentItem().map_post_id to know which 3D map to load. Simple and clean.