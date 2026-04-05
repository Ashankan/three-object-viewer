<?php
add_action('init', function () {
    if ( file_exists( dirname( __FILE__, 3 ) . "/build/block-environment.asset.php" ) ) {
        register_block_type_from_metadata( __DIR__, [
            'title'       => _x( '3D Map', 'block title', 'three-object-viewer' ),
            'description' => _x( 'Stores road curvature and waveform texture for a media-bar track.', 'block description', 'three-object-viewer' ),
        ] );
    }
});
