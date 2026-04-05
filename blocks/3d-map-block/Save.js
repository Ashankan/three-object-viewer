import { useBlockProps } from "@wordpress/block-editor";

export default function save({ attributes }) {
    const pts = attributes.controlPoints || [];
    return (
        <div {...useBlockProps.save()}>
            <div className="three-object-three-app-3d-map">
                <p className="tdm-waveform-url">{attributes.waveformUrl}</p>
                <p className="tdm-control-points" data-points={JSON.stringify(pts)}></p>
            </div>
        </div>
    );
}
