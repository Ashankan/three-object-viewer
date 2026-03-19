/**
 * RPB Minimal GLB Loader
 * Handles binary GLTF (.glb) files using THREE r128 already on the page.
 * Supports: meshes, materials (PBR), textures, vertex colors, animations.
 * Does NOT require GLTFLoader from examples/js.
 * 
 * Usage: RPBGLBLoader.load(url, onLoad, onError)
 *        onLoad(scene, animations)
 *
 * Naming strategy: node names take priority over mesh names.
 * If a mesh node has a generic name (e.g. "defaultMaterial"), it inherits
 * the parent node's name — matching how Blender/Sketchfab exports name things.
 */
var RPBGLBLoader = (function(THREE) {

    var BINARY_MAGIC = 0x46546C67; // 'glTF'
    var CHUNK_JSON   = 0x4E4F534A;
    var CHUNK_BIN    = 0x004E4942;

    // Names considered "generic" — inherit parent name instead
    var GENERIC_NAMES = ['defaultMaterial', 'Mesh', 'mesh', 'Object', 'Plane', 'Cube', 'Sphere'];

    function isGenericName(name) {
        if (!name) return true;
        if (/^node_\d+$/.test(name)) return true;
        for (var i = 0; i < GENERIC_NAMES.length; i++) {
            if (name === GENERIC_NAMES[i] || name.startsWith(GENERIC_NAMES[i] + '.')) return true;
        }
        return false;
    }

    // ── Entry point ──────────────────────────────────────────────────────────
    function load(url, onLoad, onError) {
        fetch(url)
            .then(function(r) { return r.arrayBuffer(); })
            .then(function(buf) { parse(buf, url, onLoad, onError); })
            .catch(function(e) { if (onError) onError(e); });
    }

    // ── GLB binary parsing ───────────────────────────────────────────────────
    function parse(buffer, baseUrl, onLoad, onError) {
        var view = new DataView(buffer);
        if (view.getUint32(0, true) !== BINARY_MAGIC) {
            if (onError) onError(new Error('[RPBGLBLoader] Not a GLB file'));
            return;
        }
        var chunk0Len  = view.getUint32(12, true);
        var chunk0Type = view.getUint32(16, true);
        if (chunk0Type !== CHUNK_JSON) {
            if (onError) onError(new Error('[RPBGLBLoader] First chunk not JSON'));
            return;
        }
        var gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, chunk0Len)));

        var binBuffer = null;
        var c1Offset  = 20 + chunk0Len;
        if (c1Offset + 8 < buffer.byteLength) {
            var c1Len  = view.getUint32(c1Offset, true);
            var c1Type = view.getUint32(c1Offset + 4, true);
            if (c1Type === CHUNK_BIN) {
                binBuffer = buffer.slice(c1Offset + 8, c1Offset + 8 + c1Len);
            }
        }
        buildScene(gltf, binBuffer, baseUrl, onLoad, onError);
    }

    // ── Accessor / buffer helpers ────────────────────────────────────────────
    function getAccessorData(gltf, binBuffer, index) {
        var acc = gltf.accessors[index];
        var bv  = gltf.bufferViews[acc.bufferView !== undefined ? acc.bufferView : acc.bufferViewIndex];
        var byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        var components = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT2:4, MAT3:9, MAT4:16 }[acc.type] || 1;
        switch (acc.componentType) {
            case 5126: return new Float32Array(binBuffer, byteOffset, acc.count * components);
            case 5125: return new Uint32Array(binBuffer, byteOffset, acc.count * components);
            case 5123: return new Uint16Array(binBuffer, byteOffset, acc.count * components);
            case 5121: return new Uint8Array(binBuffer, byteOffset, acc.count * components);
            case 5122: return new Int16Array(binBuffer, byteOffset, acc.count * components);
            case 5120: return new Int8Array(binBuffer, byteOffset, acc.count * components);
            default:   return new Float32Array(binBuffer, byteOffset, acc.count * components);
        }
    }

    // ── Texture loading ──────────────────────────────────────────────────────
    function loadTextures(gltf, binBuffer, baseUrl, cb) {
        if (!gltf.textures || !gltf.textures.length) { cb([]); return; }
        var out     = new Array(gltf.textures.length).fill(null);
        var pending = gltf.textures.length;
        var base    = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

        gltf.textures.forEach(function(texDef, i) {
            var imgDef  = gltf.images[texDef.source];
            var sampler = (gltf.samplers && texDef.sampler !== undefined)
                ? gltf.samplers[texDef.sampler] : {};

            function apply(url) {
                new THREE.TextureLoader().load(url, function(t) {
                    t.encoding = THREE.sRGBEncoding;
                    t.flipY    = false;
                    t.wrapS    = sampler.wrapS || THREE.RepeatWrapping;
                    t.wrapT    = sampler.wrapT || THREE.RepeatWrapping;
                    out[i]     = t;
                    if (--pending === 0) cb(out);
                }, undefined, function() { if (--pending === 0) cb(out); });
            }

            if (imgDef.uri) {
                apply(imgDef.uri.startsWith('data:') ? imgDef.uri : base + imgDef.uri);
            } else if (imgDef.bufferView !== undefined) {
                var bv   = gltf.bufferViews[imgDef.bufferView];
                var blob = new Blob(
                    [new Uint8Array(binBuffer, bv.byteOffset || 0, bv.byteLength)],
                    { type: imgDef.mimeType || 'image/png' }
                );
                apply(URL.createObjectURL(blob));
            } else {
                if (--pending === 0) cb(out);
            }
        });
    }

    // ── Material builder ─────────────────────────────────────────────────────
    function buildMaterial(matDef, textures) {
        if (!matDef) return new THREE.MeshStandardMaterial({ color: 0xcccccc });
        var p   = {};
        var pbr = matDef.pbrMetallicRoughness || {};
        if (pbr.baseColorFactor) {
            p.color   = new THREE.Color(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]);
            p.opacity = pbr.baseColorFactor[3] !== undefined ? pbr.baseColorFactor[3] : 1;
            if (p.opacity < 1) p.transparent = true;
        }
        if (pbr.baseColorTexture && textures[pbr.baseColorTexture.index])
            p.map = textures[pbr.baseColorTexture.index];
        p.metalness = pbr.metallicFactor  !== undefined ? pbr.metallicFactor  : 1;
        p.roughness = pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1;
        if (pbr.metallicRoughnessTexture && textures[pbr.metallicRoughnessTexture.index]) {
            p.metalnessMap = textures[pbr.metallicRoughnessTexture.index];
            p.roughnessMap = textures[pbr.metallicRoughnessTexture.index];
        }
        if (matDef.normalTexture   && textures[matDef.normalTexture.index])
            p.normalMap = textures[matDef.normalTexture.index];
        if (matDef.emissiveFactor)
            p.emissive = new THREE.Color(matDef.emissiveFactor[0], matDef.emissiveFactor[1], matDef.emissiveFactor[2]);
        if (matDef.emissiveTexture && textures[matDef.emissiveTexture.index])
            p.emissiveMap = textures[matDef.emissiveTexture.index];
        p.side = matDef.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
        if (matDef.alphaMode === 'BLEND')  { p.transparent = true; p.depthWrite = false; }
        if (matDef.alphaMode === 'MASK')   { p.alphaTest = matDef.alphaCutoff !== undefined ? matDef.alphaCutoff : 0.5; }
        return new THREE.MeshStandardMaterial(p);
    }

    // ── Mesh builder ─────────────────────────────────────────────────────────
    function buildPrimitive(prim, gltf, binBuffer, textures) {
        var geo   = new THREE.BufferGeometry();
        var attrs = prim.attributes;

        function set3(name, idx) {
            var d = getAccessorData(gltf, binBuffer, idx);
            geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(d), 3));
        }
        function set2(name, idx) {
            var d = getAccessorData(gltf, binBuffer, idx);
            geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(d), 2));
        }

        if (attrs.POSITION  !== undefined) set3('position', attrs.POSITION);
        if (attrs.NORMAL    !== undefined) set3('normal',   attrs.NORMAL);
        if (attrs.TEXCOORD_0 !== undefined) set2('uv',  attrs.TEXCOORD_0);
        if (attrs.TEXCOORD_1 !== undefined) set2('uv2', attrs.TEXCOORD_1);

        if (attrs.COLOR_0 !== undefined) {
            var cd  = getAccessorData(gltf, binBuffer, attrs.COLOR_0);
            var cAcc = gltf.accessors[attrs.COLOR_0];
            var cc  = cAcc.type === 'VEC4' ? 4 : 3;
            geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cd), cc));
        }
        if (attrs.JOINTS_0 !== undefined && attrs.WEIGHTS_0 !== undefined) {
            var jd = getAccessorData(gltf, binBuffer, attrs.JOINTS_0);
            var wd = getAccessorData(gltf, binBuffer, attrs.WEIGHTS_0);
            geo.setAttribute('skinIndex',  new THREE.BufferAttribute(new Uint16Array(jd),  4));
            geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(wd), 4));
        }
        if (prim.indices !== undefined) {
            var id  = getAccessorData(gltf, binBuffer, prim.indices);
            var iAcc = gltf.accessors[prim.indices];
            geo.setIndex(new THREE.BufferAttribute(
                iAcc.componentType === 5125 ? new Uint32Array(id) : new Uint16Array(id), 1
            ));
        }
        if (!geo.attributes.normal) geo.computeVertexNormals();

        var matDef = (gltf.materials && prim.material !== undefined) ? gltf.materials[prim.material] : null;
        var mat    = buildMaterial(matDef, textures);
        var mesh   = (attrs.JOINTS_0 !== undefined) ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        return mesh;
    }

    function buildMeshObject(meshDef, gltf, binBuffer, textures) {
        var prims = meshDef.primitives.map(function(p) { return buildPrimitive(p, gltf, binBuffer, textures); });
        if (prims.length === 1) return prims[0];
        var g = new THREE.Group();
        prims.forEach(function(p) { g.add(p); });
        return g;
    }

    // ── Animation builder ─────────────────────────────────────────────────────
    function buildAnimations(gltf, binBuffer, nodeObjects) {
        if (!gltf.animations) return [];
        return gltf.animations.map(function(animDef) {
            var tracks = [];
            animDef.channels.forEach(function(channel) {
                var sampler  = animDef.samplers[channel.sampler];
                var node     = nodeObjects[channel.target.node];
                if (!node) return;
                var times  = new Float32Array(getAccessorData(gltf, binBuffer, sampler.input));
                var values = new Float32Array(getAccessorData(gltf, binBuffer, sampler.output));
                var name   = node.name || ('node_' + channel.target.node);
                var track;
                if (channel.target.path === 'translation')
                    track = new THREE.VectorKeyframeTrack(name + '.position', times, values);
                else if (channel.target.path === 'rotation')
                    track = new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, values);
                else if (channel.target.path === 'scale')
                    track = new THREE.VectorKeyframeTrack(name + '.scale', times, values);
                if (track) tracks.push(track);
            });
            return new THREE.AnimationClip(animDef.name || 'anim', -1, tracks);
        });
    }

    // ── Scene assembly ────────────────────────────────────────────────────────
    function buildScene(gltf, binBuffer, baseUrl, onLoad, onError) {
        loadTextures(gltf, binBuffer, baseUrl, function(textures) {
            try {
                // Build raw mesh objects (unnamed at this point)
                var meshObjects = (gltf.meshes || []).map(function(md) {
                    return buildMeshObject(md, gltf, binBuffer, textures);
                });

                var nodeObjects = {};

                // Pass 1: instantiate every node object
                if (gltf.nodes) {
                    gltf.nodes.forEach(function(nodeDef, i) {
                        var obj = nodeDef.mesh !== undefined
                            ? meshObjects[nodeDef.mesh]
                            : new THREE.Group();
                        // Use node name as primary name
                        obj.name = nodeDef.name || ('node_' + i);
                        nodeObjects[i] = obj;
                    });

                    // Pass 2: apply transforms and build parent-child hierarchy
                    gltf.nodes.forEach(function(nodeDef, i) {
                        var obj = nodeObjects[i];
                        if (nodeDef.matrix) {
                            new THREE.Matrix4().fromArray(nodeDef.matrix)
                                .decompose(obj.position, obj.quaternion, obj.scale);
                        } else {
                            if (nodeDef.translation) obj.position.fromArray(nodeDef.translation);
                            if (nodeDef.rotation)    obj.quaternion.fromArray(nodeDef.rotation);
                            if (nodeDef.scale)       obj.scale.fromArray(nodeDef.scale);
                        }
                        if (nodeDef.children) {
                            nodeDef.children.forEach(function(ci) { obj.add(nodeObjects[ci]); });
                        }
                    });

                    // Pass 3: rename generic mesh names using their parent node name
                    // e.g. Screen → defaultMaterial becomes Screen → Screen
                    gltf.nodes.forEach(function(nodeDef, i) {
                        var parentObj = nodeObjects[i];
                        if (!parentObj || !nodeDef.children) return;
                        nodeDef.children.forEach(function(ci) {
                            var child = nodeObjects[ci];
                            if (child && child.isMesh && isGenericName(child.name)) {
                                // Parent has a meaningful name — give it to the mesh
                                child.name = parentObj.name;
                            }
                        });
                    });
                }

                // Build scene root
                var scene     = new THREE.Group();
                scene.name    = 'RPBScene';
                var sceneIdx  = gltf.scene !== undefined ? gltf.scene : 0;
                var sceneDef  = gltf.scenes ? gltf.scenes[sceneIdx] : { nodes: [] };
                (sceneDef.nodes || []).forEach(function(ni) { scene.add(nodeObjects[ni]); });

                var animations = buildAnimations(gltf, binBuffer, nodeObjects);

                onLoad(scene, animations);

            } catch (e) {
                console.error('[RPBGLBLoader] Parse error:', e);
                if (onError) onError(e);
            }
        });
    }

    return { load: load };

})(typeof THREE !== 'undefined' ? THREE : null);
