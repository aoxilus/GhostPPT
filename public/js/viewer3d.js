/**
 * viewer3d.js — Studio 3D Engine (Three.js r119)
 * Features:
 *  - 3D Arrow Drawing:
 *      * Click 1: Click outside the object (or anywhere) to set origin (Alpha 0.5 -> 0.75 preview)
 *      * Click 2: Click on the object to set target -> Draws 3D arrow pointing into the object (Alpha 1.0)
 *      * Live mouse-tracking arrow preview
 *  - Translucent Marker Sphere:
 *      * Embedded see-through red sphere (opacity 0.45 with bright focal center)
 *  - Auto-Centering + Gravity floor grounding on +90° rotations
 *  - Light / Dark Theme switching
 *  - Text Annotation Cards, Materials & Camera Flight
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.119/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.119/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.119/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'https://cdn.jsdelivr.net/npm/three@0.119/examples/jsm/loaders/STLLoader.js';

export class Viewer3D {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container #${containerId} not found`);

    this.options = {
      onCameraChange: null,
      onArrowAdded: null,
      onMarkerPlaced: null,
      onToolStateChange: null,
      ...options
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.loadedObject = null;
    this.currentFileName = '';

    // Active Tool Mode: 'none' | 'arrow' | 'sphere' | 'text'
    this.activeTool = 'none';

    // Procedural Textures (Tanjiro Checkered Squares & Slate Rock)
    const createTanjiroTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const sz = 32;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#10b981' : '#090d16';
          ctx.fillRect(c * sz, r * sz, sz, sz);
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(4, 4);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearMipMapLinearFilter;
      return tex;
    };

    const createRockTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 3000; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = Math.random() * 2.5 + 0.5;
        const shade = Math.floor(Math.random() * 110) + 30;
        ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 8})`;
        ctx.fillRect(x, y, r, r);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 3);
      return tex;
    };

    // Auto-Calculate Triplanar UVs for STL and OBJ files (Enables textures on any 3D model)
    this.ensureTriplanarUVs = (geometry) => {
      if (!geometry || !geometry.attributes.position) return;
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();
      const bbox = geometry.boundingBox;
      const size = new THREE.Vector3().subVectors(bbox.max, bbox.min);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const pos = geometry.attributes.position;
      const normals = geometry.attributes.normal;
      const uvs = [];

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        let nx = 0, ny = 1, nz = 0;
        if (normals) {
          nx = Math.abs(normals.getX(i));
          ny = Math.abs(normals.getY(i));
          nz = Math.abs(normals.getZ(i));
        }

        // Zero-distortion triplanar mapping based on surface orientation
        if (nx >= ny && nx >= nz) {
          uvs.push(((z - bbox.min.z) / maxDim) * 4, ((y - bbox.min.y) / maxDim) * 4);
        } else if (ny >= nx && ny >= nz) {
          uvs.push(((x - bbox.min.x) / maxDim) * 4, ((z - bbox.min.z) / maxDim) * 4);
        } else {
          uvs.push(((x - bbox.min.x) / maxDim) * 4, ((y - bbox.min.y) / maxDim) * 4);
        }
      }
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.uvsNeedUpdate = true;
    };

    // Materials (Mate, Metal Bluish Silver, Tanjiro Squares, Rock Granite, Wireframe colors)
    this.materials = {
      plain: new THREE.MeshStandardMaterial({
        color: 0xc8ced6,
        roughness: 0.65,
        metalness: 0.15,
        side: THREE.DoubleSide
      }),
      metal: new THREE.MeshStandardMaterial({
        color: 0xa5c4e8, // Bluish Silver (Plateado Azulado)
        metalness: 0.95,
        roughness: 0.16,
        side: THREE.DoubleSide
      }),
      squares: new THREE.MeshStandardMaterial({
        map: createTanjiroTexture(),
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.DoubleSide
      }),
      rock: new THREE.MeshStandardMaterial({
        map: createRockTexture(),
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      wireframe_blue: new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        wireframe: true,
        side: THREE.DoubleSide
      }),
      wireframe_white: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        side: THREE.DoubleSide
      }),
      wireframe_black: new THREE.MeshBasicMaterial({
        color: 0x111827,
        wireframe: true,
        side: THREE.DoubleSide
      }),
      wireframe: new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        wireframe: true,
        side: THREE.DoubleSide
      }),
      texture: new THREE.MeshStandardMaterial({
        map: createTanjiroTexture(),
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.DoubleSide
      })
    };
    this.currentViewMode = 'plain';

    // 3D Arrows
    this.arrowStep = 0; // 0 = ready, 1 = origin set, picking destination
    this.arrowStartPoint = null;
    this.arrowLivePreview = null;
    this.arrowStartIndicator = null;
    this.arrowHelpers = [];
    this.arrowPositions = []; // [{start: {x,y,z}, end: {x,y,z}}]

    // Translucent Point Spheres (Hotspots)
    this.markerGroup = null;
    this.markerPosition = null;
    this.spherePreview = null;

    // Helpers
    this.axesHelper = null;
    this.gridHelper = null;

    // Camera animation
    this.isTransitioning = false;
    this.camStart = new THREE.Vector3();
    this.camEnd = new THREE.Vector3();
    this.targetStart = new THREE.Vector3();
    this.targetEnd = new THREE.Vector3();
    this.transProgress = 0;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.init();
  }

  init() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 560;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xedf2f7); // Default Light Theme

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 1500);
    this.camera.position.set(0, 1.5, 7.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
    keyLight.position.set(8, 14, 10);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.5);
    fillLight.position.set(-8, -6, -8);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    rimLight.position.set(0, -10, 5);
    this.scene.add(rimLight);

    // Floor Grid (Light Theme by default)
    this.gridHelper = new THREE.GridHelper(24, 24, 0xa0aec0, 0xcbd5e1);
    this.gridHelper.position.y = -2.6;
    this.scene.add(this.gridHelper);

    // Indicator for Arrow Point 1 (Tail in space)
    const ptGeo = new THREE.SphereGeometry(0.08, 24, 24);
    const ptMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
    this.arrowStartIndicator = new THREE.Mesh(ptGeo, ptMat);
    this.arrowStartIndicator.visible = false;
    this.scene.add(this.arrowStartIndicator);

    // Hover Preview Sphere for Marker Placement (Translucent Alpha 0.5)
    const prevGeo = new THREE.SphereGeometry(0.16, 24, 24);
    const prevMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.45,
      roughness: 0.2,
      depthWrite: false
    });
    this.spherePreview = new THREE.Mesh(prevGeo, prevMat);
    this.spherePreview.visible = false;
    this.scene.add(this.spherePreview);

    // Event Listeners
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.renderer.domElement.addEventListener('contextmenu', (e) => this.onContextMenu(e));

    this.controls.addEventListener('change', () => {
      if (this.options.onCameraChange) {
        this.options.onCameraChange(this.getCameraState());
      }
    });

    this.animate();
  }

  onResize() {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // Raycast to model surface
  getIntersection(event) {
    if (!this.loadedObject) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.loadedObject, true);
    return (intersects && intersects.length > 0) ? intersects[0] : null;
  }

  // Raycast to 3D Space (Model Surface OR Empty Focal Plane outside model)
  getPointInSpace(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. Check if clicking on 3D model
    if (this.loadedObject) {
      const intersects = this.raycaster.intersectObject(this.loadedObject, true);
      if (intersects && intersects.length > 0) {
        return { point: intersects[0].point.clone(), onObject: true, screenPos: { x: this.mouse.x, y: this.mouse.y } };
      }
    }

    // 2. If clicking in empty space (outside the object), intersect with camera focal plane
    const planeNormal = new THREE.Vector3();
    this.camera.getWorldDirection(planeNormal).negate(); // Normal pointing to camera
    const focalPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, this.controls.target);
    const targetPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(focalPlane, targetPoint);
    if (hit) {
      return { point: targetPoint.clone(), onObject: false, screenPos: { x: this.mouse.x, y: this.mouse.y } };
    }
    return null;
  }

  // Calculate true screen-aligned start point at the depth of the target surface pixel
  projectStartToSurfacePlane(screenPos, targetSurfacePoint) {
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const planeNormal = camDir.clone().negate(); // Normal pointing back towards camera

    // Create plane perpendicular to camera view passing through the clicked surface point
    const surfaceViewPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, targetSurfacePoint);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(screenPos.x, screenPos.y), this.camera);

    const projectedStart = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(surfaceViewPlane, projectedStart);
    return hit ? projectedStart : null;
  }

  // Live mouse hover & arrow preview
  onPointerMove(event) {
    // 1. Arrow Tool Live Preview (from Click 1 to current mouse position)
    if (this.activeTool === 'arrow' && this.arrowStep === 1 && this.arrowScreenStart) {
      const hit = this.getPointInSpace(event);
      if (hit) {
        // Project start point to the view-plane of the current hover point
        const projectedStart = this.projectStartToSurfacePlane(this.arrowScreenStart, hit.point);
        if (projectedStart) {
          this.updateLiveArrowPreview(projectedStart, hit.point);
        }
      }
    }

    // 2. Sphere Hotspot Preview on model surface
    else if (this.activeTool === 'sphere') {
      const hit = this.getIntersection(event);
      if (hit) {
        this.spherePreview.position.copy(hit.point);
        this.spherePreview.visible = true;
      } else {
        this.spherePreview.visible = false;
      }
    } else {
      this.spherePreview.visible = false;
    }
  }

  updateLiveArrowPreview(start, end) {
    if (this.arrowLivePreview) {
      this.scene.remove(this.arrowLivePreview);
      this.arrowLivePreview = null;
    }

    // Lift slightly towards camera so it's always in front of surface
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const offset = camDir.clone().multiplyScalar(-0.03);

    const s = start.clone().add(offset);
    const e = end.clone().add(offset);

    const dir = new THREE.Vector3().subVectors(e, s);
    const len = dir.length();
    if (len < 0.05) return;
    dir.normalize();

    const headLen = Math.min(0.28 * len, 0.45);
    const headWidth = Math.min(0.14 * len, 0.22);

    this.arrowLivePreview = new THREE.ArrowHelper(dir, s, len, 0xf59e0b, headLen, headWidth);
    this.arrowLivePreview.line.material.transparent = true;
    this.arrowLivePreview.line.material.opacity = 0.75;
    this.arrowLivePreview.renderOrder = 10;
    this.scene.add(this.arrowLivePreview);
  }

  onPointerDown(event) {
    if (event.button !== 0) return; // Left click only

    // 1. ARROW TOOL (Click 1 in 2D perspective screen space -> Click 2 on surface pixel)
    if (this.activeTool === 'arrow') {
      const hit = this.getPointInSpace(event);
      if (hit) {
        if (this.arrowStep === 0) {
          // CLICK 1: 2D Screen Origin (outside or in front of object)
          this.arrowStep = 1;
          this.arrowScreenStart = { x: this.mouse.x, y: this.mouse.y };
          this.arrowStartPoint = hit.point.clone();
          this.arrowStartIndicator.position.copy(hit.point);
          this.arrowStartIndicator.visible = true;
          this.notifyToolState('arrow_step_1', 'Paso 1 fijado. Ahora haz clic en el pixel del modelo donde apunta la flecha...');
        } else {
          // CLICK 2: Target pixel on the object
          const surfaceHit = hit.point.clone();

          // Calculate start point in the exact same view-depth plane as the clicked pixel!
          const trueStart = this.projectStartToSurfacePlane(this.arrowScreenStart, surfaceHit) || this.arrowStartPoint;

          // Lift slightly towards camera so it stays 100% in front of the model and never cuts into geometry
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          const offset = camDir.clone().multiplyScalar(-0.035);

          const finalStart = trueStart.clone().add(offset);
          const finalEnd = surfaceHit.clone().add(offset);

          this.drawArrow(finalStart, finalEnd, 0xf59e0b);

          this.arrowStep = 0;
          this.arrowScreenStart = null;
          this.arrowStartPoint = null;
          this.arrowStartIndicator.visible = false;
          if (this.arrowLivePreview) {
            this.scene.remove(this.arrowLivePreview);
            this.arrowLivePreview = null;
          }
          this.notifyToolState('arrow_completed', '¡Flecha 3D creada en el plano del pixel visible!');

          if (this.options.onArrowAdded) {
            this.options.onArrowAdded(this.arrowPositions);
          }
        }
      }
    }

    // 2. SPHERE HOTSPOT TOOL
    else if (this.activeTool === 'sphere') {
      const hit = this.getIntersection(event);
      if (hit) {
        this.setMarker(hit.point.x, hit.point.y, hit.point.z);
        this.spherePreview.visible = false;
        this.notifyToolState('sphere_placed', 'Marcador transparente fijado en el modelo.');
        if (this.options.onMarkerPlaced) {
          this.options.onMarkerPlaced(this.markerPosition);
        }
      }
    }
  }

  onContextMenu(event) {
    event.preventDefault();
    const hit = this.getIntersection(event);
    if (hit) {
      this.setMarker(hit.point.x, hit.point.y, hit.point.z);
      this.notifyToolState('marker_context', 'Marcador transparente colocado.');
      if (this.options.onMarkerPlaced) {
        this.options.onMarkerPlaced(this.markerPosition);
      }
    }
  }

  // Set Active Tool ('none' | 'arrow' | 'sphere' | 'text')
  setActiveTool(toolName) {
    this.activeTool = (this.activeTool === toolName) ? 'none' : toolName;
    this.arrowStep = 0;
    this.arrowStartPoint = null;
    if (this.arrowStartIndicator) this.arrowStartIndicator.visible = false;
    if (this.arrowLivePreview) {
      this.scene.remove(this.arrowLivePreview);
      this.arrowLivePreview = null;
    }
    if (this.spherePreview) this.spherePreview.visible = false;

    this.renderer.domElement.style.cursor = (this.activeTool !== 'none') ? 'crosshair' : 'default';

    if (this.activeTool === 'arrow') {
      this.notifyToolState('arrow_active', '🏹 Flecha: 1er clic fuera del objeto (origen), 2do clic en el objeto (destino).');
    } else if (this.activeTool === 'sphere') {
      this.notifyToolState('sphere_active', '📍 Marcador: Haz clic sobre el modelo para colocar la esfera transparente.');
    } else {
      this.notifyToolState('idle', '');
    }

    return this.activeTool;
  }

  notifyToolState(state, message) {
    if (this.options.onToolStateChange) {
      this.options.onToolStateChange(state, message);
    }
  }

  // Draw 3D Vector Arrow (Full Alpha 1.0)
  drawArrow(start, end, color = 0xf59e0b) {
    const s = start instanceof THREE.Vector3 ? start : new THREE.Vector3(start.x, start.y, start.z);
    const e = end instanceof THREE.Vector3 ? end : new THREE.Vector3(end.x, end.y, end.z);

    const dir = new THREE.Vector3().subVectors(e, s);
    const len = dir.length();
    if (len < 0.001) return;
    dir.normalize();

    const headLen = Math.min(0.28 * len, 0.45);
    const headWidth = Math.min(0.14 * len, 0.22);

    const arrowHelper = new THREE.ArrowHelper(dir, s, len, color, headLen, headWidth);
    arrowHelper.renderOrder = 10;
    this.scene.add(arrowHelper);
    this.arrowHelpers.push(arrowHelper);

    this.arrowPositions.push({
      start: { x: s.x, y: s.y, z: s.z },
      end: { x: e.x, y: e.y, z: e.z }
    });
  }

  setArrows(arrowsList) {
    this.deleteAllArrows();
    if (Array.isArray(arrowsList)) {
      arrowsList.forEach(a => {
        if (a.start && a.end) {
          this.drawArrow(a.start, a.end);
        }
      });
    }
  }

  deleteAllArrows() {
    this.arrowHelpers.forEach(a => this.scene.remove(a));
    this.arrowHelpers = [];
    this.arrowPositions = [];
    this.arrowStep = 0;
    this.arrowStartPoint = null;
    if (this.arrowStartIndicator) this.arrowStartIndicator.visible = false;
    if (this.arrowLivePreview) {
      this.scene.remove(this.arrowLivePreview);
      this.arrowLivePreview = null;
    }
  }

  // Translucent Hotspot Sphere (Single See-Through Red Glass Sphere, >50% Transparency)
  setMarker(x, y, z) {
    if (x === null || y === null || z === null || x === undefined) {
      this.clearMarker();
      return;
    }
    if (!this.markerMesh) {
      const geo = new THREE.SphereGeometry(0.18, 32, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.38, // 62% transparent (more than 50% see-through)
        depthWrite: false, // STL geometry is fully visible through the sphere
        side: THREE.DoubleSide
      });
      this.markerMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.markerMesh);
    }

    this.markerMesh.position.set(x, y, z);
    this.markerMesh.visible = true;
    this.markerPosition = { x, y, z };
  }

  clearMarker() {
    if (this.markerMesh) this.markerMesh.visible = false;
    this.markerPosition = null;
  }

  // Material Switching
  // Material Switching (Mate, Metal, Tanjiro Squares, Rock Granite, Wireframe colors)
  setMaterial(mode) {
    this.currentViewMode = mode;
    const mat = this.materials[mode] || this.materials.plain;
    if (this.loadedObject) {
      this.loadedObject.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) {
            this.ensureTriplanarUVs(child.geometry);
          }
          child.material = mat;
          child.material.needsUpdate = true;
        }
      });
    }
  }

  setTheme(theme = 'light') {
    if (theme === 'light') {
      this.scene.background = new THREE.Color(0xedf2f7);
      if (this.gridHelper) {
        this.scene.remove(this.gridHelper);
        this.gridHelper = new THREE.GridHelper(24, 24, 0xa0aec0, 0xcbd5e1);
        this.gridHelper.position.y = -2.6;
        this.scene.add(this.gridHelper);
      }
    } else {
      this.scene.background = new THREE.Color(0x13151b);
      if (this.gridHelper) {
        this.scene.remove(this.gridHelper);
        this.gridHelper = new THREE.GridHelper(24, 24, 0x2e3545, 0x1a1e27);
        this.gridHelper.position.y = -2.6;
        this.scene.add(this.gridHelper);
      }
    }
  }

  // Rotations (+90° on X, Y, Z) with Auto-Grounding & Camera Re-fit
  rotateObjectX(degrees = 90) {
    if (this.loadedObject) {
      this.loadedObject.rotation.x += (degrees * Math.PI) / 180;
      this.autoCenterPieceAndCamera();
    }
  }

  rotateObjectY(degrees = 90) {
    if (this.loadedObject) {
      this.loadedObject.rotation.y += (degrees * Math.PI) / 180;
      this.autoCenterPieceAndCamera();
    }
  }

  rotateObjectZ(degrees = 90) {
    if (this.loadedObject) {
      this.loadedObject.rotation.z += (degrees * Math.PI) / 180;
      this.autoCenterPieceAndCamera();
    }
  }

  setRotation(x = 0, y = 0, z = 0) {
    if (this.loadedObject) {
      this.loadedObject.rotation.set(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    }
  }

  resetRotation() {
    if (this.loadedObject) {
      this.loadedObject.rotation.set(0, 0, 0);
      this.autoCenterPieceAndCamera();
    }
  }

  // AUTO CENTER & GRAVITY GROUNDING (Fit to View)
  autoCenterPieceAndCamera() {
    if (!this.loadedObject) return;

    // 1. Recalculate true World Bounding Box
    this.loadedObject.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(this.loadedObject);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());

    // 2. Shift object so center is exactly (0,0,0) in X & Z
    this.loadedObject.position.x -= center.x;
    this.loadedObject.position.y -= center.y;
    this.loadedObject.position.z -= center.z;
    this.loadedObject.updateMatrixWorld(true);

    // 3. Compute optimal camera distance according to FOV
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    let cameraZ = Math.abs((maxDim / 2) / Math.tan(fovRad / 2));
    cameraZ *= 1.35; // 35% margin for comfortable framing

    this.camera.position.set(0, maxDim * 0.1, cameraZ);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    if (this.options.onCameraChange) {
      this.options.onCameraChange(this.getCameraState());
    }
  }

  // Load Model (.stl & .obj)
  async loadModel(url, format = 'obj') {
    return new Promise((resolve, reject) => {
      if (this.loadedObject) {
        this.scene.remove(this.loadedObject);
        this.loadedObject = null;
      }
      this.deleteAllArrows();
      this.clearMarker();

      const ext = format.toLowerCase();
      this.currentFileName = url.split('/').pop();

      const onLoaded = (loadedGeometryOrGroup) => {
        let root;

        if (ext === 'stl') {
          const geometry = loadedGeometryOrGroup;
          geometry.center();
          geometry.computeVertexNormals();
          this.ensureTriplanarUVs(geometry);

          const mat = this.materials[this.currentViewMode] || this.materials.plain;
          root = new THREE.Mesh(geometry, mat);
        } else {
          root = loadedGeometryOrGroup;
          root.traverse((child) => {
            if (child.isMesh && child.geometry) {
              child.geometry.computeVertexNormals();
              this.ensureTriplanarUVs(child.geometry);
            }
          });
        }

        root.name = 'loadedObject';
        this.loadedObject = root;
        this.setMaterial(this.currentViewMode);

        // Normalize Scale to 4.8 units standard
        const bbox = new THREE.Box3().setFromObject(root);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        root.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const targetSize = 4.8;
        const scale = targetSize / maxDim;
        root.scale.set(scale, scale, scale);

        this.scene.add(root);

        // Floor Grid position
        this.gridHelper.position.y = -2.6;

        // Auto center view
        this.autoCenterPieceAndCamera();

        resolve({ success: true, scale, maxDim });
      };

      const onError = (err) => {
        console.error('Error loading model:', err);
        reject(err);
      };

      if (ext === 'stl') {
        const loader = new STLLoader();
        loader.load(url, onLoaded, undefined, onError);
      } else {
        const loader = new OBJLoader();
        loader.load(url, onLoaded, undefined, onError);
      }
    });
  }

  // Camera Fly Transition
  flyTo(camPos, targetPos = { x: 0, y: 0, z: 0 }, rot = null) {
    this.camStart.copy(this.camera.position);
    this.camEnd.set(camPos.x, camPos.y, camPos.z);
    this.targetStart.copy(this.controls.target);
    this.targetEnd.set(targetPos.x, targetPos.y, targetPos.z);
    if (rot && this.loadedObject) {
      this.loadedObject.rotation.set(Number(rot.x) || 0, Number(rot.y) || 0, Number(rot.z) || 0);
    }
    this.transProgress = 0;
    this.isTransitioning = true;
  }

  getCameraState() {
    const rot = this.loadedObject ? this.loadedObject.rotation : { x: 0, y: 0, z: 0 };
    return {
      camera: {
        x: Number(this.camera.position.x.toFixed(2)),
        y: Number(this.camera.position.y.toFixed(2)),
        z: Number(this.camera.position.z.toFixed(2))
      },
      target: {
        x: Number(this.controls.target.x.toFixed(2)),
        y: Number(this.controls.target.y.toFixed(2)),
        z: Number(this.controls.target.z.toFixed(2))
      },
      rotation: {
        x: Number(rot.x.toFixed(3)),
        y: Number(rot.y.toFixed(3)),
        z: Number(rot.z.toFixed(3))
      }
    };
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.isTransitioning) {
      this.transProgress += 0.04;
      if (this.transProgress >= 1.0) {
        this.transProgress = 1.0;
        this.isTransitioning = false;
      }
      const t = this.transProgress;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      this.camera.position.lerpVectors(this.camStart, this.camEnd, ease);
      this.controls.target.lerpVectors(this.targetStart, this.targetEnd, ease);
    }

    // Subtle gentle pulse for translucent marker sphere
    if (this.markerMesh && this.markerMesh.visible) {
      const scale = 1.0 + 0.08 * Math.sin(Date.now() * 0.005);
      this.markerMesh.scale.set(scale, scale, scale);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
