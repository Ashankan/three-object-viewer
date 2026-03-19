import { registerBlockType } from "@wordpress/blocks";
import Edit from "./Edit";
import Save from "./Save";

const icon = (
	<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" width={20} height={20}>
		<path d="M4 32 Q12 20 20 16 Q28 12 36 8" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
		<path d="M2 36 Q10 24 20 20 Q30 16 38 12" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeDasharray="2 2"/>
	</svg>
);

const blockConfig = require("./block.json");

registerBlockType(blockConfig.name, {
	...blockConfig,
	icon,
	edit: Edit,
	save: Save,
});
