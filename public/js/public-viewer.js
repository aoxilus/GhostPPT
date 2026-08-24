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

    this.init();
  }

  async init() {
    this.viewer = new Viewer3D('public-canvas-container');
    this.viewer.setTheme(this.theme);

    this.bindEvents();

    const urlParams = new URLSearchParams(window.location.search);
    let presId = urlParams.get('id');

    if (!presId) {
      // If no ID specified, fetch the latest presentation
      const listRes = await fetch('/api/presentations');
      const listData = await listRes.json();
      if (listData.presentations && listData.presentations.length > 0) {
        presId = listData.presentations[0].id;
      }
    }

    if (presId) {
      await this.loadPresentation(presId);
    } else {
      document.getElementById('public-pres-title').textContent = 'No hay presentaciones disponibles';
      document.getElementById('public-slide-title').textContent = 'Sin contenido';
      document.getElementById('public-slide-description').textContent = 'Sube un modelo y crea tu primera presentación desde el editor.';
    }
  }

  bindEvents() {
    document.getElementById('btn-public-prev').addEventListener('click', () => this.prevSlide());
    document.getElementById('btn-public-next').addEventListener('click', () => this.nextSlide());

    const themeBtn = document.getElementById('btn-public-theme');
    themeBtn.addEventListener('click', () => {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      document.body.dataset.theme = this.theme;
      themeBtn.textContent = this.theme === 'light' ? '☀️ Claro' : '🌙 Oscuro';
      this.viewer.setTheme(this.theme);
    });

    // Keyboard navigation (Arrow keys)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        this.nextSlide();
      } else if (e.key === 'ArrowLeft') {
        this.prevSlide();
      }
    });
  }

  async loadPresentation(presId) {
    try {
      const res = await fetch(`/api/presentations/${presId}`);
      const data = await res.json();
      this.presentation = data.presentation;
      this.slides = data.slides || [];
      this.currentIdx = 0;

      document.getElementById('public-pres-title').textContent = this.presentation.title;
      document.title = `${this.presentation.title} — GhostPPT 3D`;

      // Load 3D model
      await this.viewer.loadModel(`/uploads/${this.presentation.model_filename}`, this.presentation.model_format);

      // Render timeline strip
      this.renderStrip();

      if (this.slides.length > 0) {
        this.goTo(0);
      }
    } catch (err) {
      console.error('Error loading presentation:', err);
    }
  }

  renderStrip() {
    const strip = document.getElementById('public-slides-strip');
    strip.innerHTML = '';

    this.slides.forEach((s, idx) => {
      const pill = document.createElement('button');
      pill.className = `timeline-slide-pill ${idx === this.currentIdx ? 'active' : ''}`;
      pill.textContent = `${idx + 1}. ${s.title}`;
      pill.addEventListener('click', () => this.goTo(idx));
      strip.appendChild(pill);
    });
  }

  goTo(idx) {
    if (idx < 0 || idx >= this.slides.length) return;
    this.currentIdx = idx;
    const slide = this.slides[idx];

    // Fly camera & orientation
    this.viewer.flyTo(
      { x: slide.camera_x, y: slide.camera_y, z: slide.camera_z },
      { x: slide.target_x || 0, y: slide.target_y || 0, z: slide.target_z || 0 },
      { x: slide.rot_x || 0, y: slide.rot_y || 0, z: slide.rot_z || 0 }
    );

    this.viewer.setMaterial(slide.view_mode || 'plain');
    this.viewer.setArrows(slide.arrows || []);
    if (slide.marker_x !== null && slide.marker_x !== undefined) {
      this.viewer.setMarker(slide.marker_x, slide.marker_y, slide.marker_z);
    } else {
      this.viewer.clearMarker();
    }

    document.getElementById('public-step-pill').textContent = `Slide ${idx + 1} de ${this.slides.length}`;
    document.getElementById('public-slide-title').textContent = `${idx + 1}. ${slide.title}`;
    document.getElementById('public-slide-description').textContent = slide.description || 'Sin notas adicionales.';

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
