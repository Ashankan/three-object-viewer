import React, { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useLoader } from "@react-three/fiber";
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
	const N = cfg.segments;
	const halfWidth = cfg.roadWidth / 2;
	const totalLen = cfg.duration * cfg.unitsPerSec;

	const sorted = [...cfg.controlPoints].sort((a, b) => a.t - b.t);
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

export function RoadMesh({ cfg, playhead }) {
	const roadRef  = useRef();
	const leftRef  = useRef();
	const rightRef = useRef();

	const { geo, spline } = useMemo(() => buildGeometry(cfg), [cfg]);

	const edgeGeos = useMemo(() => {
		const pos = geo.attributes.position;
		const N = cfg.segments;
		const L = [], R = [];
		for (let i = 0; i <= N; i++) {
			L.push(new THREE.Vector3(pos.getX(i*2),   pos.getY(i*2)   + 0.02, pos.getZ(i*2)));
			R.push(new THREE.Vector3(pos.getX(i*2+1), pos.getY(i*2+1) + 0.02, pos.getZ(i*2+1)));
		}
		return {
			leftGeo:  new THREE.BufferGeometry().setFromPoints(L),
			rightGeo: new THREE.BufferGeometry().setFromPoints(R),
		};
	}, [geo, cfg.segments]);

	const texture = cfg.waveformUrl
		? useLoader(TextureLoader, cfg.waveformUrl)
		: null;

	if (texture) {
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
	}

	useFrame(() => {
		const N = spline.length - 1;
		const t = Math.max(0, Math.min(1, playhead));
		const curIdx = Math.min(Math.floor(t * N), N);
		const p = spline[curIdx];
		const offsetZ = -p.z;

		if (roadRef.current)  roadRef.current.position.set(-p.x, -p.y, -p.z);
		if (leftRef.current)  leftRef.current.position.set(-p.x, -p.y, -p.z);
		if (rightRef.current) rightRef.current.position.set(-p.x, -p.y, -p.z);

		if (texture) texture.offset.y = t;
	});

	return (
		<>
			<mesh ref={roadRef} geometry={geo}>
				<meshBasicMaterial map={texture} color={texture ? undefined : '#333333'} side={THREE.DoubleSide} />
			</mesh>
			<line ref={leftRef} geometry={edgeGeos.leftGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			<line ref={rightRef} geometry={edgeGeos.rightGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
		</>
	);
}
