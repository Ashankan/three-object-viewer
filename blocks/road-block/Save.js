import { useBlockProps } from "@wordpress/block-editor";

export default function save({ attributes }) {
    return (
        <div {...useBlockProps.save()}>
            <div className="three-object-three-app-road-block">
                <p className="road-block-width">{attributes.roadWidth}</p>
                <p className="road-block-segments">{attributes.segments}</p>
                <p className="road-block-ups">{attributes.unitsPerSec}</p>
                <p className="road-block-duration">{attributes.duration}</p>
                <p className="road-block-car-model-url">{attributes.carModelUrl || ''}</p>
                <p className="road-block-car-height-offset">{attributes.carHeightOffset}</p>
                <p className="road-block-car-lateral-offset">{attributes.carLateralOffset}</p>
                <p className="road-block-car-forward-offset">{attributes.carForwardOffset}</p>
                <p className="road-block-car-scale">{attributes.carScale}</p>
                <p className="road-block-car-wheelbase">{attributes.carWheelbase}</p>
            </div>
        </div>
    );
}
