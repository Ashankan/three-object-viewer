import { useRef, useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { TextureLoader } from "three";

// The Three.js texture currently displayed by the active (non-frozen) slot.
// Updated every frame — gated so the newly-activated slot never clobbers it before
// the frozen→active transition can capture it as the "old" texture.
let _activeTexture  = null;
let _activePlayhead = 0;  // playhead (0–1) of the active slot — captured for skip-next UV offset

// ---------------------------------------------------------------------------
// TrackAnalysisCache — fetches pre-analysed frequency JSON files and builds
// Three.js DataTextures in memory. Keeps up to 3 entries (prev/current/next).
// DataTextures are owned here; callers must NOT dispose them.
// ---------------------------------------------------------------------------
const TrackAnalysisCache = (() => {
	const _cache   = new Map(); // url → { meta, frames: Uint8Array, texture: DataTexture|null }
	const _pending = new Map(); // url → Promise

	function load(url) {
		if (_cache.has(url))   return Promise.resolve(_cache.get(url));
		if (_pending.has(url)) return _pending.get(url);

		const p = fetch(url)
			.then(r => r.json())
			.then(json => {
				const b64 = json.frames;
				const binaryStr = atob(b64);
				const frames = new Uint8Array(binaryStr.length);
				for (let i = 0; i < binaryStr.length; i++) frames[i] = binaryStr.charCodeAt(i);
				const entry = { meta: json, frames, texture: null };
				_cache.set(url, entry);
				_pending.delete(url);
				return entry;
			});
		_pending.set(url, p);
		return p;
	}

	function buildTexture(entry) {
		if (entry.texture) return entry.texture;
		const { totalFrames, frequencyBands } = entry.meta;

		const mbCfg        = window.MediaBarConfig || {};
		const cLow         = mbCfg.analysisColorLow  || [0, 85, 255];
		const cMid         = mbCfg.analysisColorMid  || [0, 204, 68];
		const cHigh        = mbCfg.analysisColorHigh || [255, 68, 0];
		const isTransparent = !!mbCfg.analysisTransparent;

		// W = 256 road-width pixels (U axis, left→right)
		// H = totalFrames (V axis, start→end along road)
		const W     = 256;
		const H     = totalFrames;
		const B     = frequencyBands;
		const third = Math.max(1, Math.floor(B / 3));
		// soft anti-alias edge width in normalised U units
		const softPx = 3 / W;
		const data  = new Uint8Array(W * H * 4);

		for (let fi = 0; fi < H; fi++) {
			const rowSrc = fi * B;

			// RMS amplitude across all bands → 0..1
			let sumSq = 0;
			for (let b = 0; b < B; b++) {
				const v = entry.frames[rowSrc + b] / 255;
				sumSq += v * v;
			}
			const amp = Math.sqrt(sumSq / B);

			// Low/mid/high energy for colour blend
			let lowE = 0, midE = 0, highE = 0;
			for (let b = 0; b < third; b++)           lowE  += entry.frames[rowSrc + b];
			for (let b = third; b < 2 * third; b++)   midE  += entry.frames[rowSrc + b];
			for (let b = 2 * third; b < B; b++)       highE += entry.frames[rowSrc + b];
			const total = lowE + midE + highE || 1;
			const wL = lowE / total, wM = midE / total, wH = highE / total;
			const r = Math.round(cLow[0] * wL + cMid[0] * wM + cHigh[0] * wH);
			const g = Math.round(cLow[1] * wL + cMid[1] * wM + cHigh[1] * wH);
			const b = Math.round(cLow[2] * wL + cMid[2] * wM + cHigh[2] * wH);

			const rowDst = fi * W * 4;
			for (let p = 0; p < W; p++) {
				// dist = 0 at road centre, 1 at left/right edge
				const dist  = Math.abs(p / (W - 1) - 0.5) * 2;
				const alpha = Math.max(0, Math.min(1, (amp - dist) / softPx));
				const i4    = rowDst + p * 4;
				if (alpha > 0) {
					data[i4]     = Math.round(r * alpha);
					data[i4 + 1] = Math.round(g * alpha);
					data[i4 + 2] = Math.round(b * alpha);
					data[i4 + 3] = Math.round(alpha * 255);
				} else {
					data[i4] = data[i4 + 1] = data[i4 + 2] = 0;
					data[i4 + 3] = isTransparent ? 0 : 255;
				}
			}
		}

		const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
		tex.wrapS      = THREE.ClampToEdgeWrapping;
		tex.wrapT      = THREE.ClampToEdgeWrapping;
		tex.minFilter  = THREE.LinearFilter;
		tex.magFilter  = THREE.LinearFilter;
		tex.needsUpdate = true;
		entry.texture = tex;
		return tex;
	}

	function evict(keepUrls) {
		for (const [url, entry] of _cache) {
			if (!keepUrls.has(url)) {
				if (entry.texture) { entry.texture.dispose(); entry.texture = null; }
				_cache.delete(url);
			}
		}
	}

	return { load, buildTexture, evict };
})();

export { TrackAnalysisCache };

function catmullRom(p0, p1, p2, p3, t) {
	const t2 = t * t, t3 = t2 * t;
	return new THREE.Vector3(
		0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
		0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
		0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3)
	);
}

function sampleSpline(worldPts, N, phantomPrev = null) {
	const result = [];
	const segs = worldPts.length - 1;
	for (let i = 0; i <= N; i++) {
		const u = i / N;
		const raw = u * segs;
		const si = Math.min(Math.floor(raw), segs - 1);
		const lt = raw - si;
		const p0 = (si === 0 && phantomPrev) ? phantomPrev : worldPts[Math.max(si - 1, 0)];
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
	const phantomPrev = cfg.phantomPrev
		? new THREE.Vector3(cfg.phantomPrev.x, cfg.phantomPrev.y || 0, cfg.phantomPrev.z)
		: null;
	const spline = sampleSpline(worldPts, N, phantomPrev);

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

/**
 * Build "from" position buffer for GPU morph target.
 * Maps old spline[playheadIdx..] → new map's N+1 ribbon samples.
 * Positions are expressed relative to oldSpline[playheadIdx] (the anchor),
 * matching how the new mesh's useFrame offsets it to world origin.
 */
function buildMorphPositions(oldSpline, oldPlayheadIdx, newSpline, halfWidth) {
	const N_new      = newSpline.length - 1;
	const oldFront   = oldSpline.slice(oldPlayheadIdx);
	const N_oldFront = oldFront.length - 1;
	const anchor     = oldFront[0].clone();

	const positions = new Float32Array((N_new + 1) * 2 * 3);

	for (let i = 0; i <= N_new; i++) {
		const u   = N_oldFront > 0 ? (i / N_new) * N_oldFront : 0;
		const oi  = Math.min(Math.floor(u), Math.max(N_oldFront - 1, 0));
		const oi1 = Math.min(oi + 1, N_oldFront);
		const f   = u - oi;

		const p0 = oldFront[oi], p1 = oldFront[oi1];
		const px = p0.x + (p1.x - p0.x) * f - anchor.x;
		const py = p0.y + (p1.y - p0.y) * f - anchor.y;
		const pz = p0.z + (p1.z - p0.z) * f - anchor.z;

		const prv = oldFront[Math.max(oi - 1, 0)];
		const nxt = oldFront[Math.min(oi + 1, N_oldFront)];
		const fwd = new THREE.Vector3().subVectors(nxt, prv).normalize();
		const rt  = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

		const b = i * 6;
		positions[b]   = px - rt.x * halfWidth; positions[b+1] = py - rt.y * halfWidth; positions[b+2] = pz - rt.z * halfWidth;
		positions[b+3] = px + rt.x * halfWidth; positions[b+4] = py + rt.y * halfWidth; positions[b+5] = pz + rt.z * halfWidth;
	}

	return positions;
}

/**
 * Build absolute vertex positions for a "straight" version of this road
 * (all control-point X/Y zeroed).  Used as GPU morph-target slot 0 so that
 * morphTargetInfluences[0] = (1 - playbackSpeed) drives curvature in real-time:
 *   influence  0  → normal curvature (base geometry)
 *   influence  1  → straight road
 *   influence -1  → double curvature
 */
function buildCurvatureMorphPositions(cfg) {
	const straightCfg = {
		...cfg,
		controlPoints: (cfg.controlPoints || []).map(p => ({ ...p, x: 0, y: 0 })),
		phantomPrev: cfg.phantomPrev ? { ...cfg.phantomPrev, x: 0, y: 0 } : null,
	};
	const { geo } = buildGeometry(straightCfg);
	return new Float32Array(geo.attributes.position.array);
}

function buildCrossfadeLineGeo(geo, straightPositions, markerIdx) {
	const pos = geo.attributes.position;
	const i = markerIdx;
	const b = i * 6;
	// Base (curved) positions
	const bLx = pos.getX(i*2),   bLy = pos.getY(i*2)   + 0.04, bLz = pos.getZ(i*2);
	const bRx = pos.getX(i*2+1), bRy = pos.getY(i*2+1) + 0.04, bRz = pos.getZ(i*2+1);
	// Straight positions (for curvature morph CPU lerp)
	const sLx = straightPositions[b],   sLy = straightPositions[b+1] + 0.04, sLz = straightPositions[b+2];
	const sRx = straightPositions[b+3], sRy = straightPositions[b+4] + 0.04, sRz = straightPositions[b+5];
	const lineGeo = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(bLx, bLy, bLz),
		new THREE.Vector3(bRx, bRy, bRz),
	]);
	return {
		geo: lineGeo,
		baseL:     [bLx, bLy, bLz], baseR:     [bRx, bRy, bRz],
		straightL: [sLx, sLy, sLz], straightR: [sRx, sRy, sRz],
	};
}

function buildEdgeGeos(geo, straightPositions, N, transitionFromPos) {
	const pos = geo.attributes.position;
	const L = [], R = [];
	for (let i = 0; i <= N; i++) {
		L.push(new THREE.Vector3(pos.getX(i*2),   pos.getY(i*2)   + 0.02, pos.getZ(i*2)));
		R.push(new THREE.Vector3(pos.getX(i*2+1), pos.getY(i*2+1) + 0.02, pos.getZ(i*2+1)));
	}
	const leftGeo  = new THREE.BufferGeometry().setFromPoints(L);
	const rightGeo = new THREE.BufferGeometry().setFromPoints(R);

	// Straight-road positions for curvature morph (slot 0) CPU lerp.
	const leftBase      = new Float32Array(leftGeo.attributes.position.array);
	const rightBase     = new Float32Array(rightGeo.attributes.position.array);
	const leftStraight  = new Float32Array((N + 1) * 3);
	const rightStraight = new Float32Array((N + 1) * 3);
	for (let i = 0; i <= N; i++) {
		const b = i * 6;
		leftStraight[i*3]   = straightPositions[b];
		leftStraight[i*3+1] = straightPositions[b+1] + 0.02;
		leftStraight[i*3+2] = straightPositions[b+2];
		rightStraight[i*3]   = straightPositions[b+3];
		rightStraight[i*3+1] = straightPositions[b+4] + 0.02;
		rightStraight[i*3+2] = straightPositions[b+5];
	}

	// Old-road edge positions for transition morph (slot 1) CPU lerp.
	let leftMorphFrom = null, rightMorphFrom = null;
	if (transitionFromPos) {
		leftMorphFrom  = new Float32Array((N + 1) * 3);
		rightMorphFrom = new Float32Array((N + 1) * 3);
		for (let i = 0; i <= N; i++) {
			const b = i * 6;
			leftMorphFrom[i*3]   = transitionFromPos[b];
			leftMorphFrom[i*3+1] = transitionFromPos[b+1] + 0.02;
			leftMorphFrom[i*3+2] = transitionFromPos[b+2];
			rightMorphFrom[i*3]   = transitionFromPos[b+3];
			rightMorphFrom[i*3+1] = transitionFromPos[b+4] + 0.02;
			rightMorphFrom[i*3+2] = transitionFromPos[b+5];
		}
	}

	return { leftGeo, rightGeo, leftBase, rightBase, leftStraight, rightStraight, leftMorphFrom, rightMorphFrom };
}

function RoadMeshWithTexture({ cfg, playheadRef, frozenRef, frozenAsPrevRef, clipIndexRef, activePosRef, originPosRef, frozenAnchorRef, crossfadeWorldPosRef, crossfadeHeadingRef, currentHeadingRef, pushed, isActive, splineExportRef, morphFromRef, curvatureScaleRef, liveAnchorRef, pendingUrlRef }) {
	const roadRef  = useRef();
	const leftRef  = useRef();
	const rightRef = useRef();
	const crossfadeMarkerRef = useRef();
	const morphElapsedRef        = useRef(0);
	const morphActiveRef         = useRef(false);
	const morphXfSecsRef         = useRef(0);
	const morphStartAudioTimeRef = useRef(0);

	// Shader-based texture crossfade — zero CPU per frame, pure GPU mix()
	const shaderRef       = useRef(null);  // compiled shader uniforms (set by onBeforeCompile)
	const currentTexRef   = useRef(null);  // mirrors texture state for synchronous useFrame reads
	const prevCfgUrlRef   = useRef(null);  // tracks last loaded URL so useEffect([cfg]) can detect changes
	const xfadeOldTex     = useRef(null);  // old texture being faded out (disposed when done)
	const xfadeElapsed    = useRef(0);
	const xfadeActive     = useRef(false);
	const xfadeAlphaRef   = useRef(1.0);   // persists xfadeAlpha across material recompiles
	const xfadeCutVRef    = useRef(0.0);   // persists xfadeCutV across material recompiles
	const xfadeOffsetRef  = useRef(0.0);   // persists xfadeOffset (old-texture UV shift) across recompiles
	const wasActiveRef    = useRef(false); // tracks prev-frame active state for skip-next detection
	const loadedUrlRef    = useRef(null);  // waveformUrl of the texture currently in `texture` state

	const { geo, spline, hasMorph, morphXfSecs, transitionFromPos } = useMemo(() => {
		const result = buildGeometry(cfg);

		if (splineExportRef) splineExportRef.current = result.spline;

		// Slot 0: curvature morph (always present — straight road absolute positions).
		// influence = (1 - playbackSpeed): 0=normal, 1=straight, -1=double curvature.
		const curvPos = buildCurvatureMorphPositions(cfg);
		result.geo.morphAttributes.position = [new THREE.BufferAttribute(curvPos, 3)];
		result.geo.morphTargetsRelative = false;

		const mf = morphFromRef?.current;
		if (mf?.spline?.length > 1) {
			const halfWidth = (cfg.roadWidth || 2.5) / 2;
			const fromPos = buildMorphPositions(mf.spline, mf.playheadIdx, result.spline, halfWidth);
			// Slot 1: transition morph (old road absolute positions).
			result.geo.morphAttributes.position.push(new THREE.BufferAttribute(fromPos, 3));
			return { ...result, morphXfSecs: mf.xfSecs, hasMorph: true, transitionFromPos: fromPos };
		}
		return { ...result, morphXfSecs: 0, hasMorph: false, transitionFromPos: null };
	}, [cfg]);
	const edgeGeos = useMemo(() => buildEdgeGeos(geo, buildCurvatureMorphPositions(cfg), cfg.segments || 160, transitionFromPos), [geo]); // eslint-disable-line react-hooks/exhaustive-deps
	const markerIdx = useMemo(() => {
		const N = cfg.segments || 160;
		const playerDur = window.MediaBarPlayer?.getDuration();
		const dur = (isFinite(playerDur) && playerDur > 0) ? playerDur : (cfg.duration || 60);
		const xfSecs = window.MediaBarConfig?.globalCrossfade ?? 2.0;
		return Math.max(0, Math.round((1 - xfSecs / dur) * N));
	}, [cfg]);
	const crossfadeLineData = useMemo(() => buildCrossfadeLineGeo(geo, buildCurvatureMorphPositions(cfg), markerIdx), [geo, markerIdx]); // eslint-disable-line react-hooks/exhaustive-deps
	const crossfadeCenterLocal = useMemo(() => {
		const pos = geo.attributes.position;
		const i = markerIdx;
		const straight = buildCurvatureMorphPositions(cfg);
		const b = i * 6;
		return {
			// base (curved)
			bx: (pos.getX(i*2) + pos.getX(i*2+1)) / 2,
			by: (pos.getY(i*2) + pos.getY(i*2+1)) / 2,
			bz: (pos.getZ(i*2) + pos.getZ(i*2+1)) / 2,
			// straight (curvature-morphed)
			sx: (straight[b]   + straight[b+3]) / 2,
			sy: (straight[b+1] + straight[b+4]) / 2,
			sz: (straight[b+2] + straight[b+5]) / 2,
		};
	}, [geo, markerIdx]); // eslint-disable-line react-hooks/exhaustive-deps
	const crossfadeHeadingLocal = useMemo(() => {
		const N = spline.length - 1;
		const nxt = spline[Math.min(markerIdx + 1, N)];
		const prv = spline[Math.max(markerIdx - 1, 0)];
		const fwd = new THREE.Vector3().subVectors(nxt, prv).normalize();
		return { x: fwd.x, y: fwd.y, z: fwd.z };
	}, [spline, markerIdx]);
	const crossfadeCenterMorphFrom = useMemo(() => {
		if (!transitionFromPos) return null;
		const b = markerIdx * 6;
		return {
			x: (transitionFromPos[b]   + transitionFromPos[b+3]) / 2,
			y: (transitionFromPos[b+1] + transitionFromPos[b+4]) / 2,
			z: (transitionFromPos[b+2] + transitionFromPos[b+5]) / 2,
		};
	}, [transitionFromPos, markerIdx]); // eslint-disable-line react-hooks/exhaustive-deps

	const [texture, setTexture] = useState(() => makeProceduralTex());

	// Keep currentTexRef in sync so useFrame can read it without a React closure.
	useEffect(() => { currentTexRef.current = texture; }, [texture]);

	// Begin a GPU crossfade: set mapOld + xfadeCutV uniforms, reset alpha to 0.
	// The fragment shader blends mapOld→map over xfadeAlpha 0→1 only on the
	// "ahead of playhead" strip (vMapUv.y > xfadeCutV).  Zero CPU cost per frame.
	function startSkipXfade(oldTex, uvOffset) {
		window.MediaBarLastSkipTime = null;  // consume the skip signal so natural track changes don't re-trigger
		xfadeOldTex.current    = oldTex;
		xfadeElapsed.current   = 0;
		xfadeActive.current    = true;
		xfadeAlphaRef.current  = 0.0;
		xfadeCutVRef.current   = 0.0;
		xfadeOffsetRef.current = uvOffset || 0.0;  // old-playhead UV offset for spatial alignment
		if (!shaderRef.current) return; // shader not compiled yet; onBeforeCompile will restore from refs
		shaderRef.current.uniforms.mapOld.value      = oldTex;
		shaderRef.current.uniforms.xfadeAlpha.value  = 0.0;
		shaderRef.current.uniforms.xfadeCutV.value   = 0.0;
		shaderRef.current.uniforms.xfadeOffset.value = uvOffset || 0.0;
	}

	useEffect(() => {
		const activeUrl  = cfg.analysisUrl || cfg.waveformUrl;
		const urlChanged = activeUrl !== prevCfgUrlRef.current;
		prevCfgUrlRef.current = activeUrl;

		// Skip-next is now detected in useFrame (first frame active after a skip).
		// Only handle URL changes here (skip-prev or initial/natural load).
		if (!urlChanged) {
			// Preview was for the correct song (URL matches) — pending is already satisfied.
			if (pendingUrlRef) pendingUrlRef.current = null;
			return;
		}

		// URL changed: load the new texture.
		// Snapshot the old texture now — useFrame will overwrite _activeTexture once it runs.
		// Only carry the old texture for a crossfade if this is a skip and this slot is active.
		const skipAge      = window.MediaBarLastSkipTime ? (Date.now() - window.MediaBarLastSkipTime) : null;
		const isSkip       = skipAge !== null && skipAge < 8000 && !frozenRef.current;
		const oldTex       = isSkip ? _activeTexture : null;
		const playheadSnap = isSkip ? playheadRef.current : 0;

		if (cfg.analysisUrl) {
			// DataTexture path — cache owns texture lifetime, do not dispose
			let cancelled = false;
			TrackAnalysisCache.load(cfg.analysisUrl).then(entry => {
				if (cancelled) return;
				const tex = TrackAnalysisCache.buildTexture(entry);
				loadedUrlRef.current = cfg.analysisUrl;
				if (pendingUrlRef) pendingUrlRef.current = null;
				if (oldTex && oldTex !== tex) startSkipXfade(oldTex, playheadSnap);
				setTexture(() => tex);
			}).catch(err => console.warn('[RoadMesh] analysis load failed', err));
			return () => { cancelled = true; };
		}

		// Image texture path (waveformUrl)
		let cancelled = false;
		const loader = new TextureLoader();
		loader.load(cfg.waveformUrl, (tex) => {
			if (cancelled) { tex.dispose(); return; }
			tex.wrapS = THREE.RepeatWrapping;
			tex.wrapT = THREE.RepeatWrapping;
			// Mark texture as current before crossfade so useFrame guards see it immediately.
			loadedUrlRef.current = cfg.waveformUrl;
			if (pendingUrlRef) pendingUrlRef.current = null;
			if (oldTex && oldTex !== tex) startSkipXfade(oldTex, playheadSnap);
			setTexture(prev => { if (prev && prev !== tex && prev !== xfadeOldTex.current) prev.dispose(); return tex; });
		});
		return () => { cancelled = true; };
	}, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		morphElapsedRef.current = 0;
		// Seed the audio-time baseline so the morph progress is locked to the
		// player clock from the first frame of the new active mesh.
		morphStartAudioTimeRef.current = window.MediaBarPlayer?.getCurrentTime?.() ?? 0;
		morphXfSecsRef.current = hasMorph ? morphXfSecs : 0;
		morphActiveRef.current = hasMorph;
		if (roadRef.current) {
			roadRef.current.updateMorphTargets();
			// Transition morph lives in slot 1; initialize it to full influence.
			if (hasMorph && roadRef.current.morphTargetInfluences?.length > 1) {
				roadRef.current.morphTargetInfluences[1] = 1.0;
			} else if (hasMorph) {
				morphActiveRef.current = false;
			}
		}
		if (morphFromRef) morphFromRef.current = null;
	}, [geo]); // eslint-disable-line react-hooks/exhaustive-deps

	useFrame((_, delta) => {
		const frozenNow = frozenRef.current;

		// expectedUrl: the URL this slot is supposed to display.
		// pendingUrlRef (a ref, set synchronously before frozenRef) beats cfg.waveformUrl
		// (React state, deferred by one render) so we see the correct URL on the very
		// first frame after a slot is unfrozen — before React has re-rendered with the
		// new cfg.  This prevents a stale preview texture from being mistaken for the
		// correct new texture during skip crossfade detection.
		const expectedUrl = (pendingUrlRef?.current) ?? (cfg.analysisUrl || cfg.waveformUrl);

		// Detect the first frame this slot becomes active after a recent skip (skip-next).
		// Must run BEFORE _activeTexture/_activePlayhead are overwritten so we capture
		// the old slot's texture and playhead for the UV offset.
		// Guard: only fire when loadedUrlRef matches expectedUrl — otherwise this slot
		// has a stale preview texture and _activeTexture must not be clobbered yet.
		if (!frozenNow && !wasActiveRef.current) {
			const skipAge = window.MediaBarLastSkipTime
				? (Date.now() - window.MediaBarLastSkipTime) : null;
			if (skipAge !== null && skipAge < 8000
					&& _activeTexture && currentTexRef.current
					&& _activeTexture !== currentTexRef.current
					&& loadedUrlRef.current === expectedUrl) {
				startSkipXfade(_activeTexture, _activePlayhead);
			}
		}
		wasActiveRef.current = !frozenNow;

		// Update shared active-texture and active-playhead every frame while active.
		// Guard: only update when the loaded texture matches the expected URL so a stale
		// preview texture never overwrites _activeTexture (which the useEffect closure
		// captures as oldTex for the correct skip crossfade source).
		if (!frozenNow && currentTexRef.current
				&& loadedUrlRef.current === expectedUrl) {
			_activeTexture  = currentTexRef.current;
			_activePlayhead = playheadRef.current;
		}

		// Advance the GPU blend uniform — single float write, zero canvas work.
		if (xfadeActive.current && shaderRef.current) {
			const xfSecs = window.MediaBarConfig?.globalCrossfade ?? 2.0;
			xfadeElapsed.current += delta;
			const alpha = Math.min(xfadeElapsed.current / xfSecs, 1.0);
			xfadeAlphaRef.current = alpha;
			shaderRef.current.uniforms.xfadeAlpha.value = alpha;
			if (alpha >= 1.0) {
				xfadeActive.current    = false;
				const old = xfadeOldTex.current;
				xfadeOldTex.current    = null;
				xfadeAlphaRef.current  = 1.0;
				xfadeOffsetRef.current = 0.0;
				if (old && old !== currentTexRef.current) old.dispose();
			}
		}

		// Transition morph — slot 1, fades old road → new road.
		// Progress is driven by the audio clock so it stays locked to playback
		// speed and freezes correctly when the player is paused.
		// Falls back to delta accumulation if MediaBarPlayer is unavailable.
		if (morphActiveRef.current && roadRef.current?.morphTargetInfluences?.length > 1) {
			const audioNow = window.MediaBarPlayer?.getCurrentTime?.() ?? -1;
			let elapsed;
			if (audioNow >= 0) {
				elapsed = audioNow - morphStartAudioTimeRef.current;
			} else {
				morphElapsedRef.current += delta;
				elapsed = morphElapsedRef.current;
			}
			const mt = morphXfSecsRef.current > 0
				? Math.min(elapsed / morphXfSecsRef.current, 1.0)
				: 1.0;
			roadRef.current.morphTargetInfluences[1] = 1.0 - mt;
			if (mt >= 1.0) {
				morphActiveRef.current = false;
				roadRef.current.morphTargetInfluences[1] = 0;
			}
		}

		// Curvature morph — slot 0, driven by playback speed every frame.
		// influence = (1 - speed): 0=normal, 1=straight, -1=double.
		let curvInfl = 0;
		if (roadRef.current?.morphTargetInfluences?.length > 0) {
			const speed = curvatureScaleRef?.current ?? 1.0;
			curvInfl = Math.max(-1, Math.min(1, 1.0 - speed));
			roadRef.current.morphTargetInfluences[0] = curvInfl;
		}

		// if (crossfadeMarkerRef.current) {
		// 	crossfadeMarkerRef.current.visible = !frozenRef.current;
		// 	// CPU lerp crossfade marker to follow curvature morph.
		// 	if (curvInfl !== 0) {
		// 		const mp = crossfadeLineData.geo.attributes.position;
		// 		const { baseL, baseR, straightL, straightR } = crossfadeLineData;
		// 		mp.array[0] = baseL[0] + (straightL[0] - baseL[0]) * curvInfl;
		// 		mp.array[1] = baseL[1] + (straightL[1] - baseL[1]) * curvInfl;
		// 		mp.array[2] = baseL[2] + (straightL[2] - baseL[2]) * curvInfl;
		// 		mp.array[3] = baseR[0] + (straightR[0] - baseR[0]) * curvInfl;
		// 		mp.array[4] = baseR[1] + (straightR[1] - baseR[1]) * curvInfl;
		// 		mp.array[5] = baseR[2] + (straightR[2] - baseR[2]) * curvInfl;
		// 		mp.needsUpdate = true;
		// 	}
		// }

		// CPU lerp edge lines for both morphs (LineBasicMaterial has no GPU morph support).
		// Always runs so positions reset correctly when influences return to 0.
		// Slot 0 (curvature): lerp base → straight by curvInfl.
		// Slot 1 (transition): lerp curvature-result → morphFrom by morphTargetInfluences[1].
		{
			const transInfl = (morphActiveRef.current && edgeGeos.leftMorphFrom)
				? (roadRef.current?.morphTargetInfluences?.[1] ?? 0)
				: 0;
			const lp = edgeGeos.leftGeo.attributes.position;
			const rp = edgeGeos.rightGeo.attributes.position;
			const lb = edgeGeos.leftBase,      ls = edgeGeos.leftStraight;
			const rb = edgeGeos.rightBase,     rs = edgeGeos.rightStraight;
			const lf = edgeGeos.leftMorphFrom, rf = edgeGeos.rightMorphFrom;
			const n = lp.count;
			for (let i = 0; i < n; i++) {
				const b = i * 3;
				// Step 1: curvature lerp (base → straight)
				let lx = lb[b]   + (ls[b]   - lb[b])   * curvInfl;
				let ly = lb[b+1] + (ls[b+1] - lb[b+1]) * curvInfl;
				let lz = lb[b+2] + (ls[b+2] - lb[b+2]) * curvInfl;
				let rx = rb[b]   + (rs[b]   - rb[b])   * curvInfl;
				let ry = rb[b+1] + (rs[b+1] - rb[b+1]) * curvInfl;
				let rz = rb[b+2] + (rs[b+2] - rb[b+2]) * curvInfl;
				// Step 2: transition lerp (curvature result → old road)
				if (transInfl !== 0 && lf && rf) {
					lx += (lf[b]   - lx) * transInfl;
					ly += (lf[b+1] - ly) * transInfl;
					lz += (lf[b+2] - lz) * transInfl;
					rx += (rf[b]   - rx) * transInfl;
					ry += (rf[b+1] - ry) * transInfl;
					rz += (rf[b+2] - rz) * transInfl;
				}
				lp.array[b] = lx; lp.array[b+1] = ly; lp.array[b+2] = lz;
				rp.array[b] = rx; rp.array[b+1] = ry; rp.array[b+2] = rz;
			}
			lp.needsUpdate = true;
			rp.needsUpdate = true;
		}

		// Clip previous-slot geometry — before any early return so it always fires.
		if (frozenAsPrevRef?.current) {
			const idx = clipIndexRef?.current ?? 0;
			const count = idx * 6;
			if (geo.drawRange.count !== count) {
				geo.setDrawRange(0, count);
				edgeGeos.leftGeo.setDrawRange(0,  idx + 1);
				edgeGeos.rightGeo.setDrawRange(0, idx + 1);
			}
		} else if (geo.drawRange.count !== Infinity) {
			geo.setDrawRange(0, Infinity);
			edgeGeos.leftGeo.setDrawRange(0,  Infinity);
			edgeGeos.rightGeo.setDrawRange(0, Infinity);
		}

		// lateralScale keeps every slot's playhead spine at world origin under morphing.
		// activePosRef stores BASE (un-scaled) positions so frozen-slot tracking is
		// consistent; the scale is applied identically to both frozen and active slots.
		const lateralScale = 1.0 - curvInfl;

		let x, y, z;
		if (frozenRef.current) {
			if (liveAnchorRef?.current) {
				// Next slot: track morph-aware crossfadeWorldPosRef directly.
				const live = liveAnchorRef.current;
				x = live.x;
				y = live.y;
				z = live.z;
			} else {
				const anchor = frozenAnchorRef.current;
				const origin = originPosRef.current;
				const active = activePosRef.current;
				if (!anchor || !origin) return;
				const baseX = anchor.x + (active.x - origin.x);
				const baseY = anchor.y + (active.y - origin.y);
				z = anchor.z + (active.z - origin.z);
				x = baseX * lateralScale;
				y = baseY * lateralScale;
			}
		} else {
			const t = Math.max(0, Math.min(1, playheadRef.current));
			const N = spline.length - 1;
			const i0 = Math.min(Math.floor(t * N), N);
			const i1 = Math.min(i0 + 1, N);
			const frac = t * N - i0;
			const p0 = spline[i0], p1 = spline[i1];
			const baseX = -(p0.x + (p1.x - p0.x) * frac);
			const baseY = -(p0.y + (p1.y - p0.y) * frac);
			z = -(p0.z + (p1.z - p0.z) * frac);
			x = baseX * lateralScale;
			y = baseY * lateralScale;
			// Store base positions so frozen slots track unscaled movement.
			activePosRef.current = { x: baseX, y: baseY, z };
			if (!originPosRef.current) originPosRef.current = { x: baseX, y: baseY, z };
			if (crossfadeWorldPosRef) {
				// Include transition morph (slot 1) so the next slot tracks the morphing end.
				const mcx = crossfadeCenterLocal.bx + (crossfadeCenterLocal.sx - crossfadeCenterLocal.bx) * curvInfl;
				const mcy = crossfadeCenterLocal.by + (crossfadeCenterLocal.sy - crossfadeCenterLocal.by) * curvInfl;
				let cfx = mcx * lateralScale + x;
				let cfy = mcy * lateralScale + y;
				let cfz = crossfadeCenterLocal.bz + z;
				if (morphActiveRef.current && crossfadeCenterMorphFrom) {
					const transInfl = roadRef.current?.morphTargetInfluences?.[1] ?? 0;
					if (transInfl > 0) {
						cfx += (crossfadeCenterMorphFrom.x * lateralScale + x - cfx) * transInfl;
						cfy += (crossfadeCenterMorphFrom.y * lateralScale + y - cfy) * transInfl;
						cfz += (crossfadeCenterMorphFrom.z + z - cfz) * transInfl;
					}
				}
				crossfadeWorldPosRef.current = { x: cfx, y: cfy, z: cfz };
			}
			if (crossfadeHeadingRef) {
				crossfadeHeadingRef.current = { ...crossfadeHeadingLocal };
			}
			if (currentHeadingRef) {
				const nxt = spline[Math.min(i0 + 1, N)];
				const prv = spline[Math.max(i0 - 1, 0)];
				const fwd = new THREE.Vector3().subVectors(nxt, prv).normalize();
				currentHeadingRef.current = { x: fwd.x, y: fwd.y, z: fwd.z };
			}
		}
		if (roadRef.current)  roadRef.current.position.set(x, y, z);
		if (leftRef.current)  leftRef.current.position.set(x, y, z);
		if (rightRef.current) rightRef.current.position.set(x, y, z);
		// if (crossfadeMarkerRef.current) crossfadeMarkerRef.current.position.set(x, y, z);
	});

	return (
		<>
			<mesh ref={roadRef} geometry={geo}>
				<meshBasicMaterial
					map={texture}
					side={THREE.DoubleSide}
					morphTargets={true}
					transparent={!!(cfg.analysisUrl && (window.MediaBarConfig?.analysisTransparent))}
					polygonOffset={pushed !== 0}
					polygonOffsetFactor={pushed}
					polygonOffsetUnits={pushed}
					onBeforeCompile={shader => {
						shader.uniforms.mapOld      = { value: xfadeOldTex.current || texture };
						shader.uniforms.xfadeAlpha  = { value: xfadeAlphaRef.current };
						shader.uniforms.xfadeCutV   = { value: xfadeCutVRef.current };
						shader.uniforms.xfadeOffset = { value: xfadeOffsetRef.current };
						shader.fragmentShader =
							'uniform sampler2D mapOld;\nuniform float xfadeAlpha;\nuniform float xfadeCutV;\nuniform float xfadeOffset;\n'
							+ shader.fragmentShader;
						shader.fragmentShader = shader.fragmentShader.replace(
							'#include <map_fragment>',
							[
								'#ifdef USE_MAP',
								'  vec4 sampledNew = texture2D( map, vMapUv );',
								'  vec4 sampledOld = texture2D( mapOld, vec2( vMapUv.x, vMapUv.y + xfadeOffset ) );',
								'  float isBehind  = 1.0 - step( xfadeCutV, vMapUv.y );',
								'  float blend     = isBehind + (1.0 - isBehind) * xfadeAlpha;',
								'  diffuseColor   *= mix( sampledOld, sampledNew, blend );',
								'#endif',
							].join('\n')
						);
						shaderRef.current = shader;
					}}
					customProgramCacheKey={() => 'road-xfade-v2'}
				/>
			</mesh>
			<line ref={leftRef} geometry={edgeGeos.leftGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			<line ref={rightRef} geometry={edgeGeos.rightGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			{/* <line ref={crossfadeMarkerRef} geometry={crossfadeLineData.geo} renderOrder={1}>
				<lineBasicMaterial color={0xffff00} depthTest={false} />
			</line> */}
		</>
	);
}

// ---------------------------------------------------------------------------

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

function RoadMeshProcedural({ cfg, playheadRef, frozenRef, frozenAsPrevRef, clipIndexRef, activePosRef, originPosRef, frozenAnchorRef, crossfadeWorldPosRef, crossfadeHeadingRef, currentHeadingRef, pushed, isActive, splineExportRef, morphFromRef, curvatureScaleRef, liveAnchorRef, pendingUrlRef }) {
	const roadRef  = useRef();
	const leftRef  = useRef();
	const rightRef = useRef();
	const crossfadeMarkerRef = useRef();
	const morphElapsedRef = useRef(0);
	const morphActiveRef  = useRef(false);
	const morphXfSecsRef  = useRef(0);
	const texture  = useMemo(() => makeProceduralTex(), []);

	const { geo, spline, hasMorph, morphXfSecs, transitionFromPos } = useMemo(() => {
		const result = buildGeometry(cfg);

		if (splineExportRef) splineExportRef.current = result.spline;

		// Slot 0: curvature morph (always present — straight road absolute positions).
		const curvPos = buildCurvatureMorphPositions(cfg);
		result.geo.morphAttributes.position = [new THREE.BufferAttribute(curvPos, 3)];
		result.geo.morphTargetsRelative = false;

		const mf = morphFromRef?.current;
		if (mf?.spline?.length > 1) {
			const halfWidth = (cfg.roadWidth || 2.5) / 2;
			const fromPos = buildMorphPositions(mf.spline, mf.playheadIdx, result.spline, halfWidth);
			// Slot 1: transition morph (old road absolute positions).
			result.geo.morphAttributes.position.push(new THREE.BufferAttribute(fromPos, 3));
			return { ...result, morphXfSecs: mf.xfSecs, hasMorph: true, transitionFromPos: fromPos };
		}
		return { ...result, morphXfSecs: 0, hasMorph: false, transitionFromPos: null };
	}, [cfg]);
	const edgeGeos = useMemo(() => buildEdgeGeos(geo, buildCurvatureMorphPositions(cfg), cfg.segments || 160, transitionFromPos), [geo]); // eslint-disable-line react-hooks/exhaustive-deps
	const markerIdx = useMemo(() => {
		const N = cfg.segments || 160;
		const playerDur = window.MediaBarPlayer?.getDuration();
		const dur = (isFinite(playerDur) && playerDur > 0) ? playerDur : (cfg.duration || 60);
		const xfSecs = window.MediaBarConfig?.globalCrossfade ?? 2.0;
		return Math.max(0, Math.round((1 - xfSecs / dur) * N));
	}, [cfg]);
	const crossfadeLineData = useMemo(() => buildCrossfadeLineGeo(geo, buildCurvatureMorphPositions(cfg), markerIdx), [geo, markerIdx]); // eslint-disable-line react-hooks/exhaustive-deps
	const crossfadeCenterLocal = useMemo(() => {
		const pos = geo.attributes.position;
		const i = markerIdx;
		const straight = buildCurvatureMorphPositions(cfg);
		const b = i * 6;
		return {
			// base (curved)
			bx: (pos.getX(i*2) + pos.getX(i*2+1)) / 2,
			by: (pos.getY(i*2) + pos.getY(i*2+1)) / 2,
			bz: (pos.getZ(i*2) + pos.getZ(i*2+1)) / 2,
			// straight (curvature-morphed)
			sx: (straight[b]   + straight[b+3]) / 2,
			sy: (straight[b+1] + straight[b+4]) / 2,
			sz: (straight[b+2] + straight[b+5]) / 2,
		};
	}, [geo, markerIdx]); // eslint-disable-line react-hooks/exhaustive-deps
	const crossfadeHeadingLocal = useMemo(() => {
		const N = spline.length - 1;
		const nxt = spline[Math.min(markerIdx + 1, N)];
		const prv = spline[Math.max(markerIdx - 1, 0)];
		const fwd = new THREE.Vector3().subVectors(nxt, prv).normalize();
		return { x: fwd.x, y: fwd.y, z: fwd.z };
	}, [spline, markerIdx]);
	const crossfadeCenterMorphFrom = useMemo(() => {
		if (!transitionFromPos) return null;
		const b = markerIdx * 6;
		return {
			x: (transitionFromPos[b]   + transitionFromPos[b+3]) / 2,
			y: (transitionFromPos[b+1] + transitionFromPos[b+4]) / 2,
			z: (transitionFromPos[b+2] + transitionFromPos[b+5]) / 2,
		};
	}, [transitionFromPos, markerIdx]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		morphElapsedRef.current = 0;
		morphXfSecsRef.current = hasMorph ? morphXfSecs : 0;
		morphActiveRef.current = hasMorph;
		if (roadRef.current) {
			roadRef.current.updateMorphTargets();
			if (hasMorph && roadRef.current.morphTargetInfluences?.length > 1) {
				roadRef.current.morphTargetInfluences[1] = 1.0;
			} else if (hasMorph) {
				morphActiveRef.current = false;
			}
		}
		if (morphFromRef) morphFromRef.current = null;
	}, [geo]); // eslint-disable-line react-hooks/exhaustive-deps

	useFrame((_, delta) => {
		// Transition morph — slot 1, fades old road → new road.
		if (morphActiveRef.current && roadRef.current?.morphTargetInfluences?.length > 1) {
			morphElapsedRef.current += delta;
			const mt = Math.min(morphElapsedRef.current / morphXfSecsRef.current, 1.0);
			roadRef.current.morphTargetInfluences[1] = 1.0 - mt;
			if (mt >= 1.0) {
				morphActiveRef.current = false;
				roadRef.current.morphTargetInfluences[1] = 0;
			}
		}

		// Curvature morph — slot 0, driven by playback speed every frame.
		let curvInfl = 0;
		if (roadRef.current?.morphTargetInfluences?.length > 0) {
			const speed = curvatureScaleRef?.current ?? 1.0;
			curvInfl = Math.max(-1, Math.min(1, 1.0 - speed));
			roadRef.current.morphTargetInfluences[0] = curvInfl;
		}

		// if (crossfadeMarkerRef.current) {
		// 	crossfadeMarkerRef.current.visible = !frozenRef.current;
		// 	// CPU lerp crossfade marker to follow curvature morph.
		// 	if (curvInfl !== 0) {
		// 		const mp = crossfadeLineData.geo.attributes.position;
		// 		const { baseL, baseR, straightL, straightR } = crossfadeLineData;
		// 		mp.array[0] = baseL[0] + (straightL[0] - baseL[0]) * curvInfl;
		// 		mp.array[1] = baseL[1] + (straightL[1] - baseL[1]) * curvInfl;
		// 		mp.array[2] = baseL[2] + (straightL[2] - baseL[2]) * curvInfl;
		// 		mp.array[3] = baseR[0] + (straightR[0] - baseR[0]) * curvInfl;
		// 		mp.array[4] = baseR[1] + (straightR[1] - baseR[1]) * curvInfl;
		// 		mp.array[5] = baseR[2] + (straightR[2] - baseR[2]) * curvInfl;
		// 		mp.needsUpdate = true;
		// 	}
		// }

		// CPU lerp edge lines for both morphs (LineBasicMaterial has no GPU morph support).
		// Always runs so positions reset correctly when influences return to 0.
		// Slot 0 (curvature): lerp base → straight by curvInfl.
		// Slot 1 (transition): lerp curvature-result → morphFrom by morphTargetInfluences[1].
		{
			const transInfl = (morphActiveRef.current && edgeGeos.leftMorphFrom)
				? (roadRef.current?.morphTargetInfluences?.[1] ?? 0)
				: 0;
			const lp = edgeGeos.leftGeo.attributes.position;
			const rp = edgeGeos.rightGeo.attributes.position;
			const lb = edgeGeos.leftBase,      ls = edgeGeos.leftStraight;
			const rb = edgeGeos.rightBase,     rs = edgeGeos.rightStraight;
			const lf = edgeGeos.leftMorphFrom, rf = edgeGeos.rightMorphFrom;
			const n = lp.count;
			for (let i = 0; i < n; i++) {
				const b = i * 3;
				// Step 1: curvature lerp (base → straight)
				let lx = lb[b]   + (ls[b]   - lb[b])   * curvInfl;
				let ly = lb[b+1] + (ls[b+1] - lb[b+1]) * curvInfl;
				let lz = lb[b+2] + (ls[b+2] - lb[b+2]) * curvInfl;
				let rx = rb[b]   + (rs[b]   - rb[b])   * curvInfl;
				let ry = rb[b+1] + (rs[b+1] - rb[b+1]) * curvInfl;
				let rz = rb[b+2] + (rs[b+2] - rb[b+2]) * curvInfl;
				// Step 2: transition lerp (curvature result → old road)
				if (transInfl !== 0 && lf && rf) {
					lx += (lf[b]   - lx) * transInfl;
					ly += (lf[b+1] - ly) * transInfl;
					lz += (lf[b+2] - lz) * transInfl;
					rx += (rf[b]   - rx) * transInfl;
					ry += (rf[b+1] - ry) * transInfl;
					rz += (rf[b+2] - rz) * transInfl;
				}
				lp.array[b] = lx; lp.array[b+1] = ly; lp.array[b+2] = lz;
				rp.array[b] = rx; rp.array[b+1] = ry; rp.array[b+2] = rz;
			}
			lp.needsUpdate = true;
			rp.needsUpdate = true;
		}

		// Clip previous-slot geometry — before any early return so it always fires.
		if (frozenAsPrevRef?.current) {
			const idx = clipIndexRef?.current ?? 0;
			const count = idx * 6;
			if (geo.drawRange.count !== count) {
				geo.setDrawRange(0, count);
				edgeGeos.leftGeo.setDrawRange(0,  idx + 1);
				edgeGeos.rightGeo.setDrawRange(0, idx + 1);
			}
		} else if (geo.drawRange.count !== Infinity) {
			geo.setDrawRange(0, Infinity);
			edgeGeos.leftGeo.setDrawRange(0,  Infinity);
			edgeGeos.rightGeo.setDrawRange(0, Infinity);
		}

		const lateralScale = 1.0 - curvInfl;

		let x, y, z;
		if (frozenRef.current) {
			if (liveAnchorRef?.current) {
				// Next slot: track morph-aware crossfadeWorldPosRef directly.
				const live = liveAnchorRef.current;
				x = live.x;
				y = live.y;
				z = live.z;
			} else {
				const anchor = frozenAnchorRef.current;
				const origin = originPosRef.current;
				const active = activePosRef.current;
				if (!anchor || !origin) return;
				const baseX = anchor.x + (active.x - origin.x);
				const baseY = anchor.y + (active.y - origin.y);
				z = anchor.z + (active.z - origin.z);
				x = baseX * lateralScale;
				y = baseY * lateralScale;
			}
		} else {
			const t = Math.max(0, Math.min(1, playheadRef.current));
			const N = spline.length - 1;
			const i0 = Math.min(Math.floor(t * N), N);
			const i1 = Math.min(i0 + 1, N);
			const frac = t * N - i0;
			const p0 = spline[i0], p1 = spline[i1];
			const baseX = -(p0.x + (p1.x - p0.x) * frac);
			const baseY = -(p0.y + (p1.y - p0.y) * frac);
			z = -(p0.z + (p1.z - p0.z) * frac);
			x = baseX * lateralScale;
			y = baseY * lateralScale;
			activePosRef.current = { x: baseX, y: baseY, z };
			if (!originPosRef.current) originPosRef.current = { x: baseX, y: baseY, z };
			if (crossfadeWorldPosRef) {
				// Include transition morph (slot 1) so the next slot tracks the morphing end.
				const mcx = crossfadeCenterLocal.bx + (crossfadeCenterLocal.sx - crossfadeCenterLocal.bx) * curvInfl;
				const mcy = crossfadeCenterLocal.by + (crossfadeCenterLocal.sy - crossfadeCenterLocal.by) * curvInfl;
				let cfx = mcx * lateralScale + x;
				let cfy = mcy * lateralScale + y;
				let cfz = crossfadeCenterLocal.bz + z;
				if (morphActiveRef.current && crossfadeCenterMorphFrom) {
					const transInfl = roadRef.current?.morphTargetInfluences?.[1] ?? 0;
					if (transInfl > 0) {
						cfx += (crossfadeCenterMorphFrom.x * lateralScale + x - cfx) * transInfl;
						cfy += (crossfadeCenterMorphFrom.y * lateralScale + y - cfy) * transInfl;
						cfz += (crossfadeCenterMorphFrom.z + z - cfz) * transInfl;
					}
				}
				crossfadeWorldPosRef.current = { x: cfx, y: cfy, z: cfz };
			}
			if (crossfadeHeadingRef) {
				crossfadeHeadingRef.current = { ...crossfadeHeadingLocal };
			}
			if (currentHeadingRef) {
				const nxt = spline[Math.min(i0 + 1, N)];
				const prv = spline[Math.max(i0 - 1, 0)];
				const fwd = new THREE.Vector3().subVectors(nxt, prv).normalize();
				currentHeadingRef.current = { x: fwd.x, y: fwd.y, z: fwd.z };
			}
		}
		if (roadRef.current)  roadRef.current.position.set(x, y, z);
		if (leftRef.current)  leftRef.current.position.set(x, y, z);
		if (rightRef.current) rightRef.current.position.set(x, y, z);
		// if (crossfadeMarkerRef.current) crossfadeMarkerRef.current.position.set(x, y, z);
	});

	return (
		<>
			<mesh ref={roadRef} geometry={geo}>
				<meshBasicMaterial map={texture} side={THREE.DoubleSide} morphTargets={true} polygonOffset={pushed !== 0} polygonOffsetFactor={pushed} polygonOffsetUnits={pushed} />
			</mesh>
			<line ref={leftRef} geometry={edgeGeos.leftGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			<line ref={rightRef} geometry={edgeGeos.rightGeo}>
				<lineBasicMaterial color={0xffffff} transparent opacity={0.3} />
			</line>
			{/* <line ref={crossfadeMarkerRef} geometry={crossfadeLineData.geo} renderOrder={1}>
				<lineBasicMaterial color={0xffff00} depthTest={false} />
			</line> */}
		</>
	);
}

export function RoadMesh({ cfg, playheadRef, frozenRef, frozenAsPrevRef, clipIndexRef, activePosRef, originPosRef, frozenAnchorRef, crossfadeWorldPosRef, crossfadeHeadingRef, currentHeadingRef, pushed, isActive, splineExportRef, morphFromRef, curvatureScaleRef, liveAnchorRef, pendingUrlRef }) {
	if (cfg.analysisUrl || cfg.waveformUrl) {
		return <RoadMeshWithTexture cfg={cfg} playheadRef={playheadRef} frozenRef={frozenRef} frozenAsPrevRef={frozenAsPrevRef} clipIndexRef={clipIndexRef} activePosRef={activePosRef} originPosRef={originPosRef} frozenAnchorRef={frozenAnchorRef} crossfadeWorldPosRef={crossfadeWorldPosRef} crossfadeHeadingRef={crossfadeHeadingRef} currentHeadingRef={currentHeadingRef} pushed={pushed} isActive={isActive} splineExportRef={splineExportRef} morphFromRef={morphFromRef} curvatureScaleRef={curvatureScaleRef} liveAnchorRef={liveAnchorRef} pendingUrlRef={pendingUrlRef} />;
	}
	return <RoadMeshProcedural cfg={cfg} playheadRef={playheadRef} frozenRef={frozenRef} frozenAsPrevRef={frozenAsPrevRef} clipIndexRef={clipIndexRef} activePosRef={activePosRef} originPosRef={originPosRef} frozenAnchorRef={frozenAnchorRef} crossfadeWorldPosRef={crossfadeWorldPosRef} crossfadeHeadingRef={crossfadeHeadingRef} currentHeadingRef={currentHeadingRef} pushed={pushed} isActive={isActive} splineExportRef={splineExportRef} morphFromRef={morphFromRef} curvatureScaleRef={curvatureScaleRef} liveAnchorRef={liveAnchorRef} pendingUrlRef={pendingUrlRef} />;
}
