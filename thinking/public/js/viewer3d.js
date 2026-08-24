/**
 * GhostPPT 3D WebGL Viewer Engine using Three.js
 */

class Viewer3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.currentModel = null;
    this.hotspots = [];
    this.hotspotElements = [];
    
    // Animation / Tweening state
    this.isTransitioning = false;
    this.transitionStart = 0;
    this.transitionDuration = 1200; // ms
    this.camStartPos = new THREE.Vector3();
    this.camEndPos = new THREE.Vector3();
    this.targetStartPos = new THREE.Vector3();
    this.targetEndPos = new THREE.Vector3();

    // Hotspot Placement Mode
    this.isPickingHotspot = false;
    this.onHotspotPicked = null;

    // Raycaster for surface picking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.init();
  }

  init() {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080c16);
    this.scene.fog = new THREE.FogExp2(0x080c16, 0.025);

    // 2. Camera setup
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 5, 14);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.renderer.outputColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    this.container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 50;
    this.controls.minDistance = 1.5;
    this.controls.target.set(0, 0, 0);

    // 5. Lighting Setup
    this.setupLighting();

    // 6. Subtle Floor Grid
    this.setupEnvironment();

    // 7. Event Listeners
    window.addEventListener('resize', () => this.onWindowResize());
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    // 8. Start Render Loop
    this.animate();
  }

  setupLighting() {
    // Ambient soft blue light
    const ambientLight = new THREE.AmbientLight(0xdce7ff, 0.8);
    this.scene.add(ambientLight);

    // Key Directional Light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(10, 15, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    this.scene.add(keyLight);

    // Fill Light (Cyan tone for high tech aesthetic)
    const fillLight = new THREE.DirectionalLight(0x06b6d4, 0.9);
    fillLight.position.set(-10, -5, -8);
    this.scene.add(fillLight);

    // Rim Light (Indigo accent)
    const rimLight = new THREE.DirectionalLight(0x818cf8, 1.4);
    rimLight.position.set(0, 12, -10);
    this.scene.add(rimLight);
  }

  setupEnvironment() {
    // Elegant grid helper
    const grid = new THREE.GridHelper(30, 30, 0x312e81, 0x1e293b);
    grid.position.y = -3;
    this.scene.add(grid);
  }

  loadModel(modelFilename, modelFormat) {
    this.clearModel();

    if (modelFilename.startsWith('demo_heart')) {
      this.createDemoHeartModel();
      return;
    } else if (modelFilename.startsWith('demo_gear')) {
      this.createDemoGearModel();
      return;
    }

    const url = `/uploads/${modelFilename}`;

    if (modelFormat === 'obj' && typeof THREE.OBJLoader !== 'undefined') {
      const loader = new THREE.OBJLoader();
      loader.load(
        url,
        (obj) => {
          this.setupLoadedMesh(obj);
        },
        undefined,
        (err) => {
          console.warn('Error al cargar OBJ, usando modelo de respaldo:', err);
          this.createDemoHeartModel();
        }
      );
    } else if (modelFormat === 'stl' && typeof THREE.STLLoader !== 'undefined') {
      const loader = new THREE.STLLoader();
      loader.load(
        url,
        (geometry) => {
          const material = new THREE.MeshPhysicalMaterial({
            color: 0x6366f1,
            metalness: 0.2,
            roughness: 0.3,
            clearcoat: 0.5,
            clearcoatRoughness: 0.1
          });
          const mesh = new THREE.Mesh(geometry, material);
          this.setupLoadedMesh(mesh);
        },
        undefined,
        (err) => {
          console.warn('Error al cargar STL, usando modelo de respaldo:', err);
          this.createDemoGearModel();
        }
      );
    } else {
      // Fallback
      this.createDemoHeartModel();
    }
  }

  setupLoadedMesh(object3D) {
    // Center and auto-scale model to fit unit view
    const box = new THREE.Box3().setFromObject(object3D);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 5 / (maxDim || 1);
    object3D.scale.set(scale, scale, scale);

    const center = new THREE.Vector3();
    box.getCenter(center);
    object3D.position.sub(center.multiplyScalar(scale));

    object3D.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (!child.material || child.material.isMeshBasicMaterial) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x818cf8,
            roughness: 0.35,
            metalness: 0.2
          });
        }
      }
    });

    this.currentModel = object3D;
    this.scene.add(this.currentModel);
  }

  // Procedural anatomical 3D heart model demo
  createDemoHeartModel() {
    const group = new THREE.Group();

    // Heart main muscular body
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xef4444,
      roughness: 0.4,
      metalness: 0.1,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2
    });
    const bodyGeo = new THREE.SphereGeometry(2, 32, 32);
    bodyGeo.scale(1, 1.4, 0.9);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, 0);
    group.add(body);

    // Left ventricle highlight
    const ventMat = new THREE.MeshPhysicalMaterial({
      color: 0xd97706,
      roughness: 0.35,
      clearcoat: 0.5
    });
    const ventGeo = new THREE.SphereGeometry(1.2, 24, 24);
    ventGeo.scale(0.8, 1.2, 0.7);
    const ventricle = new THREE.Mesh(ventGeo, ventMat);
    ventricle.position.set(1, -0.6, 0.8);
    group.add(ventricle);

    // Aortic Arch (curved tube)
    const aortaMat = new THREE.MeshPhysicalMaterial({
      color: 0xdc2626,
      metalness: 0.3,
      roughness: 0.2
    });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(-0.5, 3.2, 0.2),
      new THREE.Vector3(-1.8, 3.4, 0),
      new THREE.Vector3(-2.2, 1.8, -0.2)
    ]);
    const aortaGeo = new THREE.TubeGeometry(curve, 30, 0.45, 16, false);
    const aorta = new THREE.Mesh(aortaGeo, aortaMat);
    group.add(aorta);

    // Vena Cava (Blue venous blood vessel)
    const venaMat = new THREE.MeshPhysicalMaterial({
      color: 0x2563eb,
      metalness: 0.2,
      roughness: 0.3
    });
    const venaGeo = new THREE.CylinderGeometry(0.4, 0.4, 3, 16);
    const vena = new THREE.Mesh(venaGeo, venaMat);
    vena.position.set(1.6, 1.8, -0.4);
    vena.rotation.z = -0.2;
    group.add(vena);

    // Pulmonary Artery
    const pulmMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      metalness: 0.2,
      roughness: 0.3
    });
    const pulmGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.2, 16);
    const pulm = new THREE.Mesh(pulmGeo, pulmMat);
    pulm.position.set(-0.6, 1.6, 0.9);
    pulm.rotation.x = 0.5;
    group.add(pulm);

    this.currentModel = group;
    this.scene.add(this.currentModel);
  }

  // Procedural mechanical gear / engineering model demo
  createDemoGearModel() {
    const group = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x6366f1,
      metalness: 0.8,
      roughness: 0.2,
      clearcoat: 0.8
    });

    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.8, 32), mat);
    group.add(cylinder);

    // Gear teeth
    const numTeeth = 12;
    for (let i = 0; i < numTeeth; i++) {
      const angle = (i / numTeeth) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.8), mat);
      tooth.position.set(Math.cos(angle) * 2.7, 0, Math.sin(angle) * 2.7);
      tooth.rotation.y = -angle;
      group.add(tooth);
    }

    // Inner shaft
    const shaftMat = new THREE.MeshPhysicalMaterial({
      color: 0x06b6d4,
      metalness: 0.9,
      roughness: 0.1
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2, 24), shaftMat);
    group.add(shaft);

    this.currentModel = group;
    this.scene.add(this.currentModel);
  }

  clearModel() {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel = null;
    }
    this.clearHotspots();
  }

  // Smooth camera transition to a specific slide viewpoint
  flyTo(cameraPos, targetPos, duration = 1200) {
    this.camStartPos.copy(this.camera.position);
    this.camEndPos.set(cameraPos.x, cameraPos.y, cameraPos.z);

    this.targetStartPos.copy(this.controls.target);
    this.targetEndPos.set(targetPos.x, targetPos.y, targetPos.z);

    this.transitionDuration = duration;
    this.transitionStart = performance.now();
    this.isTransitioning = true;
  }

  // Hotspots management
  setHotspots(hotspotDataList) {
    this.clearHotspots();
    this.hotspots = hotspotDataList || [];

    const overlay = this.container;

    this.hotspots.forEach((hs, idx) => {
      if (hs.hotspot_x === null || hs.hotspot_x === undefined) return;

      const marker = document.createElement('div');
      marker.className = 'hotspot-marker';
      marker.innerHTML = `
        <span style="font-size:0.75rem; font-weight:800; color:#fff;">${idx + 1}</span>
        <div class="hotspot-tooltip">${hs.hotspot_label || hs.title}</div>
      `;

      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.onHotspotClicked === 'function') {
          window.onHotspotClicked(hs, idx);
        }
      });

      overlay.appendChild(marker);
      this.hotspotElements.push({
        element: marker,
        pos3D: new THREE.Vector3(hs.hotspot_x, hs.hotspot_y, hs.hotspot_z)
      });
    });
  }

  clearHotspots() {
    this.hotspotElements.forEach((item) => {
      if (item.element && item.element.parentNode) {
        item.element.parentNode.removeChild(item.element);
      }
    });
    this.hotspotElements = [];
    this.hotspots = [];
  }

  updateHotspotPositions() {
    if (!this.camera || this.hotspotElements.length === 0) return;

    const widthHalf = this.container.clientWidth / 2;
    const heightHalf = this.container.clientHeight / 2;

    this.hotspotElements.forEach((item) => {
      const pos = item.pos3D.clone();
      pos.project(this.camera);

      // Check if behind camera
      if (pos.z > 1) {
        item.element.style.display = 'none';
        return;
      }

      item.element.style.display = 'flex';
      const x = pos.x * widthHalf + widthHalf;
      const y = -(pos.y * heightHalf) + heightHalf;

      item.element.style.left = `${x}px`;
      item.element.style.top = `${y}px`;
    });
  }

  // Surface raycasting for placing hotspots
  enableHotspotPicking(callback) {
    this.isPickingHotspot = true;
    this.onHotspotPicked = callback;
    document.getElementById('hotspot-banner').style.display = 'block';
  }

  disableHotspotPicking() {
    this.isPickingHotspot = false;
    this.onHotspotPicked = null;
    const banner = document.getElementById('hotspot-banner');
    if (banner) banner.style.display = 'none';
  }

  onPointerDown(event) {
    if (!this.isPickingHotspot || !this.currentModel) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.currentModel.children, true);

    if (intersects.length > 0) {
      const hitPoint = intersects[0].point;
      if (this.onHotspotPicked) {
        this.onHotspotPicked(hitPoint);
      }
      this.disableHotspotPicking();
    }
  }

  onWindowResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Camera animation tweening
    if (this.isTransitioning) {
      const now = performance.now();
      const elapsed = now - this.transitionStart;
      const progress = Math.min(elapsed / this.transitionDuration, 1);

      // Smooth cubic ease-in-out
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(this.camStartPos, this.camEndPos, ease);
      this.controls.target.lerpVectors(this.targetStartPos, this.targetEndPos, ease);

      if (progress >= 1) {
        this.isTransitioning = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateHotspotPositions();
  }

  getCurrentCameraState() {
    return {
      camera: {
        x: parseFloat(this.camera.position.x.toFixed(3)),
        y: parseFloat(this.camera.position.y.toFixed(3)),
        z: parseFloat(this.camera.position.z.toFixed(3))
      },
      target: {
        x: parseFloat(this.controls.target.x.toFixed(3)),
        y: parseFloat(this.controls.target.y.toFixed(3)),
        z: parseFloat(this.controls.target.z.toFixed(3))
      }
    };
  }
}

window.Viewer3D = Viewer3D;
