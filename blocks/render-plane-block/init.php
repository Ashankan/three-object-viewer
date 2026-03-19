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
 */
add_action('wp_enqueue_scripts', function () {
    global $post;
    if (!$post) return;

    if (has_block('three-object-viewer/render-plane-block', $post->ID)) {
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

        wp_enqueue_style(
            'rpb-style',
            $block_url . '/style.css',
            [],
            filemtime($block_dir . 'style.css')
        );
    }
});
