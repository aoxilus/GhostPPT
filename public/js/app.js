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
    this.currentPresentation = null;
    this.currentSlides = [];
    this.activeSlideIdx = 0;
    this.presLoadedModel = null;
    this.currentUser = null;
    this.studioInitialized = false;
    this.isApplyingSlide = false;
    this.slideApplyToken = 0;
    this.modelLoadToken = 0;
    this.presentationLoadToken = 0;
    this.autosaveTimer = null;
    this.autosaveInFlight = false;
    this.autosaveQueued = null;
    this.autosaveDirty = false;
    this.pendingAutosave = null;
    this.pendingUserChange = false;
    this.isLoadingModel = false;
    this.slideCreationInFlight = false;
    this.slideDeletionInFlight = false;

    // Draggable card state
    this.isDraggingCard = false;
    this.cardDragOffset = { x: 0, y: 0 };
    this.currentTheme = localStorage.getItem('ghostppt_theme') || 'light';
    this.editorBackgroundStyle = this.readStoredEditorBackgroundStyle();
    this.lang = localStorage.getItem('ghostppt_lang') || 'en';
    this.i18n = {
      es: {
        tab_editor: "Editor 3D",
        tab_presentation: "Presentación",
        tab_models: "Archivos 3D",
        btn_share: "🔗 Compartir / QR",
        pres_label: "Presentación:",
        model_label: "Modelo del slide:",
        background_label: "Fondo",
        background_white: "Blanco",
        background_dark: "Oscuro",
        background_color: "Color sólido",
        background_gradient: "Gradiente",
        background_color_label: "Color",
        background_start: "Inicio",
        background_end: "Fin",
        btn_autocenter: "🎯 Auto Center",
        text_card_title: "📝 Anotación de Texto",
        label_annotate: "Anotar",
        tool_arrow: "Flecha 3D",
        tool_marker: "Marcador",
        tool_text: "Texto",
        tool_clean: "Limpiar",
        label_orient: "Orientar",
        label_material: "Material",
        mat_plain: "Mate",
        mat_metal: "Metálico",
        mat_squares: "🏁 Cuadros",
        mat_rock: "🪨 Roca",
        label_metal_color: "Tono Metálico:",
        label_mesh: "Malla:",
        copy_elements: "Copiar elementos al siguiente",
        btn_del_slide: "🗑️ Borrar Slide",
        new_slide: "➕ Nueva Slide",
        btn_prev: "◀ Anterior",
        btn_next: "Siguiente ▶",
        models_title: "Biblioteca de Archivos 3D",
        models_desc: "Sube archivos STL o OBJ desde tu computadora para cargarlos en el editor.",
        dropzone_title: "Arrastra un archivo .STL o .OBJ aquí",
        dropzone_sub: "O haz clic para seleccionar desde tu disco local",
        server_models: "Modelos en Servidor",
        share_modal_title: "🔗 Compartir Presentación 3D",
        share_modal_desc: "Cualquier persona puede ver esta presentación 3D en su celular, tablet o PC sin necesidad de iniciar sesión.",
        qr_hint: "📲 Escanea el código QR con tu celular",
        btn_copy_link: "📋 Copiar Link",
        btn_download_qr: "⬇️ Descargar QR para PowerPoint",
        btn_copy_embed: "🌐 Copiar HTML para website",
        open_public_tab: "👁️ Abrir Visor Público en pestaña nueva"
      },
      en: {
        tab_editor: "3D Editor",
        tab_presentation: "Presentation",
        tab_models: "3D Files",
        btn_share: "🔗 Share / QR",
        pres_label: "Presentation:",
        model_label: "Slide model:",
        background_label: "Background",
        background_white: "White",
        background_dark: "Dark",
        background_color: "Solid color",
        background_gradient: "Gradient",
        background_color_label: "Color",
        background_start: "Start",
        background_end: "End",
        btn_autocenter: "🎯 Auto Center",
        text_card_title: "📝 Text Annotation",
        label_annotate: "Annotate",
        tool_arrow: "3D Arrow",
        tool_marker: "Marker",
        tool_text: "Text",
        tool_clean: "Clean",
        label_orient: "Orient",
        label_material: "Material",
        mat_plain: "Matte",
        mat_metal: "Metallic",
        mat_squares: "🏁 Squares",
        mat_rock: "🪨 Rock",
        label_metal_color: "Metallic Color:",
        label_mesh: "Mesh:",
        copy_elements: "Copy elements to next",
        btn_del_slide: "🗑️ Delete Slide",
        new_slide: "➕ New Slide",
        btn_prev: "◀ Previous",
        btn_next: "Next ▶",
        models_title: "3D File Library",
        models_desc: "Upload STL or OBJ files from your computer to load them into the editor.",
        dropzone_title: "Drag an .STL or .OBJ file here",
        dropzone_sub: "Or click to select from your local drive",
        server_models: "Server Models",
        share_modal_title: "🔗 Share 3D Presentation",
        share_modal_desc: "Anyone can view this 3D presentation on their phone, tablet, or PC without needing to log in.",
        qr_hint: "📲 Scan the QR code with your phone",
        btn_copy_link: "📋 Copy Link",
        btn_download_qr: "⬇️ Download QR for PowerPoint",
        btn_copy_embed: "🌐 Copy website HTML",
        open_public_tab: "👁️ Open Public Viewer in new tab"
      }
    };

    this.init();
  }

  async init() {
    this.bindAuthEvents();

    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (!data.user) {
        this.setAuthState(null);
        return;
      }
      this.currentUser = data.user;
      this.setAuthState(data.user);
    } catch (err) {
      this.setAuthState(null, 'Unable to check the session.');
      return;
    }

    await this.initializeStudio();
  }

  readStoredEditorBackgroundStyle() {
    const fallback = {
      mode: 'white',
      color: '#f8fafc',
      gradientStart: '#dbeafe',
      gradientEnd: '#fbbf24'
    };
    try {
      const stored = JSON.parse(localStorage.getItem('ghostppt_editor_background') || 'null');
      return stored && typeof stored === 'object' ? { ...fallback, ...stored } : fallback;
    } catch {
      return fallback;
    }
  }

  readEditorBackgroundControls() {
    const readColor = (id, fallback) => {
      const value = document.getElementById(id)?.value;
      return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
    };
    return {
      mode: document.getElementById('editor-background-style')?.value || 'white',
      color: readColor('editor-background-color', '#f8fafc'),
      gradientStart: readColor('editor-gradient-start', '#dbeafe'),
      gradientEnd: readColor('editor-gradient-end', '#fbbf24')
    };
  }

  syncEditorBackgroundControls() {
    const values = {
      'editor-background-style': this.editorBackgroundStyle.mode,
      'editor-background-color': this.editorBackgroundStyle.color,
      'editor-gradient-start': this.editorBackgroundStyle.gradientStart,
      'editor-gradient-end': this.editorBackgroundStyle.gradientEnd
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input && value) input.value = value;
    });
  }

  updateEditorBackgroundControls() {
    const mode = this.editorBackgroundStyle.mode;
    document.getElementById('editor-background-colors')?.classList.toggle(
      'hidden',
      mode !== 'color' && mode !== 'gradient'
    );
    document.getElementById('editor-solid-color-row')?.classList.toggle('hidden', mode !== 'color');
    document.getElementById('editor-gradient-color-rows')?.classList.toggle('hidden', mode !== 'gradient');
  }

  applyEditorBackgroundStyle() {
    this.editorBackgroundStyle = this.readEditorBackgroundControls();
    localStorage.setItem('ghostppt_editor_background', JSON.stringify(this.editorBackgroundStyle));
    this.updateEditorBackgroundControls();
    this.editorViewer?.setBackgroundStyle(this.editorBackgroundStyle);
  }

  bindAuthEvents() {
    const loginForm = document.getElementById('form-login');
    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const submitButton = loginForm.querySelector('button[type="submit"]');

        this.setLoginError('');
        submitButton.disabled = true;
        submitButton.textContent = 'Signing in...';

        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Unable to sign in.');
          }

          this.currentUser = data.user;
          this.setAuthState(data.user);
          await this.initializeStudio();
        } catch (err) {
          this.setLoginError(err.message);
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = 'Enter studio';
        }
      });
    }

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    });
  }

  setLoginError(message) {
    const errorEl = document.getElementById('login-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.toggle('hidden', !message);
  }

  setAuthState(user, errorMessage = '') {
    const gate = document.getElementById('login-gate');
    const controls = document.getElementById('auth-user-controls');
    const nameEl = document.getElementById('auth-user-name');

    if (user) {
      gate?.classList.add('hidden');
      controls?.classList.remove('hidden');
      if (nameEl) nameEl.textContent = `👤 ${user.full_name}`;
      this.setLoginError('');
    } else {
      gate?.classList.remove('hidden');
      controls?.classList.add('hidden');
      this.setLoginError(errorMessage);
    }
  }

  async initializeStudio() {
    if (this.studioInitialized) return;
    this.studioInitialized = true;

    // 1. Initialize Studio Editor Viewer
    this.editorViewer = new Viewer3D('studio-canvas-container', {
      onCameraChange: (coords) => {
        this.onCamUpdate(coords);
        this.markSlideChanged('camera');
      },
      onArrowAdded: () => this.markSlideChanged('arrow'),
      onMarkerPlaced: () => this.markSlideChanged('marker'),
      onToolStateChange: (state, msg) => this.onToolStateUpdate(state, msg)
    });

    // Apply active theme & language
    this.applyTheme(this.currentTheme);
    this.applyLanguage();
    this.syncEditorBackgroundControls();
    this.applyEditorBackgroundStyle();

    // 2. Setup Events
    this.bindEvents();
    this.bindAutosaveSentinel();
    this.setupDraggableTextCard();

    // 3. Load Models and Tours
    await this.loadModels();
    await this.loadTours();

    // 4. Open last/first presentation (deck), not "first model switches tour"
    if (this.tours.length > 0) {
      await this.openPresentation(this.tours[0].id);
    } else if (this.models.length > 0) {
      this.currentModel = this.models[0].filename;
      const modelSelect = document.getElementById('select-active-model');
      if (modelSelect) modelSelect.value = this.currentModel;
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
      btn.textContent = theme === 'light' ? '☀️ Light' : '🌙 Dark';
    }
    if (this.editorViewer) this.editorViewer.setTheme(theme);
    if (this.editorViewer) this.editorViewer.setBackgroundStyle(this.editorBackgroundStyle);
    if (this.presViewer) this.presViewer.setTheme(theme);
  }

  applyLanguage() {
    const dict = this.i18n[this.lang] || this.i18n.es;
    document.getElementById('current-lang-text').textContent = this.lang.toUpperCase();

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    // Update text placeholders
    const textInput = document.getElementById('text-annotation-content');
    if (textInput) {
      textInput.placeholder = this.lang === 'es' 
        ? 'Escribe aquí tu explicación o título...' 
        : 'Write your explanation or note here...';
    }
    const slideInput = document.getElementById('input-new-slide-title');
    if (slideInput) {
      slideInput.placeholder = this.lang === 'es' ? 'Nombre de este slide...' : 'Current slide title...';
    }
  }

  // ----------------------------------------------------
  // DOM EVENTS & TOOL PALETTE BINDINGS
  // ----------------------------------------------------
  bindEvents() {
    // Language Toggle Button (EN / ES)
    document.getElementById('btn-lang-toggle').addEventListener('click', () => {
      this.lang = this.lang === 'es' ? 'en' : 'es';
      localStorage.setItem('ghostppt_lang', this.lang);
      this.applyLanguage();
      this.showToast(this.lang === 'es' ? '🌐 Idioma: Español' : '🌐 Language: English');
    });

    // Theme Toggle Button
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    const editorBackgroundInputs = [
      'editor-background-style',
      'editor-background-color',
      'editor-gradient-start',
      'editor-gradient-end'
    ];
    editorBackgroundInputs.forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => this.applyEditorBackgroundStyle());
      document.getElementById(id)?.addEventListener('change', () => this.applyEditorBackgroundStyle());
    });

    // Main Workspace Tabs
    document.querySelectorAll('.view-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchStage(tab);
      });
    });

    // Model Selector in Topbar — assigns model to the *current slide*
    const selectModel = document.getElementById('select-active-model');
    selectModel.addEventListener('change', (e) => {
      if (e.target.value) {
        this.assignModelToActiveSlide(e.target.value);
      }
    });

    const headerPresentationSelect = document.getElementById('select-header-presentation');
    headerPresentationSelect?.addEventListener('change', async (e) => {
      if (e.target.value === '__new__') {
        await this.createNewPresentation();
        return;
      }
      if (e.target.value) {
        await this.openPresentation(e.target.value);
      }
    });

    // Right palette Auto Center button
    document.getElementById('btn-palette-autocenter').addEventListener('click', () => {
      this.editorViewer.autoCenterPieceAndCamera();
      this.showToast(this.lang === 'es' ? '🎯 Pieza auto-centrada y cámara encuadrada' : '🎯 Piece auto-centered and camera framed');
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
        if (btn.dataset.mat === 'metal') {
          const activeSwatch = document.querySelector('.metal-swatches-section .swatch-btn.active');
          const col = activeSwatch ? activeSwatch.dataset.metalColor : (this.editorViewer.currentMetallicColor || '#e2e8f0');
          this.editorViewer.setMetallicColor(col);
        } else {
          this.editorViewer.setMaterial(btn.dataset.mat);
        }
      });
    });

    // Wireframe Color Swatches
    document.querySelectorAll('.wireframe-swatches-row .swatch-btn[data-mat]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wireframe-swatches-row .swatch-btn[data-mat]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.editorViewer.setMaterial(btn.dataset.mat);
      });
    });

    // Metallic Color Swatches (Bluish Titanium, Silver Chrome, Gold Brass, Copper Rose Gold)
    document.querySelectorAll('.metal-swatches-section .swatch-btn[data-metal-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.metal-swatches-section .swatch-btn[data-metal-color]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.mat-pill').forEach(b => b.classList.remove('active'));
        document.querySelector('.mat-pill[data-mat="metal"]')?.classList.add('active');

        this.editorViewer.setMetallicColor(btn.dataset.metalColor);
      });
    });

    // Custom Metallic Color Picker
    const customMetalPicker = document.getElementById('metal-custom-color-picker');
    if (customMetalPicker) {
      customMetalPicker.addEventListener('input', (e) => {
        document.querySelectorAll('.metal-swatches-section .swatch-btn[data-metal-color]').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.mat-pill').forEach(b => b.classList.remove('active'));
        document.querySelector('.mat-pill[data-mat="metal"]')?.classList.add('active');

        this.editorViewer.setMetallicColor(e.target.value);
      });
    }

    // Timeline < and > Carousel Navigation Arrows
    const scrollPrev = document.getElementById('btn-scroll-timeline-prev');
    const scrollNext = document.getElementById('btn-scroll-timeline-next');
    if (scrollPrev) {
      scrollPrev.addEventListener('click', () => {
        if (this.currentSlides.length > 0 && this.activeSlideIdx > 0) {
          this.selectSlide(this.activeSlideIdx - 1);
        } else {
          document.getElementById('timeline-slides-container')?.scrollBy({ left: -200, behavior: 'smooth' });
        }
      });
    }
    if (scrollNext) {
      scrollNext.addEventListener('click', () => {
        if (this.currentSlides.length > 0 && this.activeSlideIdx < this.currentSlides.length - 1) {
          this.selectSlide(this.activeSlideIdx + 1);
        } else {
          document.getElementById('timeline-slides-container')?.scrollBy({ left: 200, behavior: 'smooth' });
        }
      });
    }

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

    document.getElementById('btn-new-slide')?.addEventListener('click', () => {
      this.handleCreateSlide();
    });

    // Delete Active Slide Button
    document.getElementById('btn-delete-active-slide').addEventListener('click', () => {
      this.deleteSlideAt(this.activeSlideIdx);
    });

    // Rename Presentation Title
    document.getElementById('btn-rename-pres').addEventListener('click', async () => {
      if (!this.currentTourId) {
        await this.createNewPresentation();
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
    const openShareModal = async () => {
      if (!this.currentTourId) {
        this.showToast('⚠️ Guarda un slide primero para compartir esta presentación');
        return;
      }
      // Resolve from app.js so it also works when deployed under /GPPT/.
      const slugify = (value, fallback) => {
        const slug = String(value || '')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        return slug || fallback;
      };
      const currentTour = this.tours.find(t => String(t.id) === String(this.currentTourId));
      const userSlug = slugify(this.currentUser?.username, 'user');
      const collectionSlug = slugify(currentTour?.category, 'general');
      const presentationSlug = slugify(currentTour?.title, `presentation-${this.currentTourId}`);
      const pathUrl = new URL(
        `../user/${userSlug}/collection/${collectionSlug}/presentation/${presentationSlug}/item/${this.currentTourId}`,
        import.meta.url
      );

      // Prefer a LAN-reachable host in the QR so phones outside this PC can open the viewer.
      let publicUrl = pathUrl.href;
      const host = window.location.hostname;
      const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      if (isLoopback) {
        try {
          const netRes = await fetch('/api/public/network');
          const netData = await netRes.json();
          const lan = Array.isArray(netData.addresses) ? netData.addresses[0] : null;
          if (lan) {
            const lanUrl = new URL(pathUrl.href);
            lanUrl.hostname = lan;
            lanUrl.port = String(netData.port || window.location.port || '3000');
            publicUrl = lanUrl.href;
          }
        } catch (err) {
          console.warn('Could not resolve LAN address for QR:', err);
        }
      }

      document.getElementById('share-public-url').value = publicUrl;
      document.getElementById('btn-open-public-tab').href = publicUrl;
      const qrHint = document.querySelector('[data-i18n="qr_hint"]');
      if (qrHint && isLoopback && publicUrl.includes(window.location.hostname) === false) {
        qrHint.textContent = this.lang === 'es'
          ? '📲 Escanea el QR (misma Wi‑Fi). Abre solo el viewer, sin login.'
          : '📲 Scan the QR (same Wi‑Fi). Opens viewer-only, no login.';
      }
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
      } else {
        this.showToast('⚠️ Librería QR no cargó; usa el enlace copiable.', 4000);
      }
      document.getElementById('modal-share-qr').classList.remove('hidden');
    };

    document.getElementById('btn-share-pres').addEventListener('click', () => { openShareModal(); });
    const shareViewBtn = document.getElementById('btn-share-pres-view');
    if (shareViewBtn) shareViewBtn.addEventListener('click', () => { openShareModal(); });

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

    document.getElementById('btn-download-qr')?.addEventListener('click', () => {
      const qrContainer = document.getElementById('qrcode-container');
      const canvas = qrContainer?.querySelector('canvas');
      const dataUrl = canvas?.toDataURL('image/png') || qrContainer?.querySelector('img')?.src || null;
      if (!dataUrl) {
        this.showToast('⚠️ El QR todavía no está disponible');
        return;
      }
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `GhostPPT-QR-${this.currentTourId}.png`;
      link.click();
      this.showToast('✅ QR descargado para insertarlo en PowerPoint');
    });

    document.getElementById('btn-copy-embed')?.addEventListener('click', async () => {
      const publicUrl = document.getElementById('share-public-url').value;
      const qrContainer = document.getElementById('qrcode-container');
      const canvas = qrContainer?.querySelector('canvas');
      const dataUrl = canvas?.toDataURL('image/png') || qrContainer?.querySelector('img')?.src || null;
      if (!dataUrl || !publicUrl) {
        this.showToast('⚠️ Abre primero el diálogo Compartir / QR');
        return;
      }
      const html = `<a href="${publicUrl}" target="_blank" rel="noopener"><img src="${dataUrl}" alt="Abrir presentación GhostPPT" width="220"></a>`;
      try {
        await navigator.clipboard.writeText(html);
        this.showToast('✅ HTML copiado para tu website');
      } catch (err) {
        const helper = document.createElement('textarea');
        helper.value = html;
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
        this.showToast('✅ HTML copiado para tu website');
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
      if (e.target.files?.length > 0) {
        this.handleUploadFiles(Array.from(e.target.files));
        e.target.value = '';
      }
    });

    window.addEventListener('beforeunload', () => {
      if (!this.autosaveDirty || !this.pendingAutosave) return;
      const { presentationId, slideId, payload } = this.pendingAutosave;
      try {
        fetch(`/api/presentations/${presentationId}/slides/${slideId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        });
      } catch (_) {}
    });
  }

  // Central autosave sentinel for every editor control that changes slide data.
  bindAutosaveSentinel() {
    const handleChange = (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-autosave]')
        : null;
      if (!target) return;
      this.markSlideChanged(target.dataset.autosave || 'change', {
        userInitiated: true,
        immediate: target.hasAttribute('data-autosave-immediate')
      });
    };

    ['input', 'change', 'click'].forEach((eventName) => {
      document.addEventListener(eventName, handleChange);
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
  slideModelFilename(slide) {
    return slide?.model_filename
      || this.currentPresentation?.model_filename
      || this.currentModel
      || null;
  }

  slideModelFormat(slide) {
    const filename = this.slideModelFilename(slide);
    if (slide?.model_format) return slide.model_format;
    if (filename) return filename.split('.').pop().toLowerCase();
    return this.currentPresentation?.model_format || 'obj';
  }

  syncModelSelect(filename) {
    const modelSelect = document.getElementById('select-active-model');
    if (modelSelect && filename) modelSelect.value = filename;
  }

  async loadModels() {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      this.models = data.models || [];

      const select = document.getElementById('select-active-model');
      select.innerHTML = '';
      if (this.models.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = this.lang === 'es' ? 'Sin modelos — sube en Archivos 3D' : 'No models — upload in 3D Files';
        select.appendChild(opt);
        return;
      }
      this.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.filename;
        opt.textContent = m.filename;
        select.appendChild(opt);
      });
      if (this.currentModel) this.syncModelSelect(this.currentModel);
    } catch (err) {
      console.error('Error loading models:', err);
    }
  }

  async loadEditorModel(filename, { autoFrame = true } = {}) {
    if (!filename) return false;
    const loadToken = ++this.modelLoadToken;
    this.isLoadingModel = true;
    this.currentModel = filename;
    this.syncModelSelect(filename);
    const ext = filename.split('.').pop().toLowerCase();
    this.showToast(`Cargando ${filename}...`, 0);
    try {
      await this.editorViewer.loadModel(`/uploads/${filename}`, ext, { autoFrame });
      if (loadToken !== this.modelLoadToken) return false;
      this.hideToast();
      return true;
    } catch (err) {
      if (loadToken === this.modelLoadToken) {
        this.showToast(`Error al cargar: ${err.message}`, 4000);
      }
      return false;
    } finally {
      if (loadToken === this.modelLoadToken) {
        this.isLoadingModel = false;
      }
    }
  }

  async assignModelToActiveSlide(filename) {
    if (!filename) return;
    if (!this.currentTourId || !this.currentSlides[this.activeSlideIdx]) {
      this.showToast(
        this.lang === 'es'
          ? 'Abre o crea una presentación antes de asignar un modelo al slide.'
          : 'Open or create a presentation before assigning a model to the slide.',
        4000
      );
      this.syncModelSelect(this.currentModel || '');
      return;
    }

    await this.flushPendingAutosave();
    const slide = this.currentSlides[this.activeSlideIdx];
    const format = filename.split('.').pop().toLowerCase();
    slide.model_filename = filename;
    slide.model_format = format;

    const loaded = await this.loadEditorModel(filename, { autoFrame: true });
    if (!loaded) return;

    this.isApplyingSlide = false;
    this.markSlideChanged('model', { userInitiated: true, immediate: true });
    this.showToast(
      this.lang === 'es'
        ? `📦 Modelo del slide: ${filename}`
        : `📦 Slide model: ${filename}`
    );
  }

  async createNewPresentation() {
    const title = prompt(
      this.lang === 'es' ? 'Nombre de la nueva presentación:' : 'New presentation name:',
      this.lang === 'es' ? 'Mi presentación 3D' : 'My 3D presentation'
    );
    if (!title || !title.trim()) {
      await this.loadTours();
      return;
    }

    try {
      await this.flushPendingAutosave();
      const body = { title: title.trim() };
      if (this.currentModel) body.existing_filename = this.currentModel;
      const res = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Unable to create the presentation.');
      }

      this.currentTourId = data.id;
      await this.loadTours();
      await this.openPresentation(data.id);
      this.showToast(`✅ Presentation created: "${title.trim()}"`);
    } catch (err) {
      alert('Error creating presentation: ' + err.message);
      await this.loadTours();
    }
  }

  async openPresentation(tourId) {
    const loadToken = ++this.presentationLoadToken;
    await this.flushPendingAutosave();
    this.isApplyingSlide = true;
    this.pendingUserChange = false;
    this.autosaveDirty = false;
    this.pendingAutosave = null;

    try {
      const res = await fetch(`/api/presentations/${tourId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load presentation.');
      if (loadToken !== this.presentationLoadToken) return;

      this.currentPresentation = data.presentation;
      this.currentTourId = data.presentation.id;
      this.currentSlides = data.slides || [];
      this.activeSlideIdx = 0;

      const titleEl = document.getElementById('display-pres-title');
      if (titleEl) titleEl.textContent = data.presentation.title;
      const headerPresentationSelect = document.getElementById('select-header-presentation');
      if (headerPresentationSelect) headerPresentationSelect.value = String(data.presentation.id);

      this.renderTimelineSlides();
      if (this.currentSlides.length > 0) {
        await this.selectSlide(0);
      } else {
        this.isApplyingSlide = false;
        this.setSaveStatus('No slides');
      }
    } catch (err) {
      this.isApplyingSlide = false;
      this.showToast(`Error: ${err.message}`, 4000);
    }
  }

  /** @deprecated Prefer openPresentation / assignModelToActiveSlide */
  async selectModel(filename, preferredTourId = null) {
    if (preferredTourId) {
      await this.openPresentation(preferredTourId);
      return;
    }
    await this.assignModelToActiveSlide(filename);
  }

  async loadSlidesForModel(_filename, preferredTourId = null) {
    if (preferredTourId) await this.openPresentation(preferredTourId);
  }

  async deleteSlideAt(idx) {
    if (this.slideDeletionInFlight) return;
    if (!this.currentTourId || !this.currentSlides?.[idx]) {
      this.showToast('No current slide to delete');
      return;
    }

    const slide = this.currentSlides[idx];
    if (!confirm(`Delete slide "${slide.title}"?`)) return;

    this.slideDeletionInFlight = true;
    try {
      await this.flushPendingAutosave();
      const res = await fetch(`/api/presentations/${this.currentTourId}/slides/${slide.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete the slide.');

      if (this.pendingAutosave?.slideId === slide.id) {
        this.pendingAutosave = null;
        this.autosaveDirty = false;
      }

      this.currentSlides.splice(idx, 1);
      this.activeSlideIdx = this.currentSlides.length
        ? Math.min(idx, this.currentSlides.length - 1)
        : 0;
      this.renderTimelineSlides();

      if (this.currentSlides.length > 0) {
        await this.selectSlide(this.activeSlideIdx);
      } else {
        this.editorViewer.deleteAllArrows();
        this.editorViewer.clearMarker();
        document.getElementById('text-annotation-content').value = '';
        document.getElementById('text-card-overlay').classList.add('hidden');
        document.getElementById('tool-btn-text').classList.remove('active');
        document.getElementById('input-new-slide-title').value = '';
        this.setSaveStatus('No slides');
      }

      this.showToast('🗑️ Slide deleted');
      await this.loadTours();
    } catch (err) {
      alert('Error deleting slide: ' + err.message);
    } finally {
      this.slideDeletionInFlight = false;
    }
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
        await this.deleteSlideAt(idx);
      });
      pill.appendChild(delBtn);

      // Single Click: Load that specific slide's exact elements
      pill.addEventListener('click', () => {
        this.selectSlide(idx);
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

  async selectSlide(idx) {
    if (idx < 0 || idx >= this.currentSlides.length) return;
    const leaving = this.currentSlides[this.activeSlideIdx];
    if (leaving?.id && this.autosaveDirty && leaving.id !== this.currentSlides[idx]?.id) {
      await this.flushPendingAutosave();
    }

    this.activeSlideIdx = idx;
    const applyToken = ++this.slideApplyToken;
    this.isApplyingSlide = true;
    this.pendingUserChange = false;

    const pills = document.querySelectorAll('#timeline-slides-container .timeline-slide-pill');
    pills.forEach((p, i) => {
      const active = (i === idx);
      p.classList.toggle('active', active);
      if (active) {
        p.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });

    const s = this.currentSlides[idx];
    if (!s) {
      this.isApplyingSlide = false;
      return;
    }
    const titleInput = document.getElementById('input-new-slide-title');
    if (titleInput) titleInput.value = s.title || '';

    const modelFilename = this.slideModelFilename(s);
    if (modelFilename && modelFilename !== this.currentModel) {
      const loaded = await this.loadEditorModel(modelFilename, { autoFrame: false });
      if (applyToken !== this.slideApplyToken) return;
      if (!loaded) {
        this.isApplyingSlide = false;
        return;
      }
    } else if (modelFilename) {
      this.syncModelSelect(modelFilename);
      this.currentModel = modelFilename;
    }

    // Restore camera, rotation, material, arrows, marker, and object position atomically
    this.editorViewer.applySlideState(s, { animate: true });

    const mode = s.view_mode || 'metal:#e2e8f0';
    const modeKey = mode.split(':')[0];
    document.querySelectorAll('.mat-pill').forEach(b => {
      b.classList.toggle('active', b.dataset.mat === modeKey);
    });
    if (mode.startsWith('metal:')) {
      const col = mode.split(':')[1];
      document.querySelectorAll('.metal-swatches-section .swatch-btn[data-metal-color]').forEach(b => {
        b.classList.toggle('active', b.dataset.metalColor.toLowerCase() === col.toLowerCase());
      });
      const picker = document.getElementById('metal-custom-color-picker');
      if (picker && col.startsWith('#')) picker.value = col;
    } else {
      document.querySelectorAll('.wireframe-swatches-row .swatch-btn[data-mat]').forEach(b => {
        b.classList.toggle('active', b.dataset.mat === mode);
      });
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

    window.setTimeout(() => {
      if (applyToken === this.slideApplyToken) {
        this.isApplyingSlide = false;
        this.setSaveStatus('Saved');
        if (this.pendingUserChange) {
          this.pendingUserChange = false;
          this.scheduleAutosave('change');
        }
      }
    }, 850);
  }

  async ensurePresentation() {
    if (this.currentTourId) return true;

    const createRes = await fetch('/api/presentations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: this.currentModel ? `Tour de ${this.currentModel}` : 'Nueva presentación',
        ...(this.currentModel ? { existing_filename: this.currentModel } : {})
      })
    });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
      throw new Error(createData.error || 'No se pudo crear la presentación.');
    }

    await this.openPresentation(createData.id);
    return true;
  }

  collectCurrentSlidePayload() {
    const titleInput = document.getElementById('input-new-slide-title');
    const currentSlide = this.currentSlides[this.activeSlideIdx];
    const title = titleInput?.value.trim() || currentSlide?.title || `Slide ${this.activeSlideIdx + 1}`;
    const textCardContent = document.getElementById('text-annotation-content')?.value.trim();
    const description = textCardContent || 'Vista guardada';
    const camState = this.editorViewer.getCameraState();
    const objectPosition = this.editorViewer.getObjectPosition();
    let currentMode = this.editorViewer.currentViewMode || 'metal';
    if (currentMode === 'metal' && this.editorViewer.currentMetallicColor) {
      currentMode = `metal:${this.editorViewer.currentMetallicColor}`;
    }
    const modelFilename = this.slideModelFilename(currentSlide) || this.currentModel;
    const modelFormat = this.slideModelFormat(currentSlide);

    return {
      title,
      description,
      camera_x: camState.camera.x,
      camera_y: camState.camera.y,
      camera_z: camState.camera.z,
      target_x: camState.target.x,
      target_y: camState.target.y,
      target_z: camState.target.z,
      object_x: objectPosition.x,
      object_y: objectPosition.y,
      object_z: objectPosition.z,
      marker_x: this.editorViewer.markerPosition ? this.editorViewer.markerPosition.x : null,
      marker_y: this.editorViewer.markerPosition ? this.editorViewer.markerPosition.y : null,
      marker_z: this.editorViewer.markerPosition ? this.editorViewer.markerPosition.z : null,
      view_mode: currentMode,
      arrows: Array.isArray(this.editorViewer.arrowPositions)
        ? this.editorViewer.arrowPositions.map(a => ({
            start: { ...a.start },
            end: { ...a.end }
          }))
        : [],
      rot_x: camState.rotation.x,
      rot_y: camState.rotation.y,
      rot_z: camState.rotation.z,
      model_filename: modelFilename,
      model_format: modelFormat
    };
  }

  setSaveStatus(status) {
    const statusEl = document.getElementById('slide-save-status');
    if (statusEl) statusEl.textContent = status;
  }

  getActiveSlideKey() {
    const slide = this.currentSlides[this.activeSlideIdx];
    if (!this.currentTourId || !slide?.id) return null;
    return {
      presentationId: Number(this.currentTourId),
      slideId: Number(slide.id)
    };
  }

  markSlideChanged(reason = 'change', { userInitiated = false, immediate = false } = {}) {
    if (this.isLoadingModel) return;
    if (this.isApplyingSlide) {
      if (userInitiated) this.pendingUserChange = true;
      return;
    }
    this.scheduleAutosave(reason);
    if (immediate) this.flushPendingAutosave();
  }

  async flushPendingAutosave() {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    if (!this.autosaveDirty || !this.pendingAutosave) return false;
    if (this.isApplyingSlide) return false;
    return this.savePendingAutosave();
  }

  scheduleAutosave(reason = 'change') {
    const key = this.getActiveSlideKey();
    if (this.isApplyingSlide || !key) return;

    this.pendingAutosave = {
      ...key,
      reason,
      payload: this.collectCurrentSlidePayload()
    };
    this.autosaveDirty = true;
    clearTimeout(this.autosaveTimer);
    this.setSaveStatus('Pending changes');
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      this.savePendingAutosave();
    }, 500);
  }

  async savePendingAutosave({ notify = false } = {}) {
    const pending = this.pendingAutosave;
    if (!pending?.presentationId || !pending?.slideId || !pending?.payload) return false;

    if (this.autosaveInFlight) {
      this.autosaveQueued = pending;
      return false;
    }

    this.autosaveInFlight = true;
    this.setSaveStatus('Saving...');
    const { presentationId, slideId, payload } = pending;

    try {
      const res = await fetch(`/api/presentations/${presentationId}/slides/${slideId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la slide.');

      const localSlide = this.currentSlides.find(s => Number(s.id) === Number(slideId));
      if (localSlide && Number(this.currentTourId) === Number(presentationId)) {
        Object.assign(localSlide, payload);
      }

      if (
        this.pendingAutosave &&
        Number(this.pendingAutosave.presentationId) === Number(presentationId) &&
        Number(this.pendingAutosave.slideId) === Number(slideId)
      ) {
        this.pendingAutosave = null;
        this.autosaveDirty = false;
      }

      this.setSaveStatus('Saved');
      if (notify) this.showToast('✅ Cambios guardados en la slide activa.');
      return true;
    } catch (err) {
      this.setSaveStatus('Save error');
      if (notify) alert('Error al guardar: ' + err.message);
      else console.error('Autosave error:', err);
      return false;
    } finally {
      this.autosaveInFlight = false;
      if (this.autosaveQueued) {
        this.pendingAutosave = this.autosaveQueued;
        this.autosaveQueued = null;
        this.autosaveDirty = true;
        this.setSaveStatus('Pending changes');
        this.autosaveTimer = window.setTimeout(() => {
          this.autosaveTimer = null;
          this.savePendingAutosave();
        }, 200);
      }
    }
  }

  async saveActiveSlide({ notify = false } = {}) {
    const key = this.getActiveSlideKey();
    if (!key) return false;
    this.pendingAutosave = {
      ...key,
      reason: 'manual',
      payload: this.collectCurrentSlidePayload()
    };
    this.autosaveDirty = true;
    return this.savePendingAutosave({ notify });
  }

  async handleCreateSlide() {
    if (this.slideCreationInFlight) return;
    this.slideCreationInFlight = true;
    const createButton = document.getElementById('btn-new-slide');
    if (createButton) createButton.disabled = true;

    try {
      await this.flushPendingAutosave();
      await this.ensurePresentation();
      const shouldCopy = document.getElementById('chk-copy-elements')?.checked;
      const currentPayload = this.collectCurrentSlidePayload();
      const nextIndex = this.currentSlides.length + 1;
      const payload = shouldCopy
        ? {
            ...currentPayload,
            title: currentPayload.title || `Slide ${nextIndex}`
          }
        : {
            ...currentPayload,
            title: `Slide ${nextIndex}`,
            description: 'Vista guardada',
            marker_x: null,
            marker_y: null,
            marker_z: null,
            arrows: []
          };
      const res = await fetch(`/api/presentations/${this.currentTourId}/slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.slide) {
        throw new Error(data.error || 'No se pudo crear la slide.');
      }

      this.currentSlides.push(data.slide);
      this.activeSlideIdx = this.currentSlides.length - 1;
      this.autosaveDirty = false;
      this.pendingAutosave = null;
      this.renderTimelineSlides();

      if (!shouldCopy) {
        this.editorViewer.deleteAllArrows();
        this.editorViewer.clearMarker();
        const textInput = document.getElementById('text-annotation-content');
        if (textInput) textInput.value = '';
        const textCard = document.getElementById('text-card-overlay');
        if (textCard) textCard.classList.add('hidden');
        document.getElementById('tool-btn-text')?.classList.remove('active');
        const titleInput = document.getElementById('input-new-slide-title');
        if (titleInput) titleInput.value = data.slide.title || '';
      }

      await this.selectSlide(this.activeSlideIdx);
      this.setSaveStatus('Saved');
      this.showToast(
        shouldCopy
          ? '✅ Nueva slide creada con elementos copiados.'
          : '✅ Nueva slide creada.'
      );
      await this.loadTours();
    } catch (err) {
      alert('Error al crear slide: ' + err.message);
    } finally {
      this.slideCreationInFlight = false;
      if (createButton) createButton.disabled = false;
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
      if (select) select.innerHTML = '';
      const headerSelect = document.getElementById('select-header-presentation');
      if (headerSelect) headerSelect.innerHTML = '';
      this.tours.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.title} (${t.slide_count} slides)`;
        select?.appendChild(opt);

        if (headerSelect) {
          const headerOpt = document.createElement('option');
          headerOpt.value = t.id;
          headerOpt.textContent = `${t.title} (${t.slide_count} slides)`;
          headerSelect.appendChild(headerOpt);
        }
      });
      if (headerSelect) {
        const newOpt = document.createElement('option');
        newOpt.value = '__new__';
        newOpt.textContent = '➕ New Presentation';
        headerSelect.appendChild(newOpt);
        if (this.currentTourId) headerSelect.value = String(this.currentTourId);
      }
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
    const loadToken = ++this.presentationLoadToken;
    try {
      const res = await fetch(`/api/presentations/${tourId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load presentation.');
      if (loadToken !== this.presentationLoadToken) return;

      const tour = data.presentation;
      this.presTour = tour;
      this.presTourSlides = data.slides || [];
      this.presSlideIdx = 0;
      this.presLoadedModel = null;

      const tourSelect = document.getElementById('select-presentation-tour');
      if (tourSelect) tourSelect.value = String(tourId);

      this.renderPresStrip();

      if (this.presTourSlides.length > 0) {
        await this.presGoTo(0);
      } else {
        document.getElementById('pres-step-indicator').textContent = 'Slide 0 de 0';
        document.getElementById('pres-slide-title').textContent = 'Sin slides';
        document.getElementById('pres-slide-notes').textContent = 'Esta presentación no tiene slides todavía.';
      }
    } catch (err) {
      console.error(err);
      this.showToast(`Error loading presentation: ${err.message}`, 4000);
    }
  }

  renderPresStrip() {
    const strip = document.getElementById('pres-slides-strip');
    strip.innerHTML = '';

    this.presTourSlides.forEach((s, idx) => {
      const pill = document.createElement('button');
      pill.className = `timeline-slide-pill ${idx === this.presSlideIdx ? 'active' : ''}`;
      const modelHint = s.model_filename ? ` · ${s.model_filename}` : '';
      pill.textContent = `${idx + 1}. ${s.title}`;
      pill.title = `${s.title}${modelHint}`;
      pill.addEventListener('click', () => this.presGoTo(idx));
      strip.appendChild(pill);
    });
  }

  async ensurePresModelForSlide(slide) {
    const filename = slide?.model_filename || this.presTour?.model_filename;
    const format = slide?.model_format || this.presTour?.model_format || (filename ? filename.split('.').pop().toLowerCase() : 'obj');
    if (!filename) {
      this.showToast('This slide has no 3D model assigned.', 4000);
      return false;
    }
    if (filename === this.presLoadedModel) return true;
    await this.presViewer.loadModel(`/uploads/${filename}`, format, { autoFrame: false });
    this.presLoadedModel = filename;
    return true;
  }

  async presGoTo(idx) {
    if (!this.presTourSlides || idx < 0 || idx >= this.presTourSlides.length) return;
    this.presSlideIdx = idx;
    const slide = this.presTourSlides[idx];

    try {
      await this.ensurePresModelForSlide(slide);
      this.presViewer.applySlideState(slide, { animate: true });
    } catch (err) {
      this.showToast(`Could not load slide model: ${err.message}`, 4000);
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
        <button class="btn-open-in-editor">🛠️ Usar en slide activo</button>
      `;

      card.querySelector('.btn-open-in-editor').addEventListener('click', async () => {
        if (!this.currentTourId) {
          this.showToast(
            this.lang === 'es'
              ? 'Crea o abre una presentación primero.'
              : 'Create or open a presentation first.',
            4000
          );
          return;
        }
        this.switchStage('editor');
        await this.assignModelToActiveSlide(m.filename);
      });

      grid.appendChild(card);
    });
  }

  async handleUploadFiles(files) {
    const list = (files || []).filter(Boolean);
    if (list.length === 0) return;

    const formData = new FormData();
    list.forEach((file) => formData.append('modelFiles', file));

    try {
      this.showToast(
        list.length > 1 ? `Subiendo ${list.length} archivos 3D...` : 'Subiendo archivo 3D...',
        0
      );
      const res = await fetch('/api/models', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.models?.length) {
        throw new Error(data.error || 'Unable to upload the model(s).');
      }
      this.showToast(`✅ ${data.models.length} modelo(s) en la biblioteca`);
      await this.loadModels();
      this.renderModelsGrid();
      // Stay on models tab so the user can keep uploading a collection
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async handleUploadFile(file) {
    return this.handleUploadFiles([file]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.studioApp = new StudioApp();
});
