/**
 * public-viewer.js — Public 3D Presentation Player (No Login Required)
 */

import { Viewer3D } from './viewer3d.js';

class PublicViewerApp {
  constructor() {
    this.viewer = null;
    this.presentation = null;
    this.slides = [];
    this.currentIdx = 0;
    this.theme = 'light';
    this.backgroundStyle = this.readStoredBackgroundStyle();
    this.appBaseUrl = new URL('../', import.meta.url);
    this.loadToken = 0;
    this.loadedModel = null;

    this.init();
  }

  async init() {
    try {
      this.viewer = new Viewer3D('public-canvas-container');
      this.viewer.setTheme(this.theme);
    } catch (err) {
      this.showStatus('Could not start the 3D viewer.', err.message || String(err));
      return;
    }

    this.bindEvents();
    this.syncBackgroundControls();
    this.applyBackgroundStyle();

    const urlParams = new URLSearchParams(window.location.search);
    const pathItem = window.location.pathname.match(/\/item\/([^/]+)\/?$/i);
    let presId = urlParams.get('id') || (pathItem ? decodeURIComponent(pathItem[1]) : null);

    if (!presId) {
      try {
        const listRes = await fetch(new URL('api/presentations', this.appBaseUrl));
        if (!listRes.ok) {
          throw new Error(`Could not list presentations (${listRes.status})`);
        }
        const listData = await listRes.json();
        if (listData.presentations && listData.presentations.length > 0) {
          presId = listData.presentations[0].id;
        }
      } catch (err) {
        this.showStatus('Unable to load presentations.', err.message || String(err));
        return;
      }
    }

    if (presId) {
      await this.loadPresentation(presId);
    } else {
      this.showStatus(
        'No presentations available',
        'Upload a model and create your first presentation in the editor.'
      );
    }
  }

  showStatus(title, description, { presentationTitle = null } = {}) {
    const presTitleEl = document.getElementById('public-pres-title');
    const slideTitleEl = document.getElementById('public-slide-title');
    const slideDescEl = document.getElementById('public-slide-description');
    const stepPill = document.getElementById('public-step-pill');
    const strip = document.getElementById('public-slides-strip');

    if (presTitleEl && presentationTitle != null) {
      presTitleEl.textContent = presentationTitle;
    } else if (presTitleEl && !this.presentation) {
      presTitleEl.textContent = title;
    }

    if (slideTitleEl) slideTitleEl.textContent = title;
    if (slideDescEl) slideDescEl.textContent = description || '';
    if (stepPill) stepPill.textContent = this.slides.length ? `Slide ${this.currentIdx + 1} of ${this.slides.length}` : '—';
    if (strip && !this.slides.length) strip.innerHTML = '';
  }

  readStoredBackgroundStyle() {
    const fallback = {
      mode: 'white',
      color: '#f8fafc',
      gradientStart: '#dbeafe',
      gradientEnd: '#fbbf24'
    };
    try {
      const stored = JSON.parse(localStorage.getItem('ghostppt_public_background') || 'null');
      return stored && typeof stored === 'object' ? { ...fallback, ...stored } : fallback;
    } catch {
      return fallback;
    }
  }

  readBackgroundControls() {
    const readColor = (id, fallback) => {
      const value = document.getElementById(id)?.value;
      return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
    };
    return {
      mode: document.getElementById('public-background-style')?.value || 'white',
      color: readColor('public-background-color', '#f8fafc'),
      gradientStart: readColor('public-gradient-start', '#dbeafe'),
      gradientEnd: readColor('public-gradient-end', '#fbbf24')
    };
  }

  syncBackgroundControls() {
    const values = {
      'public-background-style': this.backgroundStyle.mode,
      'public-background-color': this.backgroundStyle.color,
      'public-gradient-start': this.backgroundStyle.gradientStart,
      'public-gradient-end': this.backgroundStyle.gradientEnd
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input && value) input.value = value;
    });
  }

  updateBackgroundControls() {
    const mode = this.backgroundStyle.mode;
    const colors = document.getElementById('public-background-colors');
    const solidRow = document.getElementById('public-solid-color-row');
    const gradientRows = document.getElementById('public-gradient-color-rows');
    colors?.classList.toggle('hidden', mode !== 'color' && mode !== 'gradient');
    solidRow?.classList.toggle('hidden', mode !== 'color');
    gradientRows?.classList.toggle('hidden', mode !== 'gradient');
  }

  applyBackgroundStyle() {
    this.backgroundStyle = this.readBackgroundControls();
    localStorage.setItem('ghostppt_public_background', JSON.stringify(this.backgroundStyle));
    this.updateBackgroundControls();

    const background = this.backgroundStyle.mode === 'dark'
      ? '#13151b'
      : this.backgroundStyle.mode === 'white'
        ? '#ffffff'
        : this.backgroundStyle.mode === 'color'
          ? this.backgroundStyle.color
          : `linear-gradient(135deg, ${this.backgroundStyle.gradientStart}, ${this.backgroundStyle.gradientEnd})`;

    document.body.style.background = background;
    const viewport = document.querySelector('.public-viewport');
    if (viewport) viewport.style.background = background;
    this.viewer?.setBackgroundStyle(this.backgroundStyle);
  }

  bindEvents() {
    document.getElementById('btn-public-prev')?.addEventListener('click', () => this.prevSlide());
    document.getElementById('btn-public-next')?.addEventListener('click', () => this.nextSlide());

    const themeBtn = document.getElementById('btn-public-theme');
    themeBtn?.addEventListener('click', () => {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      document.body.dataset.theme = this.theme;
      themeBtn.textContent = this.theme === 'light' ? '☀️ Light' : '🌙 Dark';
      this.viewer?.setTheme(this.theme);
      this.applyBackgroundStyle();
    });

    const backgroundStyle = document.getElementById('public-background-style');
    const backgroundInputs = [
      'public-background-style',
      'public-background-color',
      'public-gradient-start',
      'public-gradient-end'
    ];
    backgroundInputs.forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => this.applyBackgroundStyle());
      document.getElementById(id)?.addEventListener('change', () => this.applyBackgroundStyle());
    });
    backgroundStyle?.addEventListener('focus', () => this.updateBackgroundControls());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        this.nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prevSlide();
      }
    });
  }

  async loadPresentation(presId) {
    const token = ++this.loadToken;
    this.showStatus('Loading presentation...', 'Fetching slides and 3D model.');

    try {
      const res = await fetch(new URL(`api/presentations/${encodeURIComponent(presId)}`, this.appBaseUrl));
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (token !== this.loadToken) return;

      if (!res.ok) {
        const message = data?.error || `Presentation not found (${res.status}).`;
        this.presentation = null;
        this.slides = [];
        this.showStatus('Presentation unavailable', message);
        return;
      }

      if (!data?.presentation) {
        this.presentation = null;
        this.slides = [];
        this.showStatus('Presentation unavailable', 'The server returned an empty presentation.');
        return;
      }

      this.presentation = data.presentation;
      this.slides = Array.isArray(data.slides) ? data.slides : [];
      this.currentIdx = 0;
      this.loadedModel = null;

      document.getElementById('public-pres-title').textContent = this.presentation.title;
      document.title = `${this.presentation.title} — GhostPPT 3D`;

      this.renderStrip();

      if (this.slides.length > 0) {
        await this.goTo(0);
      } else {
        this.showStatus(
          'No slides yet',
          'This presentation exists but has no slides to play.',
          { presentationTitle: this.presentation.title }
        );
      }
    } catch (err) {
      if (token !== this.loadToken) return;
      this.presentation = null;
      this.slides = [];
      this.showStatus('Error loading presentation', err.message || String(err));
    }
  }

  slideModel(slide) {
    const filename = slide?.model_filename || this.presentation?.model_filename;
    const format = slide?.model_format
      || this.presentation?.model_format
      || (filename ? filename.split('.').pop().toLowerCase() : null);
    return { filename, format };
  }

  async ensureSlideModel(slide) {
    const { filename, format } = this.slideModel(slide);
    if (!filename) {
      this.showStatus(
        'Model missing',
        'This slide has no 3D model assigned.',
        { presentationTitle: this.presentation?.title }
      );
      return false;
    }
    if (filename === this.loadedModel) return true;
    const modelUrl = new URL(
      `uploads/${encodeURIComponent(filename)}`,
      this.appBaseUrl
    );
    await this.viewer.loadModel(modelUrl.href, format || 'obj');
    this.loadedModel = filename;
    return true;
  }

  renderStrip() {
    const strip = document.getElementById('public-slides-strip');
    if (!strip) return;
    strip.innerHTML = '';

    this.slides.forEach((s, idx) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `timeline-slide-pill ${idx === this.currentIdx ? 'active' : ''}`;
      pill.textContent = `${idx + 1}. ${s.title}`;
      pill.title = this.slideModel(s).filename || s.title;
      pill.addEventListener('click', () => this.goTo(idx));
      strip.appendChild(pill);
    });
  }

  async goTo(idx) {
    if (idx < 0 || idx >= this.slides.length) return;
    this.currentIdx = idx;
    const slide = this.slides[idx];

    try {
      const ok = await this.ensureSlideModel(slide);
      if (!ok) return;
      if (typeof this.viewer.applySlideState === 'function') {
        this.viewer.applySlideState(slide, { animate: true });
      } else {
        this.viewer.flyTo(
          { x: slide.camera_x, y: slide.camera_y, z: slide.camera_z },
          { x: slide.target_x || 0, y: slide.target_y || 0, z: slide.target_z || 0 },
          { x: slide.rot_x || 0, y: slide.rot_y || 0, z: slide.rot_z || 0 }
        );
        this.viewer.setObjectPosition(
          slide.object_x ?? 0,
          slide.object_y ?? 0,
          slide.object_z ?? 0
        );
        this.viewer.setMaterial(slide.view_mode || 'metal:#e2e8f0');
        this.viewer.setArrows(slide.arrows || []);
        if (slide.marker_x !== null && slide.marker_x !== undefined) {
          this.viewer.setMarker(slide.marker_x, slide.marker_y, slide.marker_z);
        } else {
          this.viewer.clearMarker();
        }
      }
    } catch (err) {
      this.showStatus(
        'Could not load 3D model',
        err.message || String(err),
        { presentationTitle: this.presentation?.title }
      );
      return;
    }

    document.getElementById('public-step-pill').textContent = `Slide ${idx + 1} of ${this.slides.length}`;
    document.getElementById('public-slide-title').textContent = `${idx + 1}. ${slide.title}`;
    document.getElementById('public-slide-description').textContent = slide.description || 'No additional notes.';

    document.querySelectorAll('#public-slides-strip .timeline-slide-pill').forEach((p, i) => {
      p.classList.toggle('active', i === idx);
    });
  }

  nextSlide() {
    if (this.currentIdx < this.slides.length - 1) {
      this.goTo(this.currentIdx + 1);
    }
  }

  prevSlide() {
    if (this.currentIdx > 0) {
      this.goTo(this.currentIdx - 1);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.publicViewer = new PublicViewerApp();
});
