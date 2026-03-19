/**
 * Road Block — Gutenberg Editor Script
 * No build step required. Plain ES5 using wp.* globals.
 */
(function () {
    var el               = wp.element.createElement;
    var useState         = wp.element.useState;
    var useEffect        = wp.element.useEffect;
    var Fragment         = wp.element.Fragment;
    var registerBlockType = wp.blocks.registerBlockType;
    var useBlockProps    = wp.blockEditor.useBlockProps;
    var InspectorControls = wp.blockEditor.InspectorControls;
    var MediaUpload      = wp.blockEditor.MediaUpload;

    var PanelBody     = wp.components.PanelBody;
    var PanelRow      = wp.components.PanelRow;
    var RangeControl  = wp.components.RangeControl;
    var Button        = wp.components.Button;
    var TextControl   = wp.components.TextControl;

    // ── Icon ─────────────────────────────────────────────────────────────────
    var icon = el('svg', { viewBox: '0 0 40 40', xmlns: 'http://www.w3.org/2000/svg', width: 20, height: 20 },
        el('path', { d: 'M4 32 Q12 20 20 16 Q28 12 36 8', stroke: 'currentColor', strokeWidth: 2.5, fill: 'none', strokeLinecap: 'round' }),
        el('path', { d: 'M2 36 Q10 24 20 20 Q30 16 38 12', stroke: 'currentColor', strokeWidth: 1, fill: 'none', strokeLinecap: 'round', strokeDasharray: '2 2' })
    );

    // ── Control Point Row ─────────────────────────────────────────────────────
    function ControlPointRow(props) {
        var pt      = props.pt;
        var idx     = props.idx;
        var total   = props.total;
        var onChange = props.onChange;
        var onDelete = props.onDelete;

        function update(key, val) {
            var next = Object.assign({}, pt);
            next[key] = parseFloat(val) || 0;
            onChange(idx, next);
        }

        return el('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: '40px 1fr 1fr 1fr 28px',
                gap: '4px',
                alignItems: 'center',
                padding: '4px 0',
                borderBottom: '1px solid #2a2a2a',
                fontSize: '12px'
            }
        },
            el('span', { style: { color: '#888', fontFamily: 'monospace', fontSize: '11px' } },
                Math.round(pt.t * 100) + '%'
            ),
            el('input', {
                type: 'number', step: '0.5', value: pt.x,
                style: { width: '100%', fontSize: '11px', padding: '2px 4px', background: '#1a1a1a', color: '#eee', border: '1px solid #333', borderRadius: '2px' },
                onChange: function (e) { update('x', e.target.value); }
            }),
            el('input', {
                type: 'number', step: '0.5', value: pt.y,
                style: { width: '100%', fontSize: '11px', padding: '2px 4px', background: '#1a1a1a', color: '#eee', border: '1px solid #333', borderRadius: '2px' },
                onChange: function (e) { update('y', e.target.value); }
            }),
            el('input', {
                type: 'number', step: '0.01', min: '0', max: '1', value: pt.t,
                style: { width: '100%', fontSize: '11px', padding: '2px 4px', background: '#1a1a1a', color: '#eee', border: '1px solid #333', borderRadius: '2px' },
                onChange: function (e) { update('t', e.target.value); }
            }),
            total > 2
                ? el(Button, {
                    isSmall: true, isDestructive: true,
                    onClick: function () { onDelete(idx); },
                    style: { padding: '0 6px', minWidth: '24px' }
                  }, '×')
                : el('span', {})
        );
    }

    // ── Edit Component ────────────────────────────────────────────────────────
    function Edit(props) {
        var attributes    = props.attributes;
        var setAttributes = props.setAttributes;

        var pts        = attributes.controlPoints || [];
        var waveformUrl = attributes.waveformUrl || '';

        function setPts(newPts) {
            var sorted = newPts.slice().sort(function (a, b) { return a.t - b.t; });
            setAttributes({ controlPoints: sorted });
        }

        function updatePoint(idx, newPt) {
            var next = pts.slice();
            next[idx] = newPt;
            setPts(next);
        }

        function deletePoint(idx) {
            var next = pts.slice();
            next.splice(idx, 1);
            setPts(next);
        }

        function addPoint() {
            // Insert midpoint between last two points
            var last = pts[pts.length - 1] || { t: 1, x: 0, y: 0 };
            var prev = pts[pts.length - 2] || { t: 0, x: 0, y: 0 };
            var newT = Math.min((prev.t + last.t) / 2, 0.99);
            setPts(pts.concat({ t: newT, x: 0, y: 0 }));
        }

        var blockProps = useBlockProps({
            style: {
                minHeight: '120px',
                background: '#0a0a0f',
                color: '#eee',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                padding: '20px'
            }
        });

        return el(Fragment, {},

            el(InspectorControls, {},

                // ── Road Settings ─────────────────────────────────────────
                el(PanelBody, { title: 'Road Settings', initialOpen: true },
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Road Width',
                            value: attributes.roadWidth,
                            min: 0.5, max: 16, step: 0.1,
                            onChange: function (v) { setAttributes({ roadWidth: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Segments',
                            help: 'Mesh resolution along the road length',
                            value: attributes.segments,
                            min: 40, max: 400, step: 10,
                            onChange: function (v) { setAttributes({ segments: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Units Per Second',
                            help: 'Road length scale — how many 3D units equal one second of audio',
                            value: attributes.unitsPerSec,
                            min: 1, max: 30, step: 0.5,
                            onChange: function (v) { setAttributes({ unitsPerSec: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(TextControl, {
                            label: 'Duration (seconds)',
                            help: 'Total track duration. Will be set automatically when synced to media-bar.',
                            type: 'number',
                            value: String(attributes.duration),
                            onChange: function (v) { setAttributes({ duration: parseFloat(v) || 60 }); }
                        })
                    )
                ),

                // ── Waveform Texture ──────────────────────────────────────
                el(PanelBody, { title: 'Waveform Texture', initialOpen: false },
                    el(PanelRow, {},
                        el('span', { style: { fontSize: '12px', color: '#aaa' } },
                            waveformUrl
                                ? 'Texture: ' + waveformUrl.split('/').pop()
                                : 'No waveform texture set. A procedural fallback will be used.'
                        )
                    ),
                    el(PanelRow, {},
                        el(MediaUpload, {
                            onSelect: function (obj) { setAttributes({ waveformUrl: obj.url }); },
                            allowedTypes: ['image'],
                            value: waveformUrl,
                            render: function (ref) {
                                return el(Button, { isSecondary: true, onClick: ref.open },
                                    waveformUrl ? 'Replace Waveform' : 'Select Waveform Image'
                                );
                            }
                        })
                    ),
                    waveformUrl && el(PanelRow, {},
                        el(Button, {
                            isDestructive: true, isSmall: true,
                            onClick: function () { setAttributes({ waveformUrl: '' }); }
                        }, 'Clear')
                    )
                ),

                // ── Camera ────────────────────────────────────────────────
                el(PanelBody, { title: 'Camera', initialOpen: false },
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Height',
                            value: attributes.camHeight,
                            min: 0.1, max: 6, step: 0.1,
                            onChange: function (v) { setAttributes({ camHeight: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Look Ahead (segments)',
                            help: 'How far ahead the camera looks along the spline',
                            value: attributes.lookAhead,
                            min: 1, max: 40, step: 1,
                            onChange: function (v) { setAttributes({ lookAhead: v }); }
                        })
                    ),
                    el(PanelRow, {},
                        el(RangeControl, {
                            label: 'Field of View',
                            value: attributes.fov,
                            min: 40, max: 100, step: 1,
                            onChange: function (v) { setAttributes({ fov: v }); }
                        })
                    )
                ),

                // ── Centerline Control Points ──────────────────────────────
                el(PanelBody, { title: 'Centerline Control Points', initialOpen: true },
                    el(PanelRow, {},
                        el('div', { style: { width: '100%' } },
                            // Column headers
                            el('div', {
                                style: {
                                    display: 'grid',
                                    gridTemplateColumns: '40px 1fr 1fr 1fr 28px',
                                    gap: '4px',
                                    marginBottom: '4px'
                                }
                            },
                                el('span', { style: { fontSize: '10px', color: '#666', textTransform: 'uppercase' } }, 'time'),
                                el('span', { style: { fontSize: '10px', color: '#666', textTransform: 'uppercase', textAlign: 'center' } }, 'X'),
                                el('span', { style: { fontSize: '10px', color: '#666', textTransform: 'uppercase', textAlign: 'center' } }, 'Y'),
                                el('span', { style: { fontSize: '10px', color: '#666', textTransform: 'uppercase', textAlign: 'center' } }, 't'),
                                el('span', {})
                            ),
                            // Point rows
                            pts.map(function (pt, i) {
                                return el(ControlPointRow, {
                                    key: i,
                                    pt: pt,
                                    idx: i,
                                    total: pts.length,
                                    onChange: updatePoint,
                                    onDelete: deletePoint
                                });
                            }),
                            // Add button
                            el('div', { style: { marginTop: '8px' } },
                                el(Button, {
                                    isSecondary: true,
                                    onClick: addPoint,
                                    style: { width: '100%', justifyContent: 'center' }
                                }, '+ Add Control Point')
                            )
                        )
                    )
                )
            ),

            // ── Block editor preview ──────────────────────────────────────────
            el('div', blockProps,
                el('div', { style: { textAlign: 'center' } },
                    el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '🛣️'),
                    el('strong', {}, 'Road Block'),
                    el('p', { style: { margin: '4px 0 0', fontSize: '12px', color: '#aaa' } },
                        pts.length + ' control points · ' +
                        attributes.duration + 's · ' +
                        (waveformUrl ? waveformUrl.split('/').pop() : 'procedural waveform')
                    )
                )
            )
        );
    }

    // ── Save Component ────────────────────────────────────────────────────────
    function Save(props) {
        var a = props.attributes;
        var blockProps = useBlockProps.save();

        return el('div', blockProps,
            el('div', { className: 'road-block-data' },
                el('p', { className: 'road-width' },      String(a.roadWidth)),
                el('p', { className: 'road-segments' },   String(a.segments)),
                el('p', { className: 'road-ups' },        String(a.unitsPerSec)),
                el('p', { className: 'road-duration' },   String(a.duration)),
                el('p', { className: 'road-cam-height' }, String(a.camHeight)),
                el('p', { className: 'road-look-ahead' }, String(a.lookAhead)),
                el('p', { className: 'road-fov' },        String(a.fov)),
                el('p', { className: 'road-waveform-url' }, a.waveformUrl),
                el('p', {
                    className: 'road-control-points',
                    'data-points': JSON.stringify(a.controlPoints || [])
                }, '')
            )
        );
    }

    // ── Register ──────────────────────────────────────────────────────────────
    registerBlockType('three-object-viewer/road-block', {
        title: 'Road Block',
        description: 'A 3D ribbon road generated from a spline centerline. Syncs to media-bar playhead.',
        category: 'media',
        icon: icon,
        apiVersion: 2,
        attributes: {
            roadWidth:     { type: 'number',  default: 2.5 },
            segments:      { type: 'integer', default: 160 },
            unitsPerSec:   { type: 'number',  default: 8.0 },
            duration:      { type: 'number',  default: 60.0 },
            camHeight:     { type: 'number',  default: 0.8 },
            lookAhead:     { type: 'integer', default: 8 },
            fov:           { type: 'integer', default: 70 },
            waveformUrl:   { type: 'string',  default: '' },
            controlPoints: {
                type: 'array',
                default: [
                    { t: 0.0,  x: 0,  y: 0 },
                    { t: 0.25, x: 8,  y: 0 },
                    { t: 0.5,  x: -6, y: 1 },
                    { t: 0.75, x: 4,  y: 0 },
                    { t: 1.0,  x: 0,  y: 0 }
                ],
                items: { type: 'object' }
            }
        },
        supports: { html: false, multiple: true },
        edit: Edit,
        save: Save
    });

})();
