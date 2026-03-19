// This file is no longer used. RoadMesh has moved to:
// blocks/environment/components/core/front/RoadMesh.js
import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ── Catmull-Rom ────────────────────────────────────────────────────────────────
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
        const u   = i / N;
        const raw = u * segs;
        const si  = Math.min(Math.floor(raw), segs - 1);
        const lt  = raw - si;
        const p0 = worldPts[Math.max(si - 1, 0)];
        const p1 = worldPts[si];
        const p2 = worldPts[Math.min(si + 1, worldPts.length - 1)];
        const p3 = worldPts[Math.min(si + 2, worldPts.length - 1)];
        result.push(catmullRom(p0, p1, p2, p3, lt));
    }
    return result;
}

// ── Read config from DOM element ───────────────────────────────────────────────
function readCfg(domEl) {
    const g = (cls) => {
        const el = domEl.querySelector('.' + cls);
        return el ? el.textContent.trim() : '';
    };
    return {
        roadWidth:     parseFloat(g('road-block-width'))     || 2.5,
        segments:      parseInt(g('road-block-segments'))    || 160,
        unitsPerSec:   parseFloat(g('road-block-ups'))       || 8,
        duration:      parseFloat(g('road-block-duration'))  || 60,
        camHeight:     parseFloat(g('road-block-cam-height')) || 0.8,
        lookAhead:     parseInt(g('road-block-look-ahead'))  || 8,
        fov:           parseInt(g('road-block-fov'))          || 70,
        waveformUrl:   g('road-block-waveform-url'),
        controlPoints: JSON.parse(
            domEl.querySelector('.road-block-control-points')?.dataset?.points || '[]'
        ),
    };
}

// ── Procedural waveform texture fallback ──────────────────────────────────────
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
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,2); ctx.lineTo(W,2); ctx.moveTo(0,H-2); ctx.lineTo(W,H-2); ctx.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

// ── Build ribbon geometry ──────────────────────────────────────────────────────
function buildGeometry(cfg) {
    const N         = cfg.segments;
    const halfWidth = cfg.roadWidth / 2;
    const totalLen  = cfg.duration * cfg.unitsPerSec;

    const sorted   = [...cfg.controlPoints].sort((a, b) => a.t - b.t);
    const worldPts = sorted.map(p => new THREE.Vector3(p.x, p.y || 0, -p.t * totalLen));
    const spline   = sampleSpline(worldPts, N);

    // distance-based UVs
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
            indices.push(a,c,a+1, a+1,c,c+1);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    geo.setIndex(indices);

    return { geo, spline, totalDist };
}

// ── RoadMesh component ─────────────────────────────────────────────────────────
export function RoadMesh({ domEl, playhead }) {
    const roadRef     = useRef();
    const leftRef     = useRef();
    const rightRef    = useRef();
    const texRef      = useRef();


    const cfg = useMemo(() => readCfg(domEl), [domEl]);

    const { geo, spline } = useMemo(() => buildGeometry(cfg), [cfg]);

    // Edge line geometries
    const { leftGeo, rightGeo } = useMemo(() => {
        const pos = geo.attributes.position;
        const N   = cfg.segments;
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

    // Texture
    const tex = useMemo(() => {
        if (cfg.waveformUrl) {
            const t = new THREE.TextureLoader().load(cfg.waveformUrl);
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.ClampToEdgeWrapping;
            return t;
        }
        return makeProceduralTex();
    }, [cfg.waveformUrl]);

    texRef.current = tex;

    useFrame(() => {
        const N      = spline.length - 1;
        const t      = Math.max(0, Math.min(1, playhead));
        const curIdx = Math.min(Math.floor(t * N), N);

        const p = spline[curIdx];

        // Offset road so current point is at world Z=0
        const offsetZ = -p.z;
        if (roadRef.current)  roadRef.current.position.z  = offsetZ;
        if (leftRef.current)  leftRef.current.position.z  = offsetZ;
        if (rightRef.current) rightRef.current.position.z = offsetZ;

        // Scroll waveform
        if (texRef.current?.offset) texRef.current.offset.y = t;
    });

    return (
        <>
            <mesh ref={roadRef} geometry={geo}>
                <meshBasicMaterial map={tex} side={THREE.DoubleSide} />
            </mesh>
            <line ref={leftRef} geometry={leftGeo}>
                <lineBasicMaterial color={0xffffff} transparent opacity={0.2} />
            </line>
            <line ref={rightRef} geometry={rightGeo}>
                <lineBasicMaterial color={0xffffff} transparent opacity={0.2} />
            </line>
        </>
    );
}
