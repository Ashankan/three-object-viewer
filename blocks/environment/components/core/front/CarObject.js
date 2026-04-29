import { useRef, useEffect } from "react";
import * as THREE from "three";
import { useLoader, useFrame } from "@react-three/fiber";
import { useAnimations } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

export function CarObject({ carCfg, currentHeadingRef, curvatureScaleRef }) {
	const groupRef    = useRef();
	// Tracks the world position of the rear axle each frame
	const rearRef     = useRef(new THREE.Vector3(0, 0, carCfg.carWheelbase));
	// Smoothed heading — prevents stepping from discrete spline segment boundaries
	const smoothH     = useRef({ x: 0, z: -1 });
	// Axle data read from named empties in the GLTF
	// fPos / rPos: local positions of CarFrontAxle and CarRearAxle within gltf.scene
	// localAngle: atan2 of the local rear→front direction (used to cancel model's own orientation)
	const axleDataRef = useRef(null);

	const gltf = useLoader(GLTFLoader, carCfg.carModelUrl, (loader) => {
		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath(threeObjectPluginRoot + "/inc/utils/draco/");
		dracoLoader.setDecoderConfig({ type: "js" });
		loader.setDRACOLoader(dracoLoader);
	});

	const { actions } = useAnimations(gltf.animations, gltf.scene);

	useEffect(() => {
		const frontEmpty = gltf.scene.getObjectByName("CarFrontAxle");
		const rearEmpty  = gltf.scene.getObjectByName("CarRearAxle");
		if (frontEmpty && rearEmpty) {
			// Read local positions while gltf.scene has no parent transform yet
			const fPos = new THREE.Vector3();
			const rPos = new THREE.Vector3();
			frontEmpty.getWorldPosition(fPos);
			rearEmpty.getWorldPosition(rPos);
			const wb = fPos.distanceTo(rPos);
			// Direction rear→front in the model's own local XZ space
			const localAngle = Math.atan2(fPos.x - rPos.x, fPos.z - rPos.z);
			axleDataRef.current = { fPos, rPos, wb, localAngle };
			rearRef.current.set(0, 0, wb);
		}

		const first = Object.values(actions)[0];
		if (first) first.play();
	}, [gltf, actions]);

	useFrame(() => {
		if (!groupRef.current) return;
		const raw = currentHeadingRef.current;

		// Mirror the road's curvature morph so the car aligns with the visual road,
		// not the raw spline (which stays curved even when the road morphs to straight).
		const curvScale = curvatureScaleRef?.current ?? 1.0;
		const morphedX  = raw.x * curvScale;
		const morphedZ  = raw.z;
		const mLen = Math.sqrt(morphedX * morphedX + morphedZ * morphedZ);
		const mx = mLen > 0.0001 ? morphedX / mLen : 0;
		const mz = mLen > 0.0001 ? morphedZ / mLen : -1;

		// Smooth the heading to remove discrete steps at spline segment boundaries
		const sh    = smoothH.current;
		const alpha = 0.08;
		sh.x += (mx - sh.x) * alpha;
		sh.z += (mz - sh.z) * alpha;
		const sLen = Math.sqrt(sh.x * sh.x + sh.z * sh.z);
		if (sLen > 0.0001) { sh.x /= sLen; sh.z /= sLen; }

		const h  = sh;
		const wb = axleDataRef.current?.wb ?? carCfg.carWheelbase;

		// Right vector in XZ = cross(heading, worldUp) = (h.z, -h.x)
		// World position of the front axle: placed halfWheelbase ahead, plus user offsets
		const halfWb  = wb / 2;
		const worldFX = h.x * halfWb + h.z * carCfg.carLateralOffset + h.x * carCfg.carForwardOffset;
		const worldFZ = h.z * halfWb - h.x * carCfg.carLateralOffset + h.z * carCfg.carForwardOffset;

		// Rear axle follows front: stays exactly wheelbase behind, in the direction already travelled
		const rear = rearRef.current;
		const dx   = worldFX - rear.x;
		const dz   = worldFZ - rear.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist > 0.0001) {
			rear.x = worldFX - (dx / dist) * wb;
			rear.z = worldFZ - (dz / dist) * wb;
		}
		const worldRX = rear.x;
		const worldRZ = rear.z;

		const axle = axleDataRef.current;
		if (axle) {
			// World direction rear→front
			const worldAngle = Math.atan2(worldFX - worldRX, worldFZ - worldRZ);
			// Subtract the model's own local rear→front angle so CarFrontAxle and
			// CarRearAxle land exactly on the computed world positions regardless of
			// how the model was oriented in Blender or where its pivot sits.
			const rotY  = worldAngle - axle.localAngle;
			const cosR  = Math.cos(rotY);
			const sinR  = Math.sin(rotY);
			// Rotate the local front axle position by rotY to find where it ends up
			const rotFX = cosR * axle.fPos.x - sinR * axle.fPos.z;
			const rotFZ = sinR * axle.fPos.x + cosR * axle.fPos.z;
			// Offset the group so the rotated CarFrontAxle lands on worldF
			groupRef.current.rotation.y  = rotY;
			groupRef.current.position.set(
				worldFX - rotFX * carCfg.carScale,
				carCfg.carHeightOffset - axle.fPos.y * carCfg.carScale,
				worldFZ - rotFZ * carCfg.carScale
			);
		} else {
			// Fallback (no empties): place group midpoint between axles, face rear→front
			groupRef.current.position.set(
				(worldFX + worldRX) / 2,
				carCfg.carHeightOffset,
				(worldFZ + worldRZ) / 2
			);
			groupRef.current.rotation.y = Math.atan2(worldFX - worldRX, worldFZ - worldRZ);
		}
	});

	return (
		<group ref={groupRef} scale={carCfg.carScale}>
			<primitive object={gltf.scene} />
		</group>
	);
}
