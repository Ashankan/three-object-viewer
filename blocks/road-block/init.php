<?php

/**
 * Register road-block
 */
add_action('init', function () {
    if ( file_exists( dirname( __FILE__, 3 ) . "/build/block-environment.asset.php" ) ) {
        register_block_type_from_metadata( __DIR__, [
            'title'       => _x( 'Road Block', 'block title', 'three-object-viewer' ),
            'description' => _x( 'A 3D spline ribbon road synced to the media-bar.', 'block description', 'three-object-viewer' ),
        ] );
    }
});

/**
 * Enqueue the scrubber script on pages that contain this block.
 */
add_action('wp_enqueue_scripts', function () {
    global $post;
    if ( ! $post ) return;
    if ( ! has_block( 'three-object-viewer/road-block', $post->ID ) ) return;

    $block_dir = plugin_dir_path( __FILE__ );
    $block_url = plugins_url( '', __FILE__ );

    wp_enqueue_script(
        'road-block-scrubber',
        $block_url . '/frontend-init.js',
        [],
        filemtime( $block_dir . 'frontend-init.js' ),
        true
    );
});
