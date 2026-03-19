import { useBlockProps } from "@wordpress/block-editor";

export default function save({ attributes }) {
	const pts = attributes.controlPoints || [];
	return (
		<div {...useBlockProps.save()}>
			<div className="three-object-three-app-road-block">
				<p className="road-block-width">{attributes.roadWidth}</p>
				<p className="road-block-segments">{attributes.segments}</p>
				<p className="road-block-ups">{attributes.unitsPerSec}</p>
				<p className="road-block-duration">{attributes.duration}</p>
				<p className="road-block-cam-height">{attributes.camHeight}</p>
				<p className="road-block-look-ahead">{attributes.lookAhead}</p>
				<p className="road-block-fov">{attributes.fov}</p>
				<p className="road-block-waveform-url">{attributes.waveformUrl}</p>
				<p
					className="road-block-control-points"
					data-points={JSON.stringify(pts)}
				></p>
			</div>
		</div>
	);
}
