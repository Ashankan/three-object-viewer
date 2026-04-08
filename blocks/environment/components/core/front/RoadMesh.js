import { useRef, useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { TextureLoader } from "three";

function catmullRom(p0, p1, p2, p3, t) {
	const t2 = t * t, t3 = t2 * t;
	return new THREE.Vector3(
		0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
		0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
		0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3)
	);
}

function sampleSpline(worldPts, N) {
	const result = [];
	const segs = worldPts.length - 1;
	for (let i = 0; i <= N; i++) {
		const u = i / N;
		const raw = u * segs;
		const si = Math.min(Math.floor(raw), segs - 1);
		const lt = raw - si;
		const p0 = worldPts[Math.max(si - 1, 0)];
		const p1 = worldPts[si];
		const p2 = worldPts[Math.min(si + 1, worldPts.length - 1)];
		const p3 = worldPts[Math.min(si + 2, worldPts.length - 1)];
		result.push(catmullRom(p0, p1, p2, p3, lt));
	}
	return result;
}

function buildGeometry(cfg) {
	const N = cfg.segments || 160;
	const halfWidth = (cfg.roadWidth || 2.5) / 2;
	const totalLen = (cfg.duration || 60) * (cfg.unitsPerSec || 8);
	const controlPoints = cfg.controlPoints || [];

	const sorted = controlPoints.length >= 2
		? [...controlPoints].sort((a, b) => a.t - b.t)
		: [{ t: 0, x: 0, y: 0 }, { t: 1, x: 0, y: 0 }];

	const worldPts = sorted.map(p => new THREE.Vector3(p.x, p.y || 0, -p.t * totalLen));
	const spline = sampleSpline(worldPts, N);

	const dists = [0];
	for (let i = 1; i < spline.length; i++) dists.push(dists[i-1] + spline[i].distanceTo(spline[i-1]));
	const totalDist = dists[dists.length - 1];

	const positions = new Float32Array((N+1)*2*3);
	const uvs       = new Float32Array((N+1)*2*2);
	const normals   = new Float32Array((N+1)*2*3);
	const indices   = [];

	for (let i = 0; i <= N; i++) {
		const p   = spline[i];
		const nxt = spline[Math.min(i+1, N)];
		const prv = spline[Math.max(i-1, 0)];
		const fwd = new THREE.Vector3().subVectors(nxt, prv).normalize();
		const rt  = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize();

		const L = p.clone().sub(rt.clone().multiplyScalar(halfWidth));
		const R = p.clone().add(rt.clone().multiplyScalar(halfWidth));

		const b = i*6;
		positions[b]=L.x; positions[b+1]=L.y; positions[b+2]=L.z;
		positions[b+3]=R.x; positions[b+4]=R.y; positions[b+5]=R.z;

		const uv = dists[i] / totalDist;
		uvs[i*4]=0; uvs[i*4+1]=uv; uvs[i*4+2]=1; uvs[i*4+3]=uv;

		normals[b]=0; normals[b+1]=1; normals[b+2]=0;
		normals[b+3]=0; normals[b+4]=1; normals[b+5]=0;

		if (i < N) {
			const a = i*2, c = (i+1)*2;
			indices.push(a, c, a+1, a+1, c, c+1);
		}
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
	geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
	geo.setIndex(indices);

	return { geo, spline };
}

function buildCrossfadeLineGeo(geo, markerIdx) {
	const pos = geo.attributes.position;
	const i = markerIdx;
	const L = new THREE.Vector3(pos.getX(i*2),   pos.getY(i*2)   + 0.04, pos.getZ(i*2));
	const R = new THREE.Vector3(pos.getX(i*2+1), pos.getY(i*2+1) + 0.04, pos.getZ(i*2+1));
	return new THREE.BufferGeometry().setFromPoints([L, R]);
}

function buildEdgeGeos(geo, N) {
	const pos = geo.attributes.position;
	const L = [], R = [];
	for (let i = 0; i <= N; i++) {
		L.push(new THREE.Vector3(pos.getX(i*2),   pos.getY(i*2)   + 0.02, pos.getZ(i*2)));
		R.push(new THREE.Vector3(pos.getX(i*2+1), pos.getY(i*2+1) + 0.02, pos.getZ(i*2+1)));
	}
	return {
		leftGeo:  new THREE.BufferGeometry().setFromPoints(L),
		rightGeo: new THREE.BufferGeometry().setFromPoints(R),
	};
}

function RoadMeshWithTexture({ cfg, playheadRef, frozenRef, activePosRef, originPosRef, frozenAnchorRef, crossfadeWorldPosRef, pushed, isActive }) {
	const roadRef  = useRef();
	const leftRef  = useRef();
	const rightRef = useRef();
	const crossfadeMarkerRef = useRef();

	const { geo, spline } = useMemo(() => buildGeometry(cfg), [cfg]);
	const edgeGeos = useMemo(() => buildEdgeGeos(geo, cfg.segments || 160), [geo]);
	const markerIdx = useMemo(() => {
		const N = cfg.segments || 160;
		const playerDur = window.MediaBarPlayer?.getDuration();
		const dur = (isFinite(playerDur) && playerDur > 0) ? playerDur : (cfg.duration || 60);
		const xfSecs = window.MediaBarConfig?.globalCrossfade ?? 2.0;
		return Math.max(0, Math.round((1 - xfSecs / dur) * N));
	}, [cfg]);
	const crossfadeLineGeo = useMemo(() => buildCrossfadeLineGeo(geo, markerIdx), [geo, markerIdx]);
	const crossfadeCenterLocal = useMemo(() => {
		const pos = geo.attributes.position;
		const i = markerIdx;
		return {
			x: (pos.getX(i*2) + pos.getX(i*2+1)) / 2,
			y: (pos.getY(i*2) + pos.getY(i*2+1)) / 2,
			z: (pos.getZ(i*2) + pos.getZ(i*2+1)) / 2,
		};
	}, [geo, markerIdx]);

	const [texture, setTexture] = useState(() => makeProceduralTex());

	useEffect(() => {
		let cancelled = false;
		const loader = new TextureLoader();
		loader.load(
			cfg.waveformUrl,
			(tex) => {
				if (cancelled) { tex.dispose(); return; }
				tex.wrapS = THREE.RepeatWrapping;
				tex.wrapT = THREE.RepeatWrapping;
				setTexture((prev) => { prev.dispose(); return tex; });
			}
		);
		return () => { cancelled = true; };
	}, [cfg.waveformUrl]);

	useFrame(() => {
		if (crossfadeMarkerRef.current) crossfadeMarkerRef.current.visible = !frozenRef.current;
		let x, y, z;
		if (frozenRef.current) {
			const anchor = frozenAnchorRef.current;
			const origin = originPosRef.current;
			const active = activePosRef.current;
			if (!anchor || !origin) return;
			x = anchor.x + (active.x - origin.x);
			y = anchor.y + (active.y - origin.y);
			z = anchor.z + (active.z - origin.z);
		} else {
			const t = Math.max(0, Math.min(1, playheadRef.current));
			const N = spline.length - 1;
			const i0 = Math.min(Math.floor(t * N), N);
			const i1 = Math.min(i0 + 1, N);
			const frac = t * N - i0;
			const p0 = spline[i0], p1 = spline[i1];
			x = -(p0.x + (p1.x - p0.x) * frac);
			y = -(p0.y + (p1.y - p0.y) * frac);
			z = -(p0.z + (p1.z - p0.z) * frac);
			activePosRef.current = { x, y, z };
			if (!originPosRef.current) originPosRef.current = { x, y, z };
			if (crossfadeWorldPosRef) {
				crossfadeWorldPosRef.current = {
					x: crossfadeCenterLocal.x + x,
					y: crossfadeCenterLocal.y + y,
					z: crossfadeCenterLocal.z + z,
				};
			}
		}
		if (roadRef.current)  roadRef.current.position.set(x, y, z);
		if (leftRef.current)  leftRef.current.position.set(x, y, z);
		if (rightRef.current) rightRef.current.position.set(x, y, z);
		if (crossfadeMarkerRef.current) crossfadeMarkerRef.current.position.set(x, y, z);
	});

	return (
		<>
			<mesh ref={roadRef} geometry={geo}>
				<meshBasicMaterial map={texture} side={THREE.DoubleSide} polygonOffset={pushed !== 0} polygonOffsetFactor={pushed} polygonOffsetUnits={pushed} />
			</mesh>
			<line ref={leftRef} geometry={edgeGeos.leftGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			<line ref={rightRef} geometry={edgeGeos.rightGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			<line ref={crossfadeMarkerRef} geometry={crossfadeLineGeo} renderOrder={1}>
				<lineBasicMaterial color={0xffff00} depthTest={false} />
			</line>
		</>
	);
}

function makeProceduralTex() {
	const W = 1024, H = 64;
	const cv = document.createElement('canvas');
	cv.width = W; cv.height = H;
	const ctx = cv.getContext('2d');
	ctx.fillStyle = '#0d0d14';
	ctx.fillRect(0, 0, W, H);
	const drawWave = (col, mirror) => {
		ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath();
		for (let x = 0; x < W; x++) {
			const t = x / W;
			const amp = Math.abs(Math.sin(t*61))*0.5 + Math.abs(Math.sin(t*127))*0.3 + Math.abs(Math.sin(t*23))*0.2;
			const y = mirror ? H/2 + amp*H*0.42 : H/2 - amp*H*0.42;
			x === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
		}
		ctx.stroke();
	};
	drawWave('rgba(232,89,60,0.9)', false);
	drawWave('rgba(232,89,60,0.35)', true);
	const tex = new THREE.CanvasTexture(cv);
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	return tex;
}

function RoadMeshProcedural({ cfg, playheadRef, frozenRef, activePosRef, originPosRef, frozenAnchorRef, crossfadeWorldPosRef, pushed, isActive }) {
	const roadRef  = useRef();
	const leftRef  = useRef();
	const rightRef = useRef();
	const crossfadeMarkerRef = useRef();
	const texture  = useMemo(() => makeProceduralTex(), []);

	const { geo, spline } = useMemo(() => buildGeometry(cfg), [cfg]);
	const edgeGeos = useMemo(() => buildEdgeGeos(geo, cfg.segments || 160), [geo]);
	const markerIdx = useMemo(() => {
		const N = cfg.segments || 160;
		const playerDur = window.MediaBarPlayer?.getDuration();
		const dur = (isFinite(playerDur) && playerDur > 0) ? playerDur : (cfg.duration || 60);
		const xfSecs = window.MediaBarConfig?.globalCrossfade ?? 2.0;
		return Math.max(0, Math.round((1 - xfSecs / dur) * N));
	}, [cfg]);
	const crossfadeLineGeo = useMemo(() => buildCrossfadeLineGeo(geo, markerIdx), [geo, markerIdx]);
	const crossfadeCenterLocal = useMemo(() => {
		const pos = geo.attributes.position;
		const i = markerIdx;
		return {
			x: (pos.getX(i*2) + pos.getX(i*2+1)) / 2,
			y: (pos.getY(i*2) + pos.getY(i*2+1)) / 2,
			z: (pos.getZ(i*2) + pos.getZ(i*2+1)) / 2,
		};
	}, [geo, markerIdx]);

	useFrame(() => {
		if (crossfadeMarkerRef.current) crossfadeMarkerRef.current.visible = !frozenRef.current;
		let x, y, z;
		if (frozenRef.current) {
			const anchor = frozenAnchorRef.current;
			const origin = originPosRef.current;
			const active = activePosRef.current;
			if (!anchor || !origin) return;
			x = anchor.x + (active.x - origin.x);
			y = anchor.y + (active.y - origin.y);
			z = anchor.z + (active.z - origin.z);
		} else {
			const t = Math.max(0, Math.min(1, playheadRef.current));
			const N = spline.length - 1;
			const i0 = Math.min(Math.floor(t * N), N);
			const i1 = Math.min(i0 + 1, N);
			const frac = t * N - i0;
			const p0 = spline[i0], p1 = spline[i1];
			x = -(p0.x + (p1.x - p0.x) * frac);
			y = -(p0.y + (p1.y - p0.y) * frac);
			z = -(p0.z + (p1.z - p0.z) * frac);
			activePosRef.current = { x, y, z };
			if (!originPosRef.current) originPosRef.current = { x, y, z };
			if (crossfadeWorldPosRef) {
				crossfadeWorldPosRef.current = {
					x: crossfadeCenterLocal.x + x,
					y: crossfadeCenterLocal.y + y,
					z: crossfadeCenterLocal.z + z,
				};
			}
		}
		if (roadRef.current)  roadRef.current.position.set(x, y, z);
		if (leftRef.current)  leftRef.current.position.set(x, y, z);
		if (rightRef.current) rightRef.current.position.set(x, y, z);
		if (crossfadeMarkerRef.current) crossfadeMarkerRef.current.position.set(x, y, z);
	});

	return (
		<>
			<mesh ref={roadRef} geometry={geo}>
				<meshBasicMaterial map={texture} side={THREE.DoubleSide} polygonOffset={pushed !== 0} polygonOffsetFactor={pushed} polygonOffsetUnits={pushed} />
			</mesh>
			<line ref={leftRef} geometry={edgeGeos.leftGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			<line ref={rightRef} geometry={edgeGeos.rightGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			<line ref={crossfadeMarkerRef} geometry={crossfadeLineGeo} renderOrder={1}>
				<lineBasicMaterial color={0xffff00} depthTest={false} />
			</line>
		</>
	);
}

export function RoadMesh({ cfg, playheadRef, frozenRef, activePosRef, originPosRef, frozenAnchorRef, crossfadeWorldPosRef, pushed, isActive }) {
	if (cfg.waveformUrl) {
		return <RoadMeshWithTexture cfg={cfg} playheadRef={playheadRef} frozenRef={frozenRef} activePosRef={activePosRef} originPosRef={originPosRef} frozenAnchorRef={frozenAnchorRef} crossfadeWorldPosRef={crossfadeWorldPosRef} pushed={pushed} isActive={isActive} />;
	}
	return <RoadMeshProcedural cfg={cfg} playheadRef={playheadRef} frozenRef={frozenRef} activePosRef={activePosRef} originPosRef={originPosRef} frozenAnchorRef={frozenAnchorRef} crossfadeWorldPosRef={crossfadeWorldPosRef} pushed={pushed} isActive={isActive} />;
}
