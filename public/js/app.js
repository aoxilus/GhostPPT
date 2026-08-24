/**
 * app.js — Studio 3D Controller
 * Integrates Right Floating Tool Palette (Skeuomorphic Alpha State Indicators),
 * Draggable/Resizable Auto-Contrast Text Cards,
 * Auto-Centering, +90° Rotations, and SQLite Persistence.
 */

import { Viewer3D } from './viewer3d.js';

class StudioApp {
  constructor() {
    this.editorViewer = null;
    this.presViewer = null;

    this.models = [];
    this.tours = [];
    this.currentModel = '';
    this.currentTourId = null;
    this.currentSlides = [];
    this.activeSlideIdx = 0;

    // Draggable card state
    this.isDraggingCard = false;
    this.cardDragOffset = { x: 0, y: 0 };
    this.currentTheme = localStorage.getItem('ghostppt_theme') || 'light';
    this.init();
  }

  async init() {
    // 1. Initialize Studio Editor Viewer
    this.editorViewer = new Viewer3D('studio-canvas-container', {
      onCameraChange: (coords) => this.onCamUpdate(coords),
      onToolStateChange: (state, msg) => this.onToolStateUpdate(state, msg)
    });

    // Apply active theme (Light by default)
    this.applyTheme(this.currentTheme);

    // 2. Setup Events
    this.bindEvents();
    this.setupDraggableTextCard();

    // 3. Load Models and Tours
    await this.loadModels();
    await this.loadTours();

    // 4. Default Model in Editor
    if (this.models.length > 0) {
      await this.selectModel(this.models[0].filename);
    }
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(this.currentTheme);
  }

  applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem('ghostppt_theme', theme);
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.textContent = theme === 'light' ? '☀️ Claro' : '🌙 Oscuro';
    }
    if (this.editorViewer) this.editorViewer.setTheme(theme);
    if (this.presViewer) this.presViewer.setTheme(theme);
  }

  // ----------------------------------------------------
  // DOM EVENTS & TOOL PALETTE BINDINGS
  // ----------------------------------------------------
  bindEvents() {
    // Theme Toggle Button
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Main Workspace Tabs
    document.querySelectorAll('.view-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchStage(tab);
      });
    });

    // Model Selector in Topbar
    const selectModel = document.getElementById('select-active-model');
    selectModel.addEventListener('change', (e) => {
      if (e.target.value) {
        this.selectModel(e.target.value);
      }
    });

    // Quick Auto Center Topbar Button & Palette Button
    document.getElementById('btn-quick-autocenter').addEventListener('click', () => {
      this.editorViewer.autoCenterPieceAndCamera();
      this.showToast('🎯 Pieza auto-centrada y cámara encuadrada');
    });
    document.getElementById('btn-palette-autocenter').addEventListener('click', () => {
      this.editorViewer.autoCenterPieceAndCamera();
      this.showToast('🎯 Pieza auto-centrada y cámara encuadrada');
    });

    // 90° Axis Rotations
    document.getElementById('btn-rot-x').addEventListener('click', () => {
      this.editorViewer.rotateObjectX(90);
    });
    document.getElementById('btn-rot-y').addEventListener('click', () => {
      this.editorViewer.rotateObjectY(90);
    });
    document.getElementById('btn-rot-z').addEventListener('click', () => {
      this.editorViewer.rotateObjectZ(90);
    });

    // Materials Pills
    document.querySelectorAll('.mat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.editorViewer.setMaterial(btn.dataset.mat);
      });
    });

    // 3D Arrow Tool (Skeuomorphic Alpha State: OFF -> 50% -> 75% -> 100%)
    const arrowBtn = document.getElementById('tool-btn-arrow');
    arrowBtn.addEventListener('click', () => {
      const mode = this.editorViewer.setActiveTool('arrow');
      const active = (mode === 'arrow');
      arrowBtn.classList.toggle('active', active);
      document.getElementById('tool-btn-sphere').classList.remove('active');
      document.getElementById('sphere-alpha-badge').textContent = 'OFF';

      const badge = document.getElementById('arrow-alpha-badge');
      badge.textContent = active ? '50%' : 'OFF';
    });

    // Sphere Hotspot Tool (OFF -> 50% -> 100%)
    const sphereBtn = document.getElementById('tool-btn-sphere');
    sphereBtn.addEventListener('click', () => {
      const mode = this.editorViewer.setActiveTool('sphere');
      const active = (mode === 'sphere');
      sphereBtn.classList.toggle('active', active);
      document.getElementById('tool-btn-arrow').classList.remove('active');
      document.getElementById('arrow-alpha-badge').textContent = 'OFF';

      const badge = document.getElementById('sphere-alpha-badge');
      badge.textContent = active ? '50%' : 'OFF';
    });

    // Text Card Toggle Tool
    const textCardBtn = document.getElementById('tool-btn-text');
    textCardBtn.addEventListener('click', () => {
      const card = document.getElementById('text-card-overlay');
      card.classList.toggle('hidden');
      textCardBtn.classList.toggle('active', !card.classList.contains('hidden'));
    });

    // Delete / Close Text Card
    document.getElementById('btn-close-text-card').addEventListener('click', () => {
      document.getElementById('text-annotation-content').value = '';
      document.getElementById('text-card-overlay').classList.add('hidden');
      document.getElementById('tool-btn-text').classList.remove('active');
      this.showToast('🗑️ Anotación de texto eliminada');
    });

    // Contrast Toggle on Text Card
    document.getElementById('btn-contrast-toggle').addEventListener('click', () => {
      const card = document.getElementById('text-card-overlay');
      card.classList.toggle('light-mode');
    });

    // Clean Slide (Deletes all annotations, arrows, markers, and text notes without moving the model)
    document.getElementById('btn-clear-arrows').addEventListener('click', () => {
      this.editorViewer.deleteAllArrows();
      this.editorViewer.clearMarker();
      this.editorViewer.setActiveTool('none');

      document.getElementById('tool-btn-arrow').classList.remove('active');
      document.getElementById('arrow-alpha-badge').textContent = 'OFF';
      document.getElementById('tool-btn-sphere').classList.remove('active');
      document.getElementById('sphere-alpha-badge').textContent = 'OFF';

      const textInput = document.getElementById('text-annotation-content');
      if (textInput) textInput.value = '';
      const textCard = document.getElementById('text-card-overlay');
      if (textCard) textCard.classList.add('hidden');
      document.getElementById('tool-btn-text').classList.remove('active');

      const titleInput = document.getElementById('input-new-slide-title');
      if (titleInput) titleInput.value = '';

      this.showToast('🧹 Slide limpiado (flechas, marcadores y notas eliminados)');
    });

    // Save Slide
    document.getElementById('btn-save-current-slide').addEventListener('click', () => {
      this.handleSaveSlide();
    });

    // Delete Active Slide Button
    document.getElementById('btn-delete-active-slide').addEventListener('click', async () => {
      if (!this.currentSlides || this.currentSlides.length === 0) {
        this.showToast('No hay slides en esta presentación');
        return;
      }
      const activeSlide = this.currentSlides[this.activeSlideIdx];
      if (!activeSlide) return;

      if (confirm(`¿Eliminar slide "${activeSlide.title}"?`)) {
        try {
          const res = await fetch(`/api/presentations/${this.currentTourId}/slides/${activeSlide.id}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            this.currentSlides.splice(this.activeSlideIdx, 1);
            this.activeSlideIdx = Math.max(0, this.activeSlideIdx - 1);
            this.renderTimelineSlides();
            this.showToast('🗑️ Slide eliminado');
            await this.loadTours();
          }
        } catch (err) {
          alert('Error al eliminar slide: ' + err.message);
        }
      }
    });

    // Rename Presentation Title
    document.getElementById('btn-rename-pres').addEventListener('click', async () => {
      if (!this.currentTourId) {
        const title = prompt('Nombre para la nueva presentación:', `Presentación de ${this.currentModel}`);
        if (title && title.trim()) {
          const res = await fetch('/api/presentations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.trim(), existing_filename: this.currentModel })
          });
          const data = await res.json();
          this.currentTourId = data.id;
          await this.loadTours();
          document.getElementById('display-pres-title').textContent = title.trim();
          this.showToast(`✏️ Presentación creada: "${title.trim()}"`);
        }
        return;
      }

      const currentTitle = document.getElementById('display-pres-title').textContent;
      const newTitle = prompt('Editar nombre de la presentación:', currentTitle);
      if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
        const updatedTitle = newTitle.trim();
        try {
          const res = await fetch(`/api/presentations/${this.currentTourId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: updatedTitle })
          });
          if (res.ok) {
            document.getElementById('display-pres-title').textContent = updatedTitle;
            await this.loadTours();
            this.showToast(`✏️ Presentación renombrada a "${updatedTitle}"`);
          }
        } catch (err) {
          alert('Error al renombrar: ' + err.message);
        }
      }
    });

    // Share & Public QR Code Modal
    const openShareModal = () => {
      if (!this.currentTourId) {
        this.showToast('⚠️ Guarda un slide primero para compartir esta presentación');
        return;
      }
      const publicUrl = `${window.location.origin}/view.html?id=${this.currentTourId}`;
      document.getElementById('share-public-url').value = publicUrl;
      document.getElementById('btn-open-public-tab').href = publicUrl;

      const qrContainer = document.getElementById('qrcode-container');
      qrContainer.innerHTML = '';
      if (window.QRCode) {
        new QRCode(qrContainer, {
          text: publicUrl,
          width: 170,
          height: 170,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      }
      document.getElementById('modal-share-qr').classList.remove('hidden');
    };

    document.getElementById('btn-share-pres').addEventListener('click', openShareModal);
    const shareViewBtn = document.getElementById('btn-share-pres-view');
    if (shareViewBtn) shareViewBtn.addEventListener('click', openShareModal);

    document.getElementById('btn-close-share-modal').addEventListener('click', () => {
      document.getElementById('modal-share-qr').classList.add('hidden');
    });

    document.getElementById('btn-copy-share-url').addEventListener('click', async () => {
      const input = document.getElementById('share-public-url');
      try {
        await navigator.clipboard.writeText(input.value);
        this.showToast('📋 ¡Enlace público copiado al portapapeles!');
      } catch (err) {
        input.select();
        document.execCommand('copy');
        this.showToast('📋 ¡Enlace público copiado!');
      }
    });

    // Presentation Switch & Navigation
    const presSelect = document.getElementById('select-presentation-tour');
    presSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        this.loadPresentationTour(e.target.value);
      }
    });

    document.getElementById('pres-prev').addEventListener('click', () => this.presPrev());
    document.getElementById('pres-next').addEventListener('click', () => this.presNext());

    // Upload Dropzone
    const dropzone = document.getElementById('dropzone-trigger');
    const fileInput = document.getElementById('model-file-upload-input');
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleUploadFile(e.target.files[0]);
      }
    });
  }

  // ----------------------------------------------------
  // SKEUOMORPHIC TOOL STATE FEEDBACK
  // ----------------------------------------------------
  onToolStateUpdate(state, message) {
    const arrowBadge = document.getElementById('arrow-alpha-badge');
    const sphereBadge = document.getElementById('sphere-alpha-badge');

    if (state === 'arrow_step_1') {
      arrowBadge.textContent = '75%';
      this.showToast(message);
    } else if (state === 'arrow_completed') {
      arrowBadge.textContent = '100%';
      this.showToast(message);
      setTimeout(() => {
        if (this.editorViewer.activeTool === 'arrow') {
          arrowBadge.textContent = '50%';
        }
      }, 1200);
    } else if (state === 'sphere_placed') {
      sphereBadge.textContent = '100%';
      this.showToast(message);
      setTimeout(() => {
        if (this.editorViewer.activeTool === 'sphere') {
          sphereBadge.textContent = '50%';
        }
      }, 1200);
    } else if (message) {
      this.showToast(message);
    } else {
      this.hideToast();
    }
  }

  showToast(msg, duration = 3000) {
    const toast = document.getElementById('tool-status-toast');
    const txt = document.getElementById('tool-status-message');
    txt.textContent = msg;
    toast.classList.remove('hidden');

    clearTimeout(this.toastTimer);
    if (duration > 0) {
      this.toastTimer = setTimeout(() => this.hideToast(), duration);
    }
  }

  hideToast() {
    document.getElementById('tool-status-toast').classList.add('hidden');
  }

  // ----------------------------------------------------
  // DRAGGABLE & RESIZABLE TEXT CARD
  // ----------------------------------------------------
  setupDraggableTextCard() {
    const card = document.getElementById('text-card-overlay');
    const handle = document.getElementById('text-card-drag-handle');

    handle.addEventListener('pointerdown', (e) => {
      this.isDraggingCard = true;
      this.cardDragOffset.x = e.clientX - card.offsetLeft;
      this.cardDragOffset.y = e.clientY - card.offsetTop;
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (this.isDraggingCard) {
        const x = Math.max(10, e.clientX - this.cardDragOffset.x);
        const y = Math.max(10, e.clientY - this.cardDragOffset.y);
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
      }
    });

    handle.addEventListener('pointerup', (e) => {
      this.isDraggingCard = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
    });
  }

  // ----------------------------------------------------
  // STAGE VIEW SWITCHER
  // ----------------------------------------------------
  switchStage(stage) {
    document.querySelectorAll('.view-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === stage);
    });

    document.querySelectorAll('.stage-view').forEach(s => {
      s.classList.add('hidden');
      s.classList.remove('active');
    });

    const activeStage = document.getElementById(`stage-${stage}`);
    if (activeStage) {
      activeStage.classList.remove('hidden');
      activeStage.classList.add('active');
    }

    if (stage === 'editor') {
      setTimeout(() => this.editorViewer.onResize(), 30);
    } else if (stage === 'presentation') {
      this.initPresentationStage();
    } else if (stage === 'models') {
      this.renderModelsGrid();
    }
  }

  onCamUpdate(coords) {
    const el = document.getElementById('hud-cam-display');
    if (el && coords && coords.camera) {
      el.textContent = `CAM: X:${coords.camera.x} Y:${coords.camera.y} Z:${coords.camera.z}`;
    }
  }

  // ----------------------------------------------------
  // MODEL MANAGEMENT & SLIDES
  // ----------------------------------------------------
  async loadModels() {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      this.models = data.models || [];

      const select = document.getElementById('select-active-model');
      select.innerHTML = '';
      this.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.filename;
        opt.textContent = m.filename;
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('Error loading models:', err);
    }
  }

  async selectModel(filename) {
    this.currentModel = filename;
    document.getElementById('select-active-model').value = filename;

    const ext = filename.split('.').pop().toLowerCase();
    this.showToast(`Cargando ${filename}...`, 0);

    try {
      await this.editorViewer.loadModel(`/uploads/${filename}`, ext);
      this.hideToast();
      await this.loadSlidesForModel(filename);
    } catch (err) {
      this.showToast(`Error al cargar: ${err.message}`, 4000);
    }
  }

  async loadSlidesForModel(filename) {
    let tour = this.tours.find(t => t.model_filename === filename);
    if (!tour && this.tours.length > 0) tour = this.tours[0];
    this.currentTourId = tour ? tour.id : null;

    const titleEl = document.getElementById('display-pres-title');
    if (tour) {
      if (titleEl) titleEl.textContent = tour.title;
      const res = await fetch(`/api/presentations/${tour.id}`);
      const data = await res.json();
      this.currentSlides = data.slides || [];
    } else {
      if (titleEl) titleEl.textContent = `Presentación de ${filename}`;
      this.currentSlides = [];
    }
    this.renderTimelineSlides();
  }

  renderTimelineSlides() {
    const container = document.getElementById('timeline-slides-container');
    container.innerHTML = '';

    this.currentSlides.forEach((s, idx) => {
      const pill = document.createElement('div');
      pill.className = `timeline-slide-pill ${idx === this.activeSlideIdx ? 'active' : ''}`;
      pill.title = 'Clic para ver este slide • Doble clic para cambiar nombre';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'pill-title-text';
      titleSpan.textContent = `${idx + 1}. ${s.title}`;
      pill.appendChild(titleSpan);

      // Delete button on hover
      const delBtn = document.createElement('button');
      delBtn.className = 'pill-delete-btn';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Eliminar este slide';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`¿Eliminar slide "${s.title}"?`)) {
          try {
            const res = await fetch(`/api/presentations/${this.currentTourId}/slides/${s.id}`, {
              method: 'DELETE'
            });
            if (res.ok) {
              this.currentSlides.splice(idx, 1);
              this.activeSlideIdx = Math.max(0, idx - 1);
              this.renderTimelineSlides();
              this.showToast('🗑️ Slide eliminado');
              await this.loadTours();
            }
          } catch (err) {
            alert('Error al eliminar: ' + err.message);
          }
        }
      });
      pill.appendChild(delBtn);

      // Single Click: Load that specific slide's exact elements
      pill.addEventListener('click', () => {
        this.activeSlideIdx = idx;
        document.querySelectorAll('.timeline-slide-pill').forEach((p, i) => p.classList.toggle('active', i === idx));

        // Restore camera, rotation, material, arrows, and marker
        this.editorViewer.flyTo(
          { x: s.camera_x, y: s.camera_y, z: s.camera_z },
          { x: s.target_x || 0, y: s.target_y || 0, z: s.target_z || 0 },
          { x: s.rot_x || 0, y: s.rot_y || 0, z: s.rot_z || 0 }
        );

        this.editorViewer.setMaterial(s.view_mode || 'plain');
        document.querySelectorAll('.mat-pill').forEach(b => {
          b.classList.toggle('active', b.dataset.mat === (s.view_mode || 'plain'));
        });

        this.editorViewer.setArrows(s.arrows || []);
        if (s.marker_x !== null && s.marker_x !== undefined) {
          this.editorViewer.setMarker(s.marker_x, s.marker_y, s.marker_z);
        } else {
          this.editorViewer.clearMarker();
        }

        // Restore Text Card if present in this slide
        const textCard = document.getElementById('text-card-overlay');
        const textInput = document.getElementById('text-annotation-content');
        if (s.description && s.description !== 'Vista guardada') {
          textInput.value = s.description;
          textCard.classList.remove('hidden');
          document.getElementById('tool-btn-text').classList.add('active');
        } else {
          textInput.value = '';
          textCard.classList.add('hidden');
          document.getElementById('tool-btn-text').classList.remove('active');
        }
      });

      // Double Click: Rename slide title
      pill.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        const newName = prompt('Editar nombre del slide:', s.title);
        if (newName && newName.trim() && newName.trim() !== s.title) {
          const updatedTitle = newName.trim();
          try {
            const res = await fetch(`/api/presentations/${this.currentTourId}/slides/${s.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: updatedTitle })
            });
            if (res.ok) {
              s.title = updatedTitle;
              this.renderTimelineSlides();
              this.showToast(`✏️ Slide renombrado a "${updatedTitle}"`);
              await this.loadTours();
            }
          } catch (err) {
            alert('Error al renombrar: ' + err.message);
          }
        }
      });

      container.appendChild(pill);
    });
  }

  async handleSaveSlide() {
    const titleInput = document.getElementById('input-new-slide-title');
    const title = titleInput.value.trim() || `Slide ${this.currentSlides.length + 1}`;

    const textCardContent = document.getElementById('text-annotation-content').value.trim();
    const description = textCardContent || 'Vista guardada';

    // Auto-create tour for model if needed
    if (!this.currentTourId) {
      const createRes = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Tour de ${this.currentModel}`,
          existing_filename: this.currentModel
        })
      });
      const createData = await createRes.json();
      this.currentTourId = createData.id;
      await this.loadTours();
    }

    const camState = this.editorViewer.getCameraState();
    const payload = {
      title,
      description,
      camera_x: camState.camera.x,
      camera_y: camState.camera.y,
      camera_z: camState.camera.z,
      target_x: camState.target.x,
      target_y: camState.target.y,
      target_z: camState.target.z,
      marker_x: this.editorViewer.markerPosition ? this.editorViewer.markerPosition.x : null,
      marker_y: this.editorViewer.markerPosition ? this.editorViewer.markerPosition.y : null,
      marker_z: this.editorViewer.markerPosition ? this.editorViewer.markerPosition.z : null,
      view_mode: this.editorViewer.currentViewMode,
      arrows: this.editorViewer.arrowPositions,
      rot_x: camState.rotation.x,
      rot_y: camState.rotation.y,
      rot_z: camState.rotation.z
    };

    try {
      const res = await fetch(`/api/presentations/${this.currentTourId}/slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.slide) {
        this.currentSlides.push(data.slide);
        this.activeSlideIdx = this.currentSlides.length - 1;
        this.renderTimelineSlides();
        titleInput.value = '';

        const shouldCopy = document.getElementById('chk-copy-elements').checked;
        if (!shouldCopy) {
          // Clear annotations for clean new slide (keeping model position & cam intact)
          this.editorViewer.deleteAllArrows();
          this.editorViewer.clearMarker();
          const textInput = document.getElementById('text-annotation-content');
          if (textInput) textInput.value = '';
          const textCard = document.getElementById('text-card-overlay');
          if (textCard) textCard.classList.add('hidden');
          document.getElementById('tool-btn-text').classList.remove('active');

          this.showToast('✅ Nuevo Slide guardado. Listo para nuevas anotaciones.');
        } else {
          this.showToast('✅ Slide guardado (elementos copiados para el siguiente).');
        }

        await this.loadTours();
      }
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    }
  }

  // ----------------------------------------------------
  // PRESENTATION STAGE
  // ----------------------------------------------------
  async loadTours() {
    try {
      const res = await fetch('/api/presentations');
      const data = await res.json();
      this.tours = data.presentations || [];

      const select = document.getElementById('select-presentation-tour');
      select.innerHTML = '';
      this.tours.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.title} (${t.slide_count} slides)`;
        select.appendChild(opt);
      });
    } catch (err) {
      console.error(err);
    }
  }

  async initPresentationStage() {
    if (!this.presViewer) {
      this.presViewer = new Viewer3D('presentation-canvas-box');
    }
    setTimeout(() => this.presViewer.onResize(), 30);

    const tourId = document.getElementById('select-presentation-tour').value || (this.tours[0] ? this.tours[0].id : null);
    if (tourId) {
      await this.loadPresentationTour(tourId);
    }
  }

  async loadPresentationTour(tourId) {
    try {
      const res = await fetch(`/api/presentations/${tourId}`);
      const data = await res.json();
      const tour = data.presentation;
      this.presTourSlides = data.slides || [];
      this.presSlideIdx = 0;

      // Load 3D model
      await this.presViewer.loadModel(`/uploads/${tour.model_filename}`, tour.model_format);

      // Render bottom strip
      this.renderPresStrip();

      if (this.presTourSlides.length > 0) {
        this.presGoTo(0);
      }
    } catch (err) {
      console.error(err);
    }
  }

  renderPresStrip() {
    const strip = document.getElementById('pres-slides-strip');
    strip.innerHTML = '';

    this.presTourSlides.forEach((s, idx) => {
      const pill = document.createElement('button');
      pill.className = `timeline-slide-pill ${idx === this.presSlideIdx ? 'active' : ''}`;
      pill.textContent = `${idx + 1}. ${s.title}`;
      pill.addEventListener('click', () => this.presGoTo(idx));
      strip.appendChild(pill);
    });
  }

  presGoTo(idx) {
    if (!this.presTourSlides || idx < 0 || idx >= this.presTourSlides.length) return;
    this.presSlideIdx = idx;
    const slide = this.presTourSlides[idx];

    // Fly camera and restore piece rotation
    this.presViewer.flyTo(
      { x: slide.camera_x, y: slide.camera_y, z: slide.camera_z },
      { x: slide.target_x || 0, y: slide.target_y || 0, z: slide.target_z || 0 },
      { x: slide.rot_x || 0, y: slide.rot_y || 0, z: slide.rot_z || 0 }
    );

    this.presViewer.setMaterial(slide.view_mode || 'plain');
    this.presViewer.setArrows(slide.arrows || []);
    if (slide.marker_x !== null && slide.marker_x !== undefined) {
      this.presViewer.setMarker(slide.marker_x, slide.marker_y, slide.marker_z);
    } else {
      this.presViewer.clearMarker();
    }

    document.getElementById('pres-step-indicator').textContent = `Slide ${idx + 1} de ${this.presTourSlides.length}`;
    document.getElementById('pres-slide-title').textContent = `${idx + 1}. ${slide.title}`;
    document.getElementById('pres-slide-notes').textContent = slide.description || 'Sin notas adicionales.';

    document.querySelectorAll('#pres-slides-strip .timeline-slide-pill').forEach((p, i) => {
      p.classList.toggle('active', i === idx);
    });
  }

  presNext() {
    if (this.presTourSlides && this.presSlideIdx < this.presTourSlides.length - 1) {
      this.presGoTo(this.presSlideIdx + 1);
    }
  }

  presPrev() {
    if (this.presTourSlides && this.presSlideIdx > 0) {
      this.presGoTo(this.presSlideIdx - 1);
    }
  }

  // ----------------------------------------------------
  // MODELS GRID & UPLOAD
  // ----------------------------------------------------
  renderModelsGrid() {
    const grid = document.getElementById('models-cards-grid');
    grid.innerHTML = '';

    this.models.forEach(m => {
      const card = document.createElement('div');
      card.className = 'model-studio-card';
      card.innerHTML = `
        <div class="model-studio-title">📦 ${m.filename}</div>
        <div class="model-studio-meta">
          <span>Formato: ${m.format.toUpperCase()}</span>
          <span>${(m.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
        </div>
        <button class="btn-open-in-editor">🛠️ Abrir en Editor</button>
      `;

      card.querySelector('.btn-open-in-editor').addEventListener('click', () => {
        this.selectModel(m.filename);
        this.switchStage('editor');
      });

      grid.appendChild(card);
    });
  }

  async handleUploadFile(file) {
    const formData = new FormData();
    formData.append('title', file.name.split('.')[0]);
    formData.append('modelFile', file);

    try {
      this.showToast('Subiendo archivo 3D...', 0);
      const res = await fetch('/api/presentations', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.id) {
        this.showToast('✅ Modelo 3D subido con éxito');
        await this.loadModels();
        await this.loadTours();
        await this.selectModel(file.name);
        this.switchStage('editor');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.studioApp = new StudioApp();
});
