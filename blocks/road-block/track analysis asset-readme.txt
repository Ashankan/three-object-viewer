#That asset may contain:

waveform peaks
spectrum bands over time
beat grid
tempo map
cue markers
MIDI event data
DMX event data
versioning / generation settings

#For each song/post:

the Gutenberg block stores:
asset ID / URL / attachment ID
generation version
maybe quick summary fields
the plugin generates one analysis file
when the post is saved, that file is replaced/updated automatically

#So your development workflow becomes:

edit post/block settings
save post
plugin regenerates one analysis file
old data is overwritten or version-replaced
frontend reads that one file

That avoids post-content bloat and also avoids manual file cleanup.