/**
 * Object Display Block — Gutenberg Editor Script
 * Plain ES5-compatible JS using wp.* globals. No build step required.
 */
(function () {
    var el = wp.element.createElement;
    var __ = wp.i18n.__;
    var registerBlockType = wp.blocks.registerBlockType;
    var useBlockProps = wp.blockEditor.useBlockProps;
    var InspectorControls = wp.blockEditor.InspectorControls;
    var MediaUpload = wp.blockEditor.MediaUpload;
    var Fragment = wp.element.Fragment;

    var Panel         = wp.components.Panel;
    var PanelBody     = wp.components.PanelBody;
    var PanelRow      = wp.components.PanelRow;
    var TextControl   = wp.components.TextControl;
    var RangeControl  = wp.components.RangeControl;
    var ToggleControl = wp.components.ToggleControl;
    var ColorPalette  = wp.blockEditor.ColorPalette;
    var Button        = wp.components.Button;
    var Notice        = wp.components.Notice;

    var icon = el('svg', {
        viewBox: '0 0 40 40',
        xmlns: 'http://www.w3.org/2000/svg',
        width: 20,
        height: 20
    },
        el('rect', { x: 2, y: 6, width: 36, height: 24, rx: 2, strokeWidth: 2, stroke: 'currentColor', fill: 'none' }),
        el('polygon', { points: '15,12 28,19 15,26', fill: 'currentColor' })
    );

    // ─── Playlist Item Row ────────────────────────────────────────────────────
    function PlaylistItemRow(props) {
        var item   = props.item;
        var index  = props.index;
        var total  = props.total;
        var onMove = props.onMove;
        var onRemove = props.onRemove;

        var typeLabel = item.type === 'video' ? '🎬' : '🖼️';
        var name = item.label || item.url.split('/').pop();

        return el('div', {
            style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 0',
                borderBottom: '1px solid #ddd',
                fontSize: '12px'
            }
        },
            el('span', { style: { minWidth: '18px' } }, typeLabel),
            el('span', {
                style: {
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                },
                title: item.url
            }, name),
            el('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px' } },
                el(Button, {
                    isSmall: true,
                    disabled: index === 0,
                    onClick: function () { onMove(index, index - 1); },
                    style: { padding: '0 4px', minWidth: '20px' }
                }, '▲'),
                el(Button, {
                    isSmall: true,
                    disabled: index === total - 1,
                    onClick: function () { onMove(index, index + 1); },
                    style: { padding: '0 4px', minWidth: '20px' }
                }, '▼')
            ),
            el(Button, {
                isSmall: true,
                isDestructive: true,
                onClick: function () { onRemove(index); },
                style: { padding: '0 6px' }
            }, '✕')
        );
    }

    // ─── Edit Component ───────────────────────────────────────────────────────
    function Edit(props) {
        var attributes   = props.attributes;
        var setAttributes = props.setAttributes;

        var playlist     = attributes.playlistItems || [];
        var targetMesh   = attributes.targetMeshName || '';
        var imageDur     = attributes.imageDuration;
        var fadeDur      = attributes.fadeDuration;

        // helpers
        function setPlaylist(newList) {
            setAttributes({ playlistItems: newList });
        }

        function addItem(mediaObj, type) {
            var newItem = { type: type, url: mediaObj.url, label: mediaObj.title || '' };
            setPlaylist(playlist.concat(newItem));
        }

        function removeItem(idx) {
            var next = playlist.slice();
            next.splice(idx, 1);
            setPlaylist(next);
        }

        function moveItem(from, to) {
            var next = playlist.slice();
            var item = next.splice(from, 1)[0];
            next.splice(to, 0, item);
            setPlaylist(next);
        }

        var blockProps = useBlockProps({ style: { minHeight: '160px', background: '#1a1a1a', color: '#eee', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', padding: '20px' } });

        // Editor preview area
        var previewContent = el('div', { style: { textAlign: 'center' } },
            el('div', { style: { fontSize: '36px', marginBottom: '8px' } }, '🖥️'),
            el('strong', {}, 'Object Display Block'),
            el('p', { style: { margin: '4px 0 0', fontSize: '12px', color: '#aaa' } },
                attributes.threeObjectUrl
                    ? ('GLB loaded · ' + playlist.length + ' playlist item(s)' + (targetMesh ? ' → mesh: ' + targetMesh : ' ⚠ no mesh set'))
                    : 'No GLB selected yet — use the sidebar to configure.'
            )
        );

        return el(Fragment, {},
            // ── Inspector Controls ──────────────────────────────────────────
            el(InspectorControls, {},

                // GLB Object panel
                el(PanelBody, { title: 'GLB Object', initialOpen: true },
                    el(PanelRow, {},
                        el('span', {}, 'Select a .glb file from the media library:')
                    ),
                    el(PanelRow, {},
                        el(MediaUpload, {
                            onSelect: function (obj) { setAttributes({ threeObjectUrl: obj.url }); },
                            allowedTypes: ['application/octet-stream', 'model/gltf-binary'],
                            value: attributes.threeObjectUrl,
                            render: function (ref) {
                                return el(Button, { isPrimary: true, onClick: ref.open },
                                    attributes.threeObjectUrl ? 'Replace GLB' : 'Select GLB'
                                );
                            }
                        })
                    ),
                    attributes.threeObjectUrl && el(PanelRow, {},
                        el('code', { style: { fontSize: '10px', wordBreak: 'break-all', color: '#888' } },
                            attributes.threeObjectUrl.split('/').pop()
                        )
                    )
                ),

                // Scene Settings
                el(PanelBody, { title: 'Scene Settings', initialOpen: false },
                    el(PanelRow, {},
                        el(TextControl, {
                            label: 'Loop Animations',
                            help: 'Comma-separated animation names to loop',
                            value: attributes.animations,
                            onChange: function (v) { setAttributes({ animations: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el('span', {}, 'Background color:')
                    ),
                    el(PanelRow, {},
                        el(ColorPalette, {
                            value: attributes.bg_color,
                            onChange: function (v) { setAttributes({ bg_color: v || 'transparent' }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'Scroll Camera Zoom',
                            checked: attributes.hasZoom,
                            onChange: function (v) { setAttributes({ hasZoom: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'Click & Drag Tip',
                            checked: attributes.hasTip,
                            onChange: function (v) { setAttributes({ hasTip: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Zoom',
                            value: attributes.zoom,
                            min: 1, max: 2000,
                            onChange: function (v) { setAttributes({ zoom: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Scale',
                            value: attributes.scale,
                            min: 0, max: 200,
                            onChange: function (v) { setAttributes({ scale: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Position Y',
                            value: attributes.positionY,
                            min: -100, max: 100, step: 0.01,
                            onChange: function (v) { setAttributes({ positionY: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Rotation Y',
                            value: attributes.rotationY,
                            min: -10, max: 10, step: 0.001,
                            onChange: function (v) { setAttributes({ rotationY: v }); }
                        })
                    )
                ),

                // ── Render Plane Playlist ───────────────────────────────────
                el(PanelBody, { title: '📽 Render Plane Playlist', initialOpen: true },

                    // Target mesh name
                    el(PanelRow, {},
                        el(TextControl, {
                            label: 'Target Mesh Name',
                            help: 'Exact mesh name in your GLB scene that the playlist renders onto (e.g. "Screen", "Monitor_Display")',
                            value: targetMesh,
                            onChange: function (v) { setAttributes({ targetMeshName: v }); }
                        })
                    ),

                    !targetMesh && el(PanelRow, {},
                        el(Notice, { status: 'warning', isDismissible: false },
                            'Set a target mesh name to activate the playlist renderer.'
                        )
                    ),

                    // Timing
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Image Duration (seconds)',
                            value: imageDur,
                            min: 1, max: 60,
                            onChange: function (v) { setAttributes({ imageDuration: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Fade Duration (seconds)',
                            value: fadeDur,
                            min: 0.1, max: 5.0, step: 0.1,
                            onChange: function (v) { setAttributes({ fadeDuration: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'Full Viewport Height (100vh)',
                            checked: attributes.canvasHeight === -1,
                            onChange: function (v) { setAttributes({ canvasHeight: v ? -1 : 500 }); }
                        })
                    ),
                    attributes.canvasHeight !== -1 && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Canvas Height (px)',
                            value: attributes.canvasHeight || 500,
                            min: 200, max: 2000, step: 10,
                            onChange: function (v) { setAttributes({ canvasHeight: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Viewport Anchor X (%)',
                            help: 'Shift model left/right in the viewport without moving the orbit pivot',
                            value: attributes.anchorX || 0,
                            min: -50, max: 50, step: 1,
                            onChange: function (v) { setAttributes({ anchorX: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Viewport Anchor Y (%)',
                            help: 'Shift model up/down in the viewport without moving the orbit pivot',
                            value: attributes.anchorY || 0,
                            min: -50, max: 50, step: 1,
                            onChange: function (v) { setAttributes({ anchorY: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'CRT Scanlines',
                            checked: attributes.hasScanlines,
                            onChange: function (v) { setAttributes({ hasScanlines: v }); }
                        })
                    ),
                    attributes.hasScanlines && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Scanlines Opacity',
                            value: attributes.scanlinesOpacity || 0.15,
                            min: 0.02, max: 0.6, step: 0.01,
                            onChange: function (v) { setAttributes({ scanlinesOpacity: v }); }
                        })
                    ),
                    attributes.hasScanlines && el(PanelRow, {},
                        el(TextControl, {
                            label: 'Scanlines Size (px)',
                            type: 'number',
                            value: String(attributes.scanlinesSize || 3),
                            onChange: function (v) { setAttributes({ scanlinesSize: parseInt(v, 10) || 3 }); }
                        })
                    ),
                    attributes.hasScanlines && el(PanelRow, {},
                        el(TextControl, {
                            label: 'Scanlines Drift',
                            help: 'Speed and direction of scanline scroll. Negative = up, positive = down. 0 = static.',
                            type: 'number',
                            value: String(attributes.scanlinesDrift || 0),
                            onChange: function (v) { setAttributes({ scanlinesDrift: parseFloat(v) || 0 }); }
                        })
                    ),

                    // Screen light frustum
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'Screen Light Frustum',
                            help: 'Projects screen edge colours into 3D space as a light cone',
                            checked: attributes.hasVolFog,
                            onChange: function (v) { setAttributes({ hasVolFog: v }); }
                        })
                    ),
                    attributes.hasVolFog && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Intensity',
                            value: attributes.volFogIntensity || 0.8,
                            min: 0.05, max: 3.0, step: 0.05,
                            onChange: function (v) { setAttributes({ volFogIntensity: v }); }
                        })
                    ),
                    attributes.hasVolFog && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Length',
                            help: 'How far the frustum extends behind the screen',
                            value: attributes.volFogLength !== undefined ? attributes.volFogLength : 0.05,
                            min: 0.01, max: 1.0, step: 0.01,
                            onChange: function (v) { setAttributes({ volFogLength: v }); }
                        })
                    ),
                    attributes.hasVolFog && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Max Brightness',
                            help: 'Clamp on glow brightness (0 = no clamp, 1 = very dim)',
                            value: attributes.volFogBrightness !== undefined ? attributes.volFogBrightness : 1.0,
                            min: 0.0, max: 1.0, step: 0.01,
                            onChange: function (v) { setAttributes({ volFogBrightness: v }); }
                        })
                    ),
                    attributes.hasVolFog && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Gradient',
                            help: 'Higher = longer reach, lower = fades quickly',
                            value: attributes.volFogGradient !== undefined ? attributes.volFogGradient : 0.5,
                            min: 0.1, max: 3.0, step: 0.1,
                            onChange: function (v) { setAttributes({ volFogGradient: v }); }
                        })
                    ),
                    attributes.hasVolFog && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Noise Intensity',
                            help: 'How much noise bleeds through as ambient light at all times',
                            value: attributes.volFogNoiseIntensity || 0.0,
                            min: 0.0, max: 1.0, step: 0.01,
                            onChange: function (v) { setAttributes({ volFogNoiseIntensity: v }); }
                        })
                    ),
                    attributes.hasVolFog && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Noise Gradient',
                            help: 'Higher = longer reach, lower = fades quickly',
                            value: attributes.volFogNoiseGradient !== undefined ? attributes.volFogNoiseGradient : 1.0,
                            min: 0.1, max: 3.0, step: 0.1,
                            onChange: function (v) { setAttributes({ volFogNoiseGradient: v }); }
                        })
                    ),
                    attributes.hasVolFog && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Blur',
                            help: 'Screen-space blur radius applied to the glow volume',
                            value: attributes.volFogBlur !== undefined ? attributes.volFogBlur : 2.0,
                            min: 0.0, max: 20.0, step: 0.5,
                            onChange: function (v) { setAttributes({ volFogBlur: v }); }
                        })
                    ),
                    attributes.hasVolFog && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Spread',
                            help: 'How much wider the outer edge is than the screen',
                            value: attributes.volFogSpread || 1.5,
                            min: 1.0, max: 5.0, step: 0.1,
                            onChange: function (v) { setAttributes({ volFogSpread: v }); }
                        })
                    ),

                    // Vignette glow
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'Edge Vignette Glow',
                            help: 'Brightens the image toward screen edges',
                            checked: attributes.hasVignette,
                            onChange: function (v) { setAttributes({ hasVignette: v }); }
                        })
                    ),
                    attributes.hasVignette && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Vignette Intensity',
                            value: attributes.vigIntensity || 0.6,
                            min: 0.1, max: 3.0, step: 0.1,
                            onChange: function (v) { setAttributes({ vigIntensity: v }); }
                        })
                    ),

                    // Fresnel glow
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'Fresnel Edge Glow',
                            help: 'Brightens at glancing view angles, like glass',
                            checked: attributes.hasFresnel,
                            onChange: function (v) { setAttributes({ hasFresnel: v }); }
                        })
                    ),
                    attributes.hasFresnel && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Fresnel Intensity',
                            value: attributes.frIntensity || 0.8,
                            min: 0.1, max: 3.0, step: 0.1,
                            onChange: function (v) { setAttributes({ frIntensity: v }); }
                        })
                    ),
                    attributes.hasFresnel && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Fresnel Power',
                            help: 'Higher = glow only at extreme angles',
                            value: attributes.frPower || 2.0,
                            min: 0.5, max: 8.0, step: 0.5,
                            onChange: function (v) { setAttributes({ frPower: v }); }
                        })
                    ),

                    // Phosphor shimmer
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'Phosphor Shimmer',
                            help: 'Subtle noise variation across the screen surface',
                            checked: attributes.hasPhosphor,
                            onChange: function (v) { setAttributes({ hasPhosphor: v }); }
                        })
                    ),
                    attributes.hasPhosphor && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Shimmer Intensity',
                            value: attributes.phIntensity || 0.04,
                            min: 0.01, max: 0.3, step: 0.01,
                            onChange: function (v) { setAttributes({ phIntensity: v }); }
                        })
                    ),

                    // Reflection
                    el(PanelRow, {},
                        el(ToggleControl, {
                            label: 'Screen Reflection',
                            checked: attributes.hasReflection,
                            onChange: function (v) { setAttributes({ hasReflection: v }); }
                        })
                    ),
                    attributes.hasReflection && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Intensity',
                            value: attributes.reflectionIntensity || 0.5,
                            min: 0.0, max: 2.0, step: 0.05,
                            onChange: function (v) { setAttributes({ reflectionIntensity: v }); }
                        })
                    ),
                    attributes.hasReflection && el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Shininess',
                            help: 'Higher = tighter hotspot',
                            value: attributes.reflectionShininess || 32,
                            min: 2, max: 256, step: 1,
                            onChange: function (v) { setAttributes({ reflectionShininess: v }); }
                        })
                    ),
                    attributes.hasReflection && el(PanelRow, {},
                        el(TextControl, { label: 'Light Dir X', type: 'number',
                            value: String(attributes.lightDirX || 0),
                            onChange: function (v) { setAttributes({ lightDirX: parseFloat(v) || 0 }); }
                        })
                    ),
                    attributes.hasReflection && el(PanelRow, {},
                        el(TextControl, { label: 'Light Dir Y', type: 'number',
                            value: String(attributes.lightDirY !== undefined ? attributes.lightDirY : 1),
                            onChange: function (v) { setAttributes({ lightDirY: parseFloat(v) || 0 }); }
                        })
                    ),
                    attributes.hasReflection && el(PanelRow, {},
                        el(TextControl, { label: 'Light Dir Z', type: 'number',
                            value: String(attributes.lightDirZ !== undefined ? attributes.lightDirZ : 1),
                            onChange: function (v) { setAttributes({ lightDirZ: parseFloat(v) || 0 }); }
                        })
                    ),

                    // Current playlist list
                    playlist.length > 0
                        ? el('div', { style: { marginBottom: '10px' } },
                            playlist.map(function (item, i) {
                                return el(PlaylistItemRow, {
                                    key: i,
                                    item: item,
                                    index: i,
                                    total: playlist.length,
                                    onMove: moveItem,
                                    onRemove: removeItem
                                });
                            })
                          )
                        : el('p', { style: { color: '#888', fontSize: '12px', marginBottom: '8px' } },
                            'No items yet. Add images or videos below.'
                          ),

                    // Add image / video buttons
                    el(PanelRow, {},
                        el(MediaUpload, {
                            onSelect: function (obj) { addItem(obj, 'image'); },
                            allowedTypes: ['image'],
                            multiple: false,
                            render: function (ref) {
                                return el(Button, {
                                    isSecondary: true,
                                    onClick: ref.open,
                                    style: { marginRight: '8px' }
                                }, '+ Add Image');
                            }
                        }),
                        el(MediaUpload, {
                            onSelect: function (obj) { addItem(obj, 'video'); },
                            allowedTypes: ['video'],
                            multiple: false,
                            render: function (ref) {
                                return el(Button, {
                                    isSecondary: true,
                                    onClick: ref.open
                                }, '+ Add Video');
                            }
                        })
                    )
                )
            ),

            // ── Block canvas preview ────────────────────────────────────────
            el('div', blockProps, previewContent)
        );
    }

    // ─── Save Component ───────────────────────────────────────────────────────
    function Save(props) {
        var a = props.attributes;
        var blockProps = useBlockProps.save();

        return el('div', blockProps,
            el('div', { className: 'rpb-three-app' },
                el('p', { className: 'rpb-url' },                  a.threeObjectUrl),
                el('p', { className: 'rpb-scale' },                String(a.scale)),
                el('p', { className: 'rpb-bg-color' },             a.bg_color),
                el('p', { className: 'rpb-zoom' },                 String(a.zoom)),
                el('p', { className: 'rpb-has-zoom' },             a.hasZoom ? '1' : '0'),
                el('p', { className: 'rpb-has-tip' },              a.hasTip ? '1' : '0'),
                el('p', { className: 'rpb-position-y' },           String(a.positionY)),
                el('p', { className: 'rpb-rotation-y' },           String(a.rotationY)),
                el('p', { className: 'rpb-animations' },           a.animations),
                el('p', { className: 'rpb-target-mesh' },          a.targetMeshName),
                el('p', { className: 'rpb-image-duration' },       String(a.imageDuration)),
                el('p', { className: 'rpb-fade-duration' },        String(a.fadeDuration)),
                el('p', { className: 'rpb-canvas-height' },        String(a.canvasHeight || 500)),
                el('p', { className: 'rpb-anchor-x' },             String(a.anchorX || 0)),
                el('p', { className: 'rpb-anchor-y' },             String(a.anchorY || 0)),
                el('p', { className: 'rpb-has-scanlines' },        a.hasScanlines ? '1' : '0'),
                el('p', { className: 'rpb-scanlines-opacity' },    String(a.scanlinesOpacity || 0.15)),
                el('p', { className: 'rpb-scanlines-size' },       String(a.scanlinesSize || 3)),
                el('p', { className: 'rpb-scanlines-drift' },      String(a.scanlinesDrift || 0)),
                el('p', { className: 'rpb-has-vol-fog' },          a.hasVolFog ? '1' : '0'),
                el('p', { className: 'rpb-vol-fog-intensity' },    String(a.volFogIntensity || 0.8)),
                el('p', { className: 'rpb-vol-fog-length' },       String(a.volFogLength !== undefined ? a.volFogLength : 0.05)),
                el('p', { className: 'rpb-vol-fog-spread' },       String(a.volFogSpread || 1.5)),
                el('p', { className: 'rpb-vol-fog-gradient' },     String(a.volFogGradient !== undefined ? a.volFogGradient : 0.5)),
                el('p', { className: 'rpb-vol-fog-noise-intensity' }, String(a.volFogNoiseIntensity || 0.0)),
                el('p', { className: 'rpb-vol-fog-noise-gradient' },  String(a.volFogNoiseGradient !== undefined ? a.volFogNoiseGradient : 1.0)),
                el('p', { className: 'rpb-vol-fog-blur' },         String(a.volFogBlur !== undefined ? a.volFogBlur : 2.0)),
                el('p', { className: 'rpb-vol-fog-brightness' },   String(a.volFogBrightness !== undefined ? a.volFogBrightness : 1.0)),
                el('p', { className: 'rpb-has-vignette' },         a.hasVignette ? '1' : '0'),
                el('p', { className: 'rpb-vig-intensity' },        String(a.vigIntensity || 0.6)),
                el('p', { className: 'rpb-has-fresnel' },          a.hasFresnel ? '1' : '0'),
                el('p', { className: 'rpb-fr-intensity' },         String(a.frIntensity || 0.8)),
                el('p', { className: 'rpb-fr-power' },             String(a.frPower || 2.0)),
                el('p', { className: 'rpb-has-phosphor' },         a.hasPhosphor ? '1' : '0'),
                el('p', { className: 'rpb-ph-intensity' },         String(a.phIntensity || 0.04)),
                el('p', { className: 'rpb-has-reflection' },       a.hasReflection ? '1' : '0'),
                el('p', { className: 'rpb-reflection-intensity' }, String(a.reflectionIntensity || 0.5)),
                el('p', { className: 'rpb-reflection-shininess' }, String(a.reflectionShininess || 32)),
                el('p', { className: 'rpb-light-dir-x' },         String(a.lightDirX || 0)),
                el('p', { className: 'rpb-light-dir-y' },         String(a.lightDirY !== undefined ? a.lightDirY : 1)),
                el('p', { className: 'rpb-light-dir-z' },         String(a.lightDirZ !== undefined ? a.lightDirZ : 1)),
                el('p', {
                    className: 'rpb-playlist',
                    'data-rpb-playlist': JSON.stringify(a.playlistItems || [])
                }, '')
            )
        );
    }

    // ─── Register Block ───────────────────────────────────────────────────────
    registerBlockType('three-object-viewer/render-plane-block', {
        title: 'Object Display Block',
        description: 'A 3D object viewer with a media playlist rendered onto a named mesh surface.',
        category: 'media',
        icon: icon,
        apiVersion: 2,
        attributes: {
            bg_color:       { type: 'string',  default: 'transparent' },
            zoom:           { type: 'integer', default: 1 },
            scale:          { type: 'integer', default: 1 },
            positionY:      { type: 'integer', default: 0 },
            rotationY:      { type: 'integer', default: 0 },
            threeObjectUrl: { type: 'string',  default: '' },
            hasZoom:        { type: 'boolean', default: false },
            hasTip:         { type: 'boolean', default: true },
            deviceTarget:   { type: 'string',  default: '2d' },
            animations:     { type: 'string',  default: '' },
            targetMeshName: { type: 'string',  default: '' },
            playlistItems:  { type: 'array',   default: [], items: { type: 'object' } },
            imageDuration:  { type: 'integer', default: 5 },
            fadeDuration:   { type: 'number',  default: 1.0 },
            canvasHeight:   { type: 'integer', default: 500 },
            anchorX:        { type: 'number',  default: 0 },
            anchorY:        { type: 'number',  default: 0 },
            hasScanlines:      { type: 'boolean', default: false },
            scanlinesOpacity:  { type: 'number',  default: 0.15 },
            scanlinesSize:     { type: 'integer', default: 3 },
            scanlinesDrift:    { type: 'number',  default: 0 },
            hasVolFog:            { type: 'boolean', default: false },
            volFogIntensity:      { type: 'number',  default: 0.8 },
            volFogLength:         { type: 'number',  default: 0.05 },
            volFogSpread:         { type: 'number',  default: 1.5 },
            volFogGradient:       { type: 'number',  default: 0.5 },
            volFogNoiseIntensity: { type: 'number',  default: 0.0 },
            volFogNoiseGradient:  { type: 'number',  default: 1.0 },
            volFogBlur:           { type: 'number',  default: 2.0 },
            volFogBrightness:     { type: 'number',  default: 1.0 },
            hasVignette:         { type: 'boolean', default: false },
            vigIntensity:        { type: 'number',  default: 0.6 },
            hasFresnel:          { type: 'boolean', default: false },
            frIntensity:         { type: 'number',  default: 0.8 },
            frPower:             { type: 'number',  default: 2.0 },
            hasPhosphor:         { type: 'boolean', default: false },
            phIntensity:         { type: 'number',  default: 0.04 },
            hasReflection:       { type: 'boolean', default: false },
            reflectionIntensity: { type: 'number',  default: 0.5 },
            reflectionShininess: { type: 'number',  default: 32 },
            lightDirX:           { type: 'number',  default: 0 },
            lightDirY:           { type: 'number',  default: 1 },
            lightDirZ:           { type: 'number',  default: 1 }
        },
        supports: { html: false, multiple: true },
        edit: Edit,
        save: Save
    });

})();
