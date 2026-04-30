import { __ } from "@wordpress/i18n";
import { useBlockProps, InspectorControls, MediaUpload } from "@wordpress/block-editor";
import { Panel, PanelBody, PanelRow, RangeControl, TextControl, Button, ToggleControl, SelectControl } from "@wordpress/components";
import "./editor.scss";

export default function Edit({ attributes, setAttributes }) {
    return (
        <div {...useBlockProps()}>
            <InspectorControls>
                <Panel header={__("Road Settings", "three-object-viewer")}>
                    <PanelBody title={__("Geometry", "three-object-viewer")} initialOpen={true}>
                        <PanelRow>
                            <RangeControl label={__("Road Width", "three-object-viewer")}
                                value={attributes.roadWidth} min={0.5} max={16} step={0.1}
                                onChange={(v) => setAttributes({ roadWidth: v })} />
                        </PanelRow>
                        <PanelRow>
                            <RangeControl label={__("Segments", "three-object-viewer")}
                                value={attributes.segments} min={40} max={400} step={10}
                                onChange={(v) => setAttributes({ segments: v })} />
                        </PanelRow>
                        <PanelRow>
                            <RangeControl label={__("Units Per Second", "three-object-viewer")}
                                value={attributes.unitsPerSec} min={1} max={30} step={0.5}
                                onChange={(v) => setAttributes({ unitsPerSec: v })} />
                        </PanelRow>
                        <PanelRow>
                            <TextControl label={__("Duration (seconds)", "three-object-viewer")}
                                type="number" value={String(attributes.duration)}
                                onChange={(v) => setAttributes({ duration: parseFloat(v) || 60 })} />
                        </PanelRow>
                    </PanelBody>
                    <PanelBody title={__("Camera", "three-object-viewer")} initialOpen={false}>
                        <PanelRow>
                            <RangeControl label={__("Height", "three-object-viewer")}
                                value={attributes.camHeight} min={0.1} max={6} step={0.1}
                                onChange={(v) => setAttributes({ camHeight: v })} />
                        </PanelRow>
                        <PanelRow>
                            <RangeControl label={__("Look Ahead (segments)", "three-object-viewer")}
                                value={attributes.lookAhead} min={1} max={40} step={1}
                                onChange={(v) => setAttributes({ lookAhead: v })} />
                        </PanelRow>
                        <PanelRow>
                            <RangeControl label={__("FOV", "three-object-viewer")}
                                value={attributes.fov} min={40} max={100} step={1}
                                onChange={(v) => setAttributes({ fov: v })} />
                        </PanelRow>
                    </PanelBody>
                    <PanelBody title={__("Car Model", "three-object-viewer")} initialOpen={false}>
                        <PanelRow>
                            <span style={{ fontSize: '12px', color: '#666', marginBottom: '8px', display: 'block' }}>
                                {attributes.carModelUrl
                                    ? 'Model: ' + attributes.carModelUrl.split('/').pop()
                                    : 'No car model set.'}
                            </span>
                        </PanelRow>
                        <PanelRow>
                            <MediaUpload
                                onSelect={(obj) => setAttributes({ carModelUrl: obj.url })}
                                allowedTypes={['application/octet-stream', 'model/gltf-binary']}
                                value={attributes.carModelUrl}
                                render={({ open }) => (
                                    <Button isSecondary onClick={open}>
                                        {attributes.carModelUrl ? __("Replace Model", "three-object-viewer") : __("Select Car Model (GLB)", "three-object-viewer")}
                                    </Button>
                                )}
                            />
                        </PanelRow>
                        {attributes.carModelUrl && (
                            <PanelRow>
                                <Button isDestructive isSmall onClick={() => setAttributes({ carModelUrl: '' })}>
                                    {__("Clear", "three-object-viewer")}
                                </Button>
                            </PanelRow>
                        )}
                        <PanelRow>
                            <RangeControl label={__("Height Offset", "three-object-viewer")}
                                help={__("Y offset above road surface.", "three-object-viewer")}
                                value={attributes.carHeightOffset} min={-2} max={2} step={0.01}
                                onChange={(v) => setAttributes({ carHeightOffset: v })} />
                        </PanelRow>
                        <PanelRow>
                            <RangeControl label={__("Lateral Offset", "three-object-viewer")}
                                help={__("X offset from road center (positive = right).", "three-object-viewer")}
                                value={attributes.carLateralOffset} min={-4} max={4} step={0.05}
                                onChange={(v) => setAttributes({ carLateralOffset: v })} />
                        </PanelRow>
                        <PanelRow>
                            <RangeControl label={__("Forward Offset", "three-object-viewer")}
                                help={__("Z offset along road (negative = ahead of camera).", "three-object-viewer")}
                                value={attributes.carForwardOffset} min={-4} max={4} step={0.05}
                                onChange={(v) => setAttributes({ carForwardOffset: v })} />
                        </PanelRow>
                        <PanelRow>
                            <RangeControl label={__("Scale", "three-object-viewer")}
                                value={attributes.carScale} min={0.01} max={5} step={0.01}
                                onChange={(v) => setAttributes({ carScale: v })} />
                        </PanelRow>
                        <PanelRow>
                            <RangeControl label={__("Wheelbase (fallback)", "three-object-viewer")}
                                help={__("Used if model has no CarFrontAxle/CarRearAxle empties.", "three-object-viewer")}
                                value={attributes.carWheelbase} min={0.5} max={8} step={0.1}
                                onChange={(v) => setAttributes({ carWheelbase: v })} />
                        </PanelRow>
                        <PanelRow>
                            <ToggleControl
                                label={__("Collidable", "three-object-viewer")}
                                help={attributes.carCollidable
                                    ? __("Car has a collision body.", "three-object-viewer")
                                    : __("Car is not collidable.", "three-object-viewer")}
                                checked={attributes.carCollidable}
                                onChange={(v) => setAttributes({ carCollidable: v })}
                            />
                        </PanelRow>
                        <PanelRow>
                            <SelectControl
                                label={__("Enter Car Button Style", "three-object-viewer")}
                                help={__("How the 'Enter Car' prompt is displayed when avatar is nearby.", "three-object-viewer")}
                                value={attributes.carEnterButtonStyle}
                                options={[
                                    { label: __("Screen HUD", "three-object-viewer"),            value: "hud" },
                                    { label: __("3D Billboard (above car)", "three-object-viewer"), value: "billboard" },
                                    { label: __("Both", "three-object-viewer"),                  value: "both" },
                                ]}
                                onChange={(v) => setAttributes({ carEnterButtonStyle: v })}
                            />
                        </PanelRow>
                    </PanelBody>
                </Panel>
            </InspectorControls>

            <div className="three-object-viewer-inner">
                <div className="three-object-viewer-inner-edit-container">
                    <svg className="custom-icon custom-icon-cube" viewBox="0 0 40 40" version="1.1" xmlns="http://www.w3.org/2000/svg">
                        <g transform="matrix(1,0,0,1,-1.1686,0.622128)">
                            <path d="M37.485,28.953L21.699,38.067L21.699,19.797L37.485,10.683L37.485,28.953ZM21.218,19.821L21.218,38.065L5.435,28.953L5.435,10.709L21.218,19.821ZM37.207,10.288L21.438,19.392L5.691,10.301L21.46,1.197L37.207,10.288Z" />
                        </g>
                    </svg>
                    <p><b>Road Block</b></p>
                </div>
            </div>
        </div>
    );
}
