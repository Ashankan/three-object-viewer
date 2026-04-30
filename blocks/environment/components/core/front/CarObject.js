import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useLoader, useFrame } from "@react-three/fiber";
import { useAnimations } from "@react-three/drei";
import { Html } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { RigidBody, CuboidCollider, interactionGroups } from "@react-three/rapier";

const hudButtonStyle = {
	padding: '8px 20px',
	borderRadius: '6px',
	background: 'rgba(0,0,0,0.75)',
	color: 'white',
	border: '1px solid rgba(255,255,255,0.35)',
	fontSize: '13px',
	cursor: 'pointer',
	whiteSpace: 'nowrap',
};

export function CarObject({
	carCfg,
	currentHeadingRef,
	curvatureScaleRef,
	onEnterProximity,
	onExitProximity,
	onEnterCar,
	showEnterButton,
	enterButtonStyle,
	carTransformRef,
	carSeatRef,
}) {
	const groupRef    = useRef();
	const rbRef       = useRef();
	// Smoothed heading — IS the car body angle; the per-frame alpha provides the
	// wheelbase-lag effect. Rear axle is derived from this, not tracked separately.
	const smoothH     = useRef({ x: 0, z: -1 });
	// Axle data read from named empties in the GLTF
	// fPos / rPos: local positions of CarFrontAxle and CarRearAxle within gltf.scene
	// localAngle: atan2 of the local rear→front direction (used to cancel model's own orientation)
	const axleDataRef = useRef(null);
	// Seat empty detected from the GLTF
	const seatBaseRef = useRef(null);

	const gltf = useLoader(GLTFLoader, carCfg.carModelUrl, (loader) => {
		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath(threeObjectPluginRoot + "/inc/utils/draco/");
		dracoLoader.setDecoderConfig({ type: "js" });
		loader.setDRACOLoader(dracoLoader);
	});

	const { actions } = useAnimations(gltf.animations, gltf.scene);

	// Always compute bbox — needed for both the proximity sensor and the solid collider.
	const bbox = useMemo(() => {
		const b = new THREE.Box3().setFromObject(gltf.scene);
		return { size: b.getSize(new THREE.Vector3()), center: b.getCenter(new THREE.Vector3()) };
	}, [gltf]);

	useEffect(() => {
		const frontEmpty = gltf.scene.getObjectByName("CarFrontAxle");
		const rearEmpty  = gltf.scene.getObjectByName("CarRearAxle");
		if (frontEmpty && rearEmpty) {
			const fPos = new THREE.Vector3();
			const rPos = new THREE.Vector3();
			frontEmpty.getWorldPosition(fPos);
			rearEmpty.getWorldPosition(rPos);
			const wb = fPos.distanceTo(rPos);
			const localAngle = Math.atan2(fPos.x - rPos.x, fPos.z - rPos.z);
			axleDataRef.current = { fPos, rPos, wb, localAngle };
		}

		// Detect the driver seat empty — world position is read each frame
		seatBaseRef.current = gltf.scene.getObjectByName("CarSeatBase") ?? null;

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

		const halfWb  = wb / 2;
		// Right = (h.z, -h.x); lateral/forward offsets shift the whole car.
		const centerX = h.z * carCfg.carLateralOffset + h.x * carCfg.carForwardOffset;
		const centerZ = -h.x * carCfg.carLateralOffset + h.z * carCfg.carForwardOffset;
		const worldFX = centerX + h.x * halfWb;
		const worldFZ = centerZ + h.z * halfWb;
		const worldRX = centerX - h.x * halfWb;
		const worldRZ = centerZ - h.z * halfWb;

		const axle = axleDataRef.current;
		if (axle) {
			const worldAngle = Math.atan2(worldFX - worldRX, worldFZ - worldRZ);
			const rotY  = worldAngle - axle.localAngle;
			const cosR  = Math.cos(rotY);
			const sinR  = Math.sin(rotY);
			const rotFX = cosR * axle.fPos.x - sinR * axle.fPos.z;
			const rotFZ = sinR * axle.fPos.x + cosR * axle.fPos.z;
			groupRef.current.rotation.y  = rotY;
			groupRef.current.position.set(
				worldFX - rotFX * carCfg.carScale,
				carCfg.carHeightOffset - axle.fPos.y * carCfg.carScale,
				worldFZ - rotFZ * carCfg.carScale
			);
		} else {
			groupRef.current.position.set(
				(worldFX + worldRX) / 2,
				carCfg.carHeightOffset,
				(worldFZ + worldRZ) / 2
			);
			groupRef.current.rotation.y = Math.atan2(worldFX - worldRX, worldFZ - worldRZ);
		}

		// Always sync the kinematic body so the proximity sensor follows the car
		if (rbRef.current) {
			const p  = groupRef.current.position;
			const ry = groupRef.current.rotation.y;
			rbRef.current.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
			rbRef.current.setNextKinematicRotation(
				new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry)
			);
		}

		// Export car world transform so Player can follow when seated
		if (carTransformRef) {
			const p  = groupRef.current.position;
			const ry = groupRef.current.rotation.y;
			carTransformRef.current.position.set(p.x, p.y, p.z);
			carTransformRef.current.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
		}

		// Export seat world position/rotation if the CarSeatBase empty exists;
		// fall back to bbox center + half height above car bottom.
		if (carSeatRef) {
			if (seatBaseRef.current) {
				seatBaseRef.current.getWorldPosition(carSeatRef.current.position);
				seatBaseRef.current.getWorldQuaternion(carSeatRef.current.quaternion);
			} else if (carTransformRef) {
				const p  = carTransformRef.current.position;
				const cy = bbox.center.y * carCfg.carScale;
				carSeatRef.current.position.set(p.x, p.y + cy + 0.5, p.z);
				carSeatRef.current.quaternion.copy(carTransformRef.current.quaternion);
			}
		}
	});

	const showBillboard = showEnterButton && (enterButtonStyle === 'billboard' || enterButtonStyle === 'both');

	return (
		<>
			<group ref={groupRef}>
				<group scale={carCfg.carScale}>
					<primitive object={gltf.scene} />
				</group>
				{showBillboard && (
					<Html
						position={[0, bbox.size.y * carCfg.carScale + 0.4, 0]}
						center
						distanceFactor={8}
					>
						<button style={hudButtonStyle} onClick={onEnterCar}>Enter Car</button>
					</Html>
				)}
			</group>
			<RigidBody
				ref={rbRef}
				type="kinematicPosition"
				colliders={false}
				scale={[carCfg.carScale, carCfg.carScale, carCfg.carScale]}
			>
				{/* Proximity sensor — always present, slightly larger than the car */}
				<CuboidCollider
					sensor
					args={[bbox.size.x * 0.7, bbox.size.y * 0.6, bbox.size.z * 0.7]}
					position={[bbox.center.x, bbox.center.y, bbox.center.z]}
					collisionGroups={interactionGroups(0, [0])}
					onIntersectionEnter={onEnterProximity}
					onIntersectionExit={onExitProximity}
				/>
				{/* Solid collider — only when collidable is enabled */}
				{carCfg.carCollidable && (
					<CuboidCollider
						args={[bbox.size.x / 2, bbox.size.y / 2, bbox.size.z / 2]}
						position={[bbox.center.x, bbox.center.y, bbox.center.z]}
						collisionGroups={interactionGroups(0, [0, 1])}
					/>
				)}
			</RigidBody>
		</>
	);
}
