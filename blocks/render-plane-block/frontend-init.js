/**
 * Object Display Block — Frontend Runtime
 * Uses THREE (r128 global) + our bundled RPBGLBLoader for GLB parsing.
 * No CDN required.
 */
(function () {
    'use strict'; // rpb v2

    // ── Wait for THREE + RPBGLBLoader globals ────────────────────────────────
    function waitReady(cb) {
        if (typeof THREE !== 'undefined' && typeof RPBGLBLoader !== 'undefined') {
            cb(); return;
        }
        setTimeout(function () { waitReady(cb); }, 100);
    }

    // Debounced init — collapses rapid-fire afs:dom-updated events into one call
    var initTimer = null;
    function initBlocks() {
        clearTimeout(initTimer);
        initTimer = setTimeout(function () {
            waitReady(function () {
                document.querySelectorAll('.rpb-three-app').forEach(function (container) {
                    // Guard: skip if already booting or booted
                    if (container.getAttribute('data-rpb-booting')) return;
                    // Guard: skip if no data markup present
                    if (!container.querySelector('p.rpb-url')) return;
                    bootBlock(container);
                });
            });
        }, 150);
    }

    // Remove any prior listener registered by an older instance of this script,
    // then register fresh — prevents duplicate listeners after AJAX head re-sync
    if (window.__rpbDomHandler__) {
        document.removeEventListener('afs:dom-updated', window.__rpbDomHandler__);
    }
    window.__rpbDomHandler__ = function () { initBlocks(); };

    // Initial page load — this script runs in the footer, so DOMContentLoaded
    // has usually already fired by the time we get here. Run immediately if
    // the DOM is already parsed; only wait for the event if we're somehow
    // still early. (Same guard as blocks/environment/components/Networking.js)
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initBlocks();
    } else {
        document.addEventListener('DOMContentLoaded', function () { initBlocks(); });
    }

    // Re-init after MediaBar AJAX navigation
    document.addEventListener('afs:dom-updated', window.__rpbDomHandler__);

    // Expose for manual triggering if needed
    window.rpbInitBlocks = initBlocks;

    // ── Read saved block data from hidden <p> tags ───────────────────────────
    function txt(container, cls) {
        var el = container.querySelector('p.' + cls);
        return el ? (el.textContent || '').trim() : '';
    }

    function bootBlock(container) {
        var threeUrl  = txt(container, 'rpb-url');
        var bgColor   = txt(container, 'rpb-bg-color')    || 'transparent';
        var zoom      = parseFloat(txt(container, 'rpb-zoom'))         || 1;
        var scale     = parseFloat(txt(container, 'rpb-scale'))        || 1;
        var hasZoom   = txt(container, 'rpb-has-zoom')   === '1';
        var hasTip    = txt(container, 'rpb-has-tip')    === '1';
        var positionY = parseFloat(txt(container, 'rpb-position-y'))   || 0;
        var rotationY = parseFloat(txt(container, 'rpb-rotation-y'))   || 0;
        var animations = txt(container, 'rpb-animations');
        var targetMesh = txt(container, 'rpb-target-mesh');
        var imageDur     = parseInt(txt(container, 'rpb-image-duration'))  || 5;
        var fadeDur      = parseFloat(txt(container, 'rpb-fade-duration'))  || 1.0;
        var canvasHeight = parseInt(txt(container, 'rpb-canvas-height'))    || 500;
        var anchorX          = parseFloat(txt(container, 'rpb-anchor-x'))          || 0;
        var anchorY          = parseFloat(txt(container, 'rpb-anchor-y'))          || 0;
        var hasScanlines     = txt(container, 'rpb-has-scanlines')               === '1';
        var scanlinesOpacity = parseFloat(txt(container, 'rpb-scanlines-opacity')) || 0.15;
        var scanlinesSize    = parseInt(txt(container, 'rpb-scanlines-size'))       || 3;
        var scanlinesDrift      = parseFloat(txt(container, 'rpb-scanlines-drift'))      || 0.0;
        var hasVolFog       = txt(container, 'rpb-has-vol-fog')                    === '1';
        var volFogIntensity = parseFloat(txt(container, 'rpb-vol-fog-intensity'))   || 0.8;
        var volFogLength    = parseFloat(txt(container, 'rpb-vol-fog-length'))      || 2.0;
        var volFogSpread    = parseFloat(txt(container, 'rpb-vol-fog-spread'))      || 1.5;
        var volFogGradient  = parseFloat(txt(container, 'rpb-vol-fog-gradient'));
        if (isNaN(volFogGradient)) volFogGradient = 0.5;
        var volFogNoiseInt  = parseFloat(txt(container, 'rpb-vol-fog-noise-intensity')) || 0.0;
        var volFogNoiseGrad = parseFloat(txt(container, 'rpb-vol-fog-noise-gradient'));
        if (isNaN(volFogNoiseGrad)) volFogNoiseGrad = 1.0;
        var volFogBlur      = parseFloat(txt(container, 'rpb-vol-fog-blur'));
        if (isNaN(volFogBlur)) volFogBlur = 2.0;
        var volFogBrightness = parseFloat(txt(container, 'rpb-vol-fog-brightness'));
        if (isNaN(volFogBrightness)) volFogBrightness = 1.0;
        var hasVignette     = txt(container, 'rpb-has-vignette')                  === '1';
        var vigIntensity    = parseFloat(txt(container, 'rpb-vig-intensity'))       || 0.6;
        var hasFresnel      = txt(container, 'rpb-has-fresnel')                    === '1';
        var frIntensity     = parseFloat(txt(container, 'rpb-fr-intensity'))        || 0.8;
        var frPower         = parseFloat(txt(container, 'rpb-fr-power'))            || 2.0;
        var hasPhosphor     = txt(container, 'rpb-has-phosphor')                   === '1';
        var phIntensity     = parseFloat(txt(container, 'rpb-ph-intensity'))        || 0.04;
        var hasReflection      = txt(container, 'rpb-has-reflection')               === '1';
        var reflectionIntensity = parseFloat(txt(container, 'rpb-reflection-intensity')) || 0.5;
        var reflectionShininess = parseFloat(txt(container, 'rpb-reflection-shininess')) || 32;
        var lightDirX          = parseFloat(txt(container, 'rpb-light-dir-x'))          || 0;
        var lightDirY          = parseFloat(txt(container, 'rpb-light-dir-y'));
        var lightDirZ          = parseFloat(txt(container, 'rpb-light-dir-z'));
        if (!lightDirY && lightDirY !== 0) lightDirY = 1;
        if (!lightDirZ && lightDirZ !== 0) lightDirZ = 1;
        var touchMarginTop    = parseFloat(txt(container, 'rpb-touch-margin-top'))    || 60;
        var touchMarginRight  = parseFloat(txt(container, 'rpb-touch-margin-right'))  || 60;
        var touchMarginBottom = parseFloat(txt(container, 'rpb-touch-margin-bottom')) || 60;
        var touchMarginLeft   = parseFloat(txt(container, 'rpb-touch-margin-left'))   || 60;

        var playlistEl = container.querySelector('p.rpb-playlist');
        var playlist   = [];
        if (playlistEl) {
            try { playlist = JSON.parse(playlistEl.getAttribute('data-rpb-playlist') || '[]'); }
            catch (e) {}
        }

        // Mark immediately (synchronously) so concurrent initBlocks calls skip this container
        container.setAttribute('data-rpb-booting', '1');
        container.innerHTML = '';
        container.style.position = 'relative';
        container.style.width    = '100%';

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;height:' + (canvasHeight === -1 ? '100vh' : canvasHeight + 'px') + ';margin:0 auto;background:' + bgColor + ';';
        container.appendChild(wrapper);

        if (hasTip) {
            var tip = document.createElement('p');
            tip.className   = 'three-object-block-tip';
            tip.textContent = 'Click and drag ^';
            container.appendChild(tip);
        }

        if (!threeUrl) return;

        buildScene(wrapper, {
            threeUrl:     threeUrl,
            bgColor:      bgColor,
            zoom:         zoom,
            scale:        scale,
            canvasHeight: canvasHeight,
            hasZoom:    hasZoom,
            positionY:  positionY,
            rotationY:  rotationY,
            animations: animations,
            targetMesh: targetMesh,
            playlist:   playlist,
            imageDur:   imageDur,
            fadeDur:         fadeDur,
            anchorX:         anchorX,
            anchorY:         anchorY,
            hasScanlines:     hasScanlines,
            scanlinesOpacity: scanlinesOpacity,
            scanlinesSize:    scanlinesSize,
            scanlinesDrift:        scanlinesDrift,
            hasVolFog:             hasVolFog,
            volFogIntensity:       volFogIntensity,
            volFogLength:          volFogLength,
            volFogSpread:          volFogSpread,
            volFogGradient:        volFogGradient,
            volFogNoiseInt:        volFogNoiseInt,
            volFogNoiseGrad:       volFogNoiseGrad,
            volFogBlur:            volFogBlur,
            volFogBrightness:      volFogBrightness,
            hasVignette:           hasVignette,
            vigIntensity:          vigIntensity,
            hasFresnel:            hasFresnel,
            frIntensity:           frIntensity,
            frPower:               frPower,
            hasPhosphor:           hasPhosphor,
            phIntensity:           phIntensity,
            hasReflection:         hasReflection,
            reflectionIntensity:   reflectionIntensity,
            reflectionShininess:   reflectionShininess,
            lightDirX:             lightDirX,
            lightDirY:             lightDirY,
            lightDirZ:             lightDirZ,
            touchMarginTop:        touchMarginTop,
            touchMarginRight:      touchMarginRight,
            touchMarginBottom:     touchMarginBottom,
            touchMarginLeft:       touchMarginLeft
        });
    }

    // ── Build Three.js scene ─────────────────────────────────────────────────
    function buildScene(wrapper, cfg) {
        var safeW = wrapper.clientWidth  > 0 ? wrapper.clientWidth  : 800;
        var safeH = wrapper.clientHeight > 0 ? wrapper.clientHeight : (cfg.canvasHeight || 500);
        var W = Math.max(safeW, 1);
        var H = Math.max(safeH, 1);

        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(W, H);
        renderer.outputEncoding    = THREE.sRGBEncoding;
        renderer.toneMapping       = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
        renderer.physicallyCorrectLights = true;
        wrapper.appendChild(renderer.domElement);

        var scene  = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
        camera.position.set(0, 0, 20);
        camera.zoom = cfg.zoom;
        camera.updateProjectionMatrix();

        scene.add(new THREE.AmbientLight(0xffffff, 1));
        var dir = new THREE.DirectionalLight(0xffffff, 2);
        dir.position.set(0, 2, 2);
        dir.castShadow = true;
        dir.shadow.mapSize.width  = 2048;
        dir.shadow.mapSize.height = 2048;
        scene.add(dir);

        // ── OrbitControls with inset touch zone
        var touchZone = document.createElement('div');
        touchZone.style.cssText = 'position:absolute;top:' + cfg.touchMarginTop + 'px;bottom:' + cfg.touchMarginBottom + 'px;left:' + cfg.touchMarginLeft + 'px;right:' + cfg.touchMarginRight + 'px;pointer-events:auto;';
        wrapper.style.position = 'relative';
        wrapper.appendChild(touchZone);

        var controls = new THREE.OrbitControls(camera, touchZone);
        controls.enableZoom    = cfg.hasZoom;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.enablePan     = false;

        // Load the GLB using our bundled loader
        RPBGLBLoader.load(cfg.threeUrl, function(model, animationClips) {
            model.position.set(0, cfg.positionY, 0);
            model.rotation.set(0, cfg.rotationY, 0);
            model.scale.set(cfg.scale, cfg.scale, cfg.scale);
            scene.add(model);

            // Play animations
            if (cfg.animations && animationClips.length > 0) {
                var mixer = new THREE.AnimationMixer(model);
                var names = cfg.animations.split(',').map(function(s) { return s.trim(); });
                animationClips.forEach(function(clip) {
                    if (names.indexOf(clip.name) !== -1) mixer.clipAction(clip).play();
                });
                scene.userData.mixer = mixer;
            }

            // Playlist renderer
            if (cfg.targetMesh && cfg.playlist && cfg.playlist.length > 0) {
                var scanlinesOpts   = { enabled: cfg.hasScanlines, opacity: cfg.scanlinesOpacity, size: cfg.scanlinesSize, drift: cfg.scanlinesDrift };
                var reflectionOpts  = { enabled: cfg.hasReflection, intensity: cfg.reflectionIntensity, shininess: cfg.reflectionShininess, lightDir: [ cfg.lightDirX, cfg.lightDirY, cfg.lightDirZ ] };
                var screenGlowOpts  = { vigEnabled: cfg.hasVignette, vigIntensity: cfg.vigIntensity, frEnabled: cfg.hasFresnel, frIntensity: cfg.frIntensity, frPower: cfg.frPower, phEnabled: cfg.hasPhosphor, phIntensity: cfg.phIntensity };
                var volFogOpts      = { enabled: cfg.hasVolFog, intensity: cfg.volFogIntensity, length: cfg.volFogLength, spread: cfg.volFogSpread, gradient: cfg.volFogGradient, noiseInt: cfg.volFogNoiseInt, noiseGrad: cfg.volFogNoiseGrad, blur: cfg.volFogBlur, brightness: cfg.volFogBrightness };
                var targetObj = null;
                model.traverse(function(obj) {
                    if (!targetObj && obj.isMesh &&
                        obj.name.toLowerCase() === cfg.targetMesh.toLowerCase()) {
                        targetObj = obj;
                    }
                });

                if (targetObj) {
                    startPlaylist(targetObj, cfg.playlist, cfg.imageDur, cfg.fadeDur, scene, scanlinesOpts, reflectionOpts, screenGlowOpts, volFogOpts);
                } else {
                    var available = [];
                    model.traverse(function(o) { if(o.isMesh) available.push(o.name); });
                    console.warn('[RPB] Mesh "' + cfg.targetMesh + '" not found. Available:', available);
                }
            }

        }, function(err) {
            console.error('[RPB] GLB load failed:', err);
            wrapper.innerHTML = '<p style="color:#f55;padding:20px">Failed to load 3D model</p>';
        });

        // Render loop with inertia applied each frame
        var clock  = new THREE.Clock();
        var lastW  = wrapper.clientWidth;
        var lastH  = wrapper.clientHeight;

        // Apply viewport anchor offset via camera.setViewOffset so the orbit
        // pivot stays at world origin while the model appears shifted on screen.
        function applyAnchor(cw, ch) {
            if (cfg.anchorX === 0 && cfg.anchorY === 0) {
                camera.clearViewOffset();
            } else {
                var offsetX = -(cfg.anchorX / 100) * cw;
                var offsetY =  (cfg.anchorY / 100) * ch;
                camera.setViewOffset(cw, ch, offsetX, offsetY, cw, ch);
            }
            camera.updateProjectionMatrix();
        }

        applyAnchor(W, H);

        function animate() {
            requestAnimationFrame(animate);
            var cw = wrapper.clientWidth;
            var ch = wrapper.clientHeight;
            if (cw <= 0 || ch <= 0) return;
            if ((cw !== lastW) || (ch !== lastH)) {
                lastW = cw; lastH = ch;
                renderer.setSize(cw, ch);
                camera.aspect = cw / ch;
                applyAnchor(cw, ch);
            }
            controls.update();
            var delta = clock.getDelta();
            if (scene.userData.mixer)         scene.userData.mixer.update(delta);
            if (scene.userData.playlistUpdate) scene.userData.playlistUpdate(delta);
            renderer.render(scene, camera);
        }
        animate();
    }

    // ── Playlist crossfade renderer ──────────────────────────────────────────
    function startPlaylist(mesh, playlist, imageDur, fadeDur, scene, scanlines, reflection, screenGlow, volFog) {
        var elapsed      = 0;
        var activeVideo  = null;
        var isFading     = false;
        var fadeProgress = 0;
        var currentIdx   = 0;
        var preloadIdx   = 1 % playlist.length;
        var currentSlot  = null;  // { tex, vid } showing
        var preloadSlot  = null;  // { tex, vid } ready to swap in
        var outgoingSlot = null;  // { tex, vid } fading out — dispose after fade

        var sl = scanlines || {};
        var slEnabled = !!sl.enabled;
        var slOpacity = sl.opacity || 0.15;
        var slSize    = Math.max(2, sl.size || 3);
        var slDrift   = sl.drift || 0.0;
        var slTime    = 0.0;

        var rf = reflection || {};
        var rfEnabled   = !!rf.enabled;
        var rfIntensity = rf.intensity || 0.5;
        var rfShininess = rf.shininess || 32;
        var rfLightDir  = rf.lightDir  || [0, 1, 1];

        var vf = volFog || {};

        var gl = screenGlow || {};
        var vigEnabled   = !!gl.vigEnabled;
        var vigIntensity = gl.vigIntensity || 0.6;
        var frEnabled    = !!gl.frEnabled;
        var frIntensity  = gl.frIntensity  || 0.8;
        var frPower      = gl.frPower      || 2.0;
        var phEnabled    = !!gl.phEnabled;
        var phIntensity  = gl.phIntensity  || 0.04;

        var mat = new THREE.ShaderMaterial({
            uniforms: {
                texA:          { value: null },
                texB:          { value: null },
                blend:         { value: 0.0 },
                slOpacity:     { value: slEnabled ? slOpacity : 0.0 },
                slSize:        { value: slSize },
                slTime:        { value: 0.0 },
                rfIntensity:   { value: rfEnabled ? rfIntensity : 0.0 },
                rfShininess:   { value: rfShininess },
                rfLightDir:    { value: new THREE.Vector3(rfLightDir[0], rfLightDir[1], rfLightDir[2]).normalize() },
                vigIntensity:  { value: vigEnabled ? vigIntensity : 0.0 },
                frIntensity:   { value: frEnabled  ? frIntensity  : 0.0 },
                frPower:       { value: frPower },
                phIntensity:   { value: phEnabled  ? phIntensity  : 0.0 }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'varying vec3 vNormal;',
                'varying vec3 vViewDir;',
                'void main(){',
                '  vUv = uv;',
                '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
                '  vNormal  = normalize(normalMatrix * normal);',
                '  vViewDir = normalize(cameraPosition - worldPos.xyz);',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D texA;',
                'uniform sampler2D texB;',
                'uniform float blend;',
                'uniform float slOpacity;',
                'uniform float slSize;',
                'uniform float slTime;',
                'uniform float rfIntensity;',
                'uniform float rfShininess;',
                'uniform vec3  rfLightDir;',
                'uniform float vigIntensity;',
                'uniform float frIntensity;',
                'uniform float frPower;',
                'uniform float phIntensity;',
                'varying vec2 vUv;',
                'varying vec3 vNormal;',
                'varying vec3 vViewDir;',
                // hash noise for phosphor shimmer
                'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
                'float noise(vec2 p){',
                '  vec2 i=floor(p); vec2 f=fract(p);',
                '  float a=hash(i); float b=hash(i+vec2(1.,0.));',
                '  float c=hash(i+vec2(0.,1.)); float d=hash(i+vec2(1.,1.));',
                '  vec2 u=f*f*(3.-2.*f);',
                '  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);',
                '}',
                'void main(){',
                '  vec4 col = mix(texture2D(texA,vUv),texture2D(texB,vUv),blend);',
                '  // scanlines',
                '  float line = mod(floor((vUv.y + slTime) * slSize * 128.0), 2.0);',
                '  col.rgb *= 1.0 - (line * slOpacity);',
                '  // specular reflection',
                '  if(rfIntensity > 0.0){',
                '    vec3 h = normalize(rfLightDir + vViewDir);',
                '    float spec = pow(max(dot(vNormal, h), 0.0), rfShininess);',
                '    col.rgb += spec * rfIntensity;',
                '  }',
                '  // vignette glow — brighten toward screen edges',
                '  if(vigIntensity > 0.0){',
                '    vec2 uv2 = vUv * 2.0 - 1.0;',
                '    float vig = dot(uv2, uv2);',
                '    col.rgb += col.rgb * vig * vigIntensity;',
                '  }',
                '  // fresnel glow — brighten at glancing view angles',
                '  if(frIntensity > 0.0){',
                '    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), frPower);',
                '    col.rgb += fresnel * frIntensity;',
                '  }',
                '  // phosphor shimmer — low-freq noise luminance variation',
                '  if(phIntensity > 0.0){',
                '    float n = noise(vUv * 6.0 + slTime * 0.3);',
                '    col.rgb += (n - 0.5) * phIntensity;',
                '  }',
                '  gl_FragColor = col;',
                '}'
            ].join('\n'),
            side: THREE.FrontSide
        });
        mesh.material = mat;

        // ── Screen light frustum ──────────────────────────────────────────
        // Built after mesh.material is set so bounding box is available.
        // Stored on scene.userData so playlistUpdate can sync the texture.
        if (vf.enabled) {
            mesh.geometry.computeBoundingBox();
            var bb   = mesh.geometry.boundingBox;
            var iW   = bb.max.x - bb.min.x;
            var iH   = bb.max.y - bb.min.y;
            var iX0  = bb.min.x;
            var iX1  = bb.max.x;
            var iY0  = bb.min.y;
            var iY1  = bb.max.y;
            // Screen face is at bb.max.z (positive Z faces viewer in this mesh)
            // Inner edge sits on the screen face, outer edge extends toward the viewer (+Z)
            var sp   = (vf.spread  || 1.5);
            var len  = (vf.length  || 2.0);
            var oW   = iW * sp;
            var oH   = iH * sp;
            var dX   = (oW - iW) * 0.5;
            var dY   = (oH - iH) * 0.5;
            var oX0  = iX0 - dX;
            var oX1  = iX1 + dX;
            var oY0  = iY0 - dY;
            var oY1  = iY1 + dY;
            var z0   = bb.max.z;               // inner Z: screen face
            var z1   = bb.max.z + len;         // outer Z: toward viewer

            // Solid closed frustum cone — 8 unique corner verts.
            // Each of the 4 side faces is a trapezoid (inner edge at z0, outer at z1).
            // uv.x = 0 at left/bottom of each face, 1 at right/top
            // uv.y = 0 at inner (screen) edge, 1 at outer edge
            // 4 verts per face (duplicated for correct UVs), 4 faces = 16 verts
            var positions = new Float32Array([
                // TOP face (inner top edge → outer top edge)
                iX0,iY1,z0,  iX1,iY1,z0,  oX0,oY1,z1,  oX1,oY1,z1,
                // BOTTOM face (inner bottom → outer bottom)
                iX1,iY0,z0,  iX0,iY0,z0,  oX1,oY0,z1,  oX0,oY0,z1,
                // LEFT face
                iX0,iY0,z0,  iX0,iY1,z0,  oX0,oY0,z1,  oX0,oY1,z1,
                // RIGHT face
                iX1,iY1,z0,  iX1,iY0,z0,  oX1,oY1,z1,  oX1,oY0,z1
            ]);

            // uv.x = position along face (0→1), uv.y = depth (0=inner, 1=outer)
            // uv2.x = face id (0=top,1=bottom,2=left,3=right), uv2.y = unused
            var uvs = new Float32Array([
                0,0, 1,0, 0,1, 1,1,
                0,0, 1,0, 0,1, 1,1,
                0,0, 1,0, 0,1, 1,1,
                0,0, 1,0, 0,1, 1,1
            ]);
            var uv2s = new Float32Array(16 * 2);
            for (var f = 0; f < 4; f++) {
                for (var v = 0; v < 4; v++) {
                    uv2s[(f*4+v)*2]   = f;
                    uv2s[(f*4+v)*2+1] = 0;
                }
            }

            var idxArr = new Uint16Array(24);
            for (var f = 0; f < 4; f++) {
                var b = f * 4, o = f * 6;
                idxArr[o]   = b;   idxArr[o+1] = b+1; idxArr[o+2] = b+2;
                idxArr[o+3] = b+1; idxArr[o+4] = b+3; idxArr[o+5] = b+2;
            }

            var frustumGeo = new THREE.BufferGeometry();
            frustumGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            frustumGeo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
            frustumGeo.setAttribute('uv2',      new THREE.BufferAttribute(uv2s, 2));
            frustumGeo.setIndex(new THREE.BufferAttribute(idxArr, 1));

            var frustumTime = 0.0;
            var frustumMat  = new THREE.ShaderMaterial({
                uniforms: {
                    texA:         { value: null },
                    frustumTime:  { value: 0.0 },
                    fogIntensity: { value: vf.intensity || 0.8 },
                    fogGradient:  { value: (vf.gradient !== undefined ? vf.gradient : 0.5) },
                    noiseInt:     { value: vf.noiseInt  || 0.0 },
                    noiseGrad:    { value: (vf.noiseGrad !== undefined ? vf.noiseGrad : 1.0) },
                    fogBrightness:{ value: (vf.brightness !== undefined ? vf.brightness : 1.0) }
                },
                vertexShader: [
                    'attribute vec2 uv2;',
                    'varying vec2 vUv;',
                    'varying float vFace;',
                    'void main(){',
                    '  vUv   = uv;',
                    '  vFace = uv2.x;',
                    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'uniform sampler2D texA;',
                    'uniform float frustumTime;',
                    'uniform float fogIntensity;',
                    'uniform float fogGradient;',
                    'uniform float noiseInt;',
                    'uniform float noiseGrad;',
                    'uniform float fogBrightness;',
                    'varying vec2  vUv;',
                    'varying float vFace;',
                    'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
                    'float snoise(vec2 p){',
                    '  vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.-2.*f);',
                    '  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);',
                    '}',
                    'void main(){',
                    '  float fade = vUv.y;',
                    '  vec4 col = texture2D(texA, vec2(0.5, 0.5));',
                    // slow noise modulates density for organic scatter look
                    '  float nx = snoise(vec2(vUv.x*2.0 + frustumTime*0.08, fade*2.0));',
                    '  float ny = snoise(vec2(vUv.x*1.5 - frustumTime*0.06 + 3.7, fade*1.5));',
                    '  float scatter = 0.75 + 0.25 * snoise(vec2(nx*2.0, ny*2.0 + frustumTime*0.05));',
                    '  float lum   = dot(col.rgb, vec3(0.299,0.587,0.114));',
                    // soft edges: fade to zero near all four UV borders
                    '  float edgeX = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);',
                    '  float edgeY = smoothstep(0.0, 0.08, fade) * smoothstep(1.0, 0.85, fade);',
                    '  float edgeMask = edgeX * edgeY;',
                    '  float alpha = pow(1.0-fade, 1.0/fogGradient) * lum * scatter * edgeMask * fogIntensity * 0.4;',
                    '  float noiseBleed = scatter * pow(1.0-fade, 1.0/noiseGrad) * noiseInt;',
                    '  alpha = clamp(alpha + noiseBleed, 0.0, 1.0 - fogBrightness * 0.95);',
                    '  gl_FragColor = vec4(col.rgb, alpha);',
                    '}'
                ].join('\n'),
                transparent: true,
                depthWrite:  false,
                side:        THREE.DoubleSide,
                blending:    THREE.AdditiveBlending
            });

            var frustumMesh = new THREE.Mesh(frustumGeo, frustumMat);
            mesh.add(frustumMesh);

            scene.userData.frustumMat     = frustumMat;
            scene.userData.frustumTimeRef = { t: 0.0 };
        }

        // ── loaders ────────────────────────────────────────────────────────
        function loadImg(url, cb) {
            new THREE.TextureLoader().load(url, function(t) {
                t.encoding = THREE.sRGBEncoding;
                t.flipY    = false;
                cb(t);
            });
        }

        function loadVid(url, cb) {
            var v = document.createElement('video');
            v.src = url; v.muted = true; v.loop = false;
            v.playsInline = true; v.crossOrigin = 'anonymous';
            v.preload = 'auto';
            v.style.display = 'none';
            document.body.appendChild(v);
            v.addEventListener('canplaythrough', function() {
                var t = new THREE.VideoTexture(v);
                t.encoding  = THREE.sRGBEncoding;
                t.minFilter = THREE.LinearFilter;
                t.flipY     = false;
                cb(t, v);
            }, { once: true });
            v.load();
        }

        function disposeTex(t) {
            if (!t) return;
            if (t.image && t.image.tagName === 'VIDEO') {
                t.image.pause(); t.image.src = '';
                if (t.image.parentNode) t.image.parentNode.removeChild(t.image);
            }
            t.dispose();
        }

        function disposeSlot(slot) {
            if (slot) disposeTex(slot.tex);
        }

        function loadItem(playlistIdx, cb) {
            var item = playlist[playlistIdx];
            if (item.type === 'video') {
                loadVid(item.url, function(t, v) { cb({ tex: t, vid: v }); });
            } else {
                loadImg(item.url, function(t) { cb({ tex: t, vid: null }); });
            }
        }

        // ── transition ─────────────────────────────────────────────────────
        function playSlot(slot) {
            outgoingSlot = currentSlot; // kept alive in texA through the fade
            currentSlot  = slot;
            isFading = true; fadeProgress = 0;
            if (slot.vid) {
                activeVideo = slot.vid;
                slot.vid.currentTime = 0;
                slot.vid.play().catch(function(){});
                slot.vid.addEventListener('ended', advance, { once: true });
                // Don't bind the texture until the seek has produced a decoded
                // frame — uploading earlier throws "texImage2D: no video".
                // (Same guard as the boot path below.)
                var bindTexB = function() {
                    if (currentSlot !== slot) return; // superseded by a later slot
                    if (slot.vid.readyState >= 2) {
                        mat.uniforms.texB.value = slot.tex;
                        mat.uniformsNeedUpdate  = true;
                    } else {
                        requestAnimationFrame(bindTexB);
                    }
                };
                bindTexB();
            } else {
                mat.uniforms.texB.value = slot.tex;
                mat.uniformsNeedUpdate  = true;
                activeVideo = null; elapsed = 0;
            }
        }

        function advance() {
            currentIdx = preloadIdx;
            preloadIdx = (currentIdx + 1) % playlist.length;

            if (preloadSlot) {
                playSlot(preloadSlot);
                preloadSlot = null;
            } else {
                loadItem(currentIdx, function(slot) { playSlot(slot); });
            }
            // always preload next while current plays
            loadItem(preloadIdx, function(slot) {
                preloadSlot = slot;
                if (slot.vid) slot.vid.pause();
            });
        }

        // ── per-frame update ───────────────────────────────────────────────
        scene.userData.playlistUpdate = function(delta) {
            if (!mat.uniforms) return;

            if (slEnabled && slDrift !== 0.0) {
                slTime += delta * slDrift;
                mat.uniforms.slTime.value = slTime;
                mat.uniformsNeedUpdate = true;
            }

            if (activeVideo && !activeVideo.paused && activeVideo.readyState >= 2) {
                var vt = isFading ? mat.uniforms.texB.value : mat.uniforms.texA.value;
                if (vt && vt.isVideoTexture) vt.needsUpdate = true;
            }

            if (isFading) {
                fadeProgress += delta / fadeDur;
                if (fadeProgress >= 1) {
                    isFading = false;
                    mat.uniforms.texA.value  = currentSlot.tex;
                    mat.uniforms.texB.value  = null;
                    mat.uniforms.blend.value = 0;
                    mat.uniformsNeedUpdate   = true;
                    disposeSlot(outgoingSlot);
                    outgoingSlot = null;
                } else {
                    mat.uniforms.blend.value = fadeProgress;
                    mat.uniformsNeedUpdate   = true;
                }
            } else if (!activeVideo) {
                elapsed += delta;
                if (elapsed >= imageDur) advance();
            }

            // frustum light tick — after the fade block, so it never mirrors
            // a texture that was just disposed above
            if (scene.userData.frustumMat) {
                scene.userData.frustumTimeRef.t += delta * 0.5;
                scene.userData.frustumMat.uniforms.frustumTime.value = scene.userData.frustumTimeRef.t;
                scene.userData.frustumMat.uniforms.texA.value        = mat.uniforms.texA.value;
                scene.userData.frustumMat.uniformsNeedUpdate         = true;
            }
        };

        // ── boot ───────────────────────────────────────────────────────────
        loadItem(0, function(slot) {
            currentSlot = slot;
            mat.uniforms.blend.value = 0;
            if (slot.vid) {
                // defer texA assignment until video has a decoded frame
                activeVideo = slot.vid;
                slot.vid.currentTime = 0;
                slot.vid.play().catch(function(){});
                slot.vid.addEventListener('ended', advance, { once: true });
                var assignTex = function() {
                    if (slot.vid.readyState >= 2) {
                        mat.uniforms.texA.value = slot.tex;
                        mat.uniformsNeedUpdate  = true;
                    } else {
                        requestAnimationFrame(assignTex);
                    }
                };
                assignTex();
            } else {
                mat.uniforms.texA.value = slot.tex;
                mat.uniformsNeedUpdate  = true;
                elapsed = 0;
            }
            loadItem(preloadIdx, function(next) {
                preloadSlot = next;
                if (next.vid) next.vid.pause();
            });
        });
    }

})();
