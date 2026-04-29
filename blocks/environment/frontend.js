const { Component, render } = wp.element;
import React, { Suspense, useRef, useState, useEffect, useMemo } from "react";

import EnvironmentFront from "./components/EnvironmentFront";
import Networking from "./components/Networking";

const threeApp = document.querySelectorAll(
	".three-object-three-app-environment"
);

const modelsToAdd = document.querySelectorAll(
	".three-object-three-app-model-block"
);
const roadDomEl = document.querySelector(
	".three-object-three-app-road-block"
);
const hasRoadBlock = !!document.querySelector('.wp-block-three-object-viewer-road-block');
const roadGeom = roadDomEl ? {
	roadWidth:   parseFloat(roadDomEl.querySelector(".road-block-width")?.textContent)   || 2.5,
	segments:    parseInt(roadDomEl.querySelector(".road-block-segments")?.textContent)  || 160,
	unitsPerSec: parseFloat(roadDomEl.querySelector(".road-block-ups")?.textContent)     || 8,
	duration:    parseFloat(roadDomEl.querySelector(".road-block-duration")?.textContent) || 60,
} : { roadWidth: 2.5, segments: 160, unitsPerSec: 8, duration: 60 };
const carCfg = roadDomEl ? {
	carModelUrl:      roadDomEl.querySelector(".road-block-car-model-url")?.textContent?.trim() || '',
	carHeightOffset:  parseFloat(roadDomEl.querySelector(".road-block-car-height-offset")?.textContent) || 0,
	carLateralOffset: parseFloat(roadDomEl.querySelector(".road-block-car-lateral-offset")?.textContent) || 0,
	carForwardOffset: parseFloat(roadDomEl.querySelector(".road-block-car-forward-offset")?.textContent) || 0,
	carScale:         parseFloat(roadDomEl.querySelector(".road-block-car-scale")?.textContent) || 1.0,
	carWheelbase:     parseFloat(roadDomEl.querySelector(".road-block-car-wheelbase")?.textContent) || 2.5,
} : null;
const npcsToAdd = document.querySelectorAll(
	".three-object-three-app-npc-block"
);
const htmlToAdd = document.querySelectorAll(
	".three-object-three-app-three-text-block"
);
const portalsToAdd = document.querySelectorAll(
	".three-object-three-app-three-portal-block"
);
const sky = document.querySelectorAll(".three-object-three-app-sky-block");
const imagesToAdd = document.querySelectorAll(
	".three-object-three-app-image-block"
);
const spawnToAdd = document.querySelectorAll(
	".three-object-three-app-spawn-point-block"
);
const videosToAdd = document.querySelectorAll(
	".three-object-three-app-video-block"
);
const audiosToAdd = document.querySelectorAll(
	".three-object-three-app-audio-block"
);

const lightsToAdd = document.querySelectorAll(
	".three-object-three-app-light-block"
);

// All blocks.
window.threeApp = threeApp[0].querySelectorAll("div");

threeApp.forEach((threeApp) => {
	if (threeApp) {
		const hdr = document.querySelector(
			"p.three-object-block-hdr"
		)? document.querySelector(
			"p.three-object-block-hdr"
			).innerText : "";

		const spawnPoint =
			spawnToAdd.length !== 0
				? [
						spawnToAdd[0].querySelector(
							"p.spawn-point-block-positionX"
						).innerText,
						spawnToAdd[0].querySelector(
							"p.spawn-point-block-positionY"
						).innerText,
						spawnToAdd[0].querySelector(
							"p.spawn-point-block-positionZ"
						).innerText
				  ]
				: [0, 0, 0];
		const threeUrl = threeApp.querySelector("p.three-object-block-url")
			? threeApp.querySelector("p.three-object-block-url").innerText
			: "";
		const threePreviewImage = threeApp.querySelector(
			"p.three-object-preview-image"
		)
			? threeApp.querySelector("p.three-object-preview-image").innerText
			: "";
		const deviceTarget = threeApp.querySelector(
			"p.three-object-block-device-target"
		)
			? threeApp.querySelector("p.three-object-block-device-target")
					.innerText
			: "2D";
		const backgroundColor = threeApp.querySelector(
			"p.three-object-background-color"
		)
			? threeApp.querySelector("p.three-object-background-color")
					.innerText
			: "#ffffff";
		const zoom = threeApp.querySelector("p.three-object-zoom")
			? threeApp.querySelector("p.three-object-zoom").innerText
			: 90;
		const scale = threeApp.querySelector("p.three-object-scale")
			? threeApp.querySelector("p.three-object-scale").innerText
			: 1;
		const hasZoom = threeApp.querySelector("p.three-object-has-zoom")
			? threeApp.querySelector("p.three-object-has-zoom").innerText
			: false;
		const hasTip = threeApp.querySelector("p.three-object-has-tip")
			? threeApp.querySelector("p.three-object-has-tip").innerText
			: true;
		const positionY = threeApp.querySelector("p.three-object-position-y")
			? threeApp.querySelector("p.three-object-position-y").innerText
			: 0;
		const rotationY = threeApp.querySelector("p.three-object-rotation-y")
			? threeApp.querySelector("p.three-object-rotation-y").innerText
			: 0;
		const animations = threeApp.querySelector("p.three-object-animations")
			? threeApp.querySelector("p.three-object-animations").innerText
			: "";

		render(
			<>
				{/* <div id="networking" style={{position: "absolute", top: 50, zIndex: 100}}>
					<div id="session-id"></div>
					<p>Peers</p>
					<div id="peers"></div>
					<p>Messages</p>
					<div id="messages" style={{display: "none"}}></div>
					<button class="button" id="audio-button">Connect Audio</button>
					<div id="videos"></div>
				</div> */}
				{/* <Networking
						postSlug={postSlug}
						userData={userData}
				/> */}
					<EnvironmentFront
						threeUrl={threeUrl}
						deviceTarget={deviceTarget}
						zoom={zoom}
						scale={scale}
						hasTip={hasTip}
						hasZoom={hasZoom}
						positionY={positionY}
						rotationY={rotationY}
						animations={animations}
						backgroundColor={backgroundColor}
						userData={userData}
						postSlug={postSlug}
						defaultAvatarAnimation={defaultAvatarAnimation}
						modelsToAdd={modelsToAdd}
						portalsToAdd={portalsToAdd}
						imagesToAdd={imagesToAdd}
						videosToAdd={videosToAdd}
						audiosToAdd={audiosToAdd}
						lightsToAdd={lightsToAdd}
						spawnPoint={spawnPoint ? spawnPoint : null}
						htmlToAdd={htmlToAdd}
						npcsToAdd={npcsToAdd}
						sky={sky ? sky : ""}
						previewImage={threePreviewImage}
						hdr ={hdr ? hdr : ""}
						roadToAdd={hasRoadBlock ? true : null}
						roadGeom={roadGeom}
						carCfg={carCfg}
					/>
\			</>,
			threeApp
		);
	}
});
