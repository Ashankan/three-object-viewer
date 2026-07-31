<?php

/**
 * Register render-plane-block (Object Display Block)
 */
add_action('init', function () {
    register_block_type(__DIR__);
});

/**
 * Enqueue the frontend playlist runtime on pages that contain this block.
 * glb-loader.js must load before frontend-init.js.
 *
 * This used to gate on has_block('three-object-viewer/render-plane-block',
 * $post->ID), which only looks at the current post's post_content. On block
 * themes / FSE templates the block can render from a template part or query
 * loop instead, so has_block() silently returns false forever -- that's not
 * a caching problem, so clearing caches never fixes it.
 *
 * render_block_{name} fires for the block no matter where it actually
 * renders from (post content, template part, query loop). We flag its
 * presence there, then do the real enqueue in wp_footer (priority 1, before
 * core's wp_print_footer_scripts at priority 20) so these scripts only load
 * on pages that actually used the block.
 */
(function () {
    $present = false;

    add_filter('render_block_three-object-viewer/render-plane-block', function ($block_content) use (&$present) {
        $present = true;
        return $block_content;
    });

    add_action('wp_footer', function () use (&$present) {
        if (!$present) {
            return;
        }

        $block_dir = plugin_dir_path(__FILE__);
        $block_url = plugins_url('', __FILE__);

        // 1. Our bundled GLB loader (no CDN needed)
        wp_enqueue_script(
            'rpb-glb-loader',
            $block_url . '/glb-loader.js',
            [],
            filemtime($block_dir . 'glb-loader.js'),
            true
        );

        // 2. OrbitControls from CDN (matches THREE r128 already on the page)
        wp_enqueue_script(
            'rpb-orbit-controls',
            'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
            [],
            '0.128.0',
            true
        );

        // 3. Frontend runtime (depends on glb-loader, OrbitControls, and THREE from 3OV)
        wp_enqueue_script(
            'rpb-frontend-init',
            $block_url . '/frontend-init.js',
            ['rpb-glb-loader', 'rpb-orbit-controls'],
            filemtime($block_dir . 'frontend-init.js'),
            true
        );

        // wp_head's style queue (wp_print_styles, priority 8) has already
        // printed by the time wp_footer runs, so wp_enqueue_style() here
        // would silently never make it into the page. Print the tag
        // directly instead.
        printf(
            '<link rel="stylesheet" id="rpb-style-css" href="%s" media="all" />' . "\n",
            esc_url($block_url . '/style.css?ver=' . filemtime($block_dir . 'style.css'))
        );
    }, 1);
})();
