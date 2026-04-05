import { useBlockProps } from "@wordpress/block-editor";

export default function save({ attributes }) {
    return (
        <div {...useBlockProps.save()}>
            <div className="three-object-three-app-road-block">
                <p className="road-block-width">{attributes.roadWidth}</p>
                <p className="road-block-segments">{attributes.segments}</p>
                <p className="road-block-ups">{attributes.unitsPerSec}</p>
                <p className="road-block-duration">{attributes.duration}</p>
            </div>
        </div>
    );
}
