/**
 * GhostPPT Frontend Application Controller
 */

let currentUser = null;
let currentPresentation = null;
let activeSlideIndex = 0;
let viewer = null;
let tempHotspotCoords = null;

// DOM Elements
const authBtn = document.getElementById('btn-auth');
const userProfileDiv = document.getElementById('user-profile');
const userNameSpan = document.getElementById('user-name');
const userRoleBadge = document.getElementById('user-role');
const logoutBtn = document.getElementById('btn-logout');
const newPresBtn = document.getElementById('btn-new-pres');
const dashboardView = document.getElementById('dashboard-view');
const viewerWorkspace = document.getElementById('viewer-workspace');
const cardsGrid = document.getElementById('cards-grid');

// Modals
const modalAuth = document.getElementById('modal-auth');
const modalPres = document.getElementById('modal-pres');
const modalSlide = document.getElementById('modal-slide');

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  viewer = new Viewer3D('webgl-container');
  window.onHotspotClicked = handleHotspotClick;

  await checkAuth();
  await loadPresentations();
  setupEventListeners();
});

function setupEventListeners() {
  // Navigation & Auth
  authBtn.addEventListener('click', () => openModal(modalAuth));
  logoutBtn.addEventListener('click', handleLogout);
  newPresBtn.addEventListener('click', () => {
    if (!currentUser) {
      showToast('Debes iniciar sesión para crear una presentación', 'warning');
      openModal(modalAuth);
      return;
    }
    openModal(modalPres);
  });

  // Auth Form tabs
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const isRegister = e.target.dataset.tab === 'register';
      document.getElementById('form-login').style.display = isRegister ? 'none' : 'block';
      document.getElementById('form-register').style.display = isRegister ? 'block' : 'none';
    });
  });

  // Auth Form Submits
  document.getElementById('form-login').addEventListener('submit', handleLogin);
  document.getElementById('form-register').addEventListener('submit', handleRegister);

  // New Presentation Form
  document.getElementById('form-new-pres').addEventListener('submit', handleCreatePresentation);

  // Modal Closers
  document.querySelectorAll('.modal-close, .btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
      viewer.disableHotspotPicking();
    });
  });

  // Viewer Controls
  document.getElementById('btn-back-dashboard').addEventListener('click', exitViewer);
  document.getElementById('btn-prev-slide').addEventListener('click', () => navigateSlide(-1));
  document.getElementById('btn-next-slide').addEventListener('click', () => navigateSlide(1));
  document.getElementById('btn-add-slide').addEventListener('click', openAddSlideModal);

  // Hotspot selection button
  document.getElementById('btn-pick-hotspot').addEventListener('click', () => {
    modalSlide.classList.remove('active');
    viewer.enableHotspotPicking((hitPoint) => {
      tempHotspotCoords = hitPoint;
      document.getElementById('slide-hotspot-coords').innerText = 
        `X: ${hitPoint.x.toFixed(2)}, Y: ${hitPoint.y.toFixed(2)}, Z: ${hitPoint.z.toFixed(2)}`;
      modalSlide.classList.add('active');
      showToast('¡Punto 3D seleccionado con éxito!', 'success');
    });
  });

  // Add Slide Form Submit
  document.getElementById('form-new-slide').addEventListener('submit', handleCreateSlide);
}

// -------------------------------------------------------------
// AUTHENTICATION
// -------------------------------------------------------------

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    currentUser = data.user;
    updateAuthUI();
  } catch (err) {
    console.error('Error checking auth:', err);
  }
}

function updateAuthUI() {
  if (currentUser) {
    authBtn.style.display = 'none';
    userProfileDiv.style.display = 'flex';
    userNameSpan.innerText = currentUser.full_name;
    userRoleBadge.innerText = currentUser.role === 'professor' ? '👨‍🏫 Profesor' : '🎓 Estudiante';
    newPresBtn.style.display = currentUser.role === 'professor' ? 'inline-flex' : 'none';
  } else {
    authBtn.style.display = 'inline-flex';
    userProfileDiv.style.display = 'none';
    newPresBtn.style.display = 'none';
  }
  updateProfessorControls();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser = data.user;
    updateAuthUI();
    closeModals();
    showToast(`¡Bienvenido de nuevo, ${currentUser.full_name}!`, 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const full_name = document.getElementById('reg-fullname').value.trim();
  const role = document.getElementById('reg-role').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, full_name, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser = data.user;
    updateAuthUI();
    closeModals();
    showToast(`Cuenta creada exitosamente para ${currentUser.full_name}`, 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    updateAuthUI();
    showToast('Sesión cerrada.', 'info');
  } catch (err) {
    console.error(err);
  }
}

// -------------------------------------------------------------
// DASHBOARD & PRESENTATIONS
// -------------------------------------------------------------

async function loadPresentations() {
  try {
    const res = await fetch('/api/presentations');
    const presentations = await res.json();
    renderCards(presentations);
  } catch (err) {
    console.error('Error loading presentations:', err);
  }
}

function renderCards(presentations) {
  cardsGrid.innerHTML = '';
  if (presentations.length === 0) {
    cardsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 4rem 1rem; color: var(--text-muted);">
        <p style="font-size:1.2rem;">No hay presentaciones 3D disponibles.</p>
        <p style="font-size:0.9rem; margin-top:0.5rem;">Inicia sesión como profesor para crear tu primer tour interactivo.</p>
      </div>
    `;
    return;
  }

  presentations.forEach(pres => {
    const card = document.createElement('div');
    card.className = 'tour-card';
    card.innerHTML = `
      <div class="card-preview">
        <span class="card-badge">${pres.model_format.toUpperCase()}</span>
        <div class="card-preview-mesh">${pres.model_format === 'obj' ? '🫀' : '⚙️'}</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHTML(pres.title)}</h3>
        <p class="card-desc">${escapeHTML(pres.description || 'Sin descripción')}</p>
        <div class="card-footer">
          <span class="card-author">👤 ${escapeHTML(pres.author_name)}</span>
          <span>📍 ${pres.slide_count || 1} diapositivas</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openPresentation(pres.id));
    cardsGrid.appendChild(card);
  });
}

async function handleCreatePresentation(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  try {
    const res = await fetch('/api/presentations', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('¡Presentación 3D creada exitosamente!', 'success');
    closeModals();
    form.reset();
    await loadPresentations();
    openPresentation(data.id);
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// 3D VIEWER & INTERACTIVE TOUR
// -------------------------------------------------------------

async function openPresentation(id) {
  try {
    const res = await fetch(`/api/presentations/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentPresentation = data;
    activeSlideIndex = 0;

    // Show workspace
    dashboardView.style.display = 'none';
    viewerWorkspace.classList.add('active');

    // Update HUD
    document.getElementById('hud-pres-title').innerText = currentPresentation.title;
    document.getElementById('hud-author-name').innerText = currentPresentation.author_name;

    // Load 3D Model
    viewer.loadModel(currentPresentation.model_filename, currentPresentation.model_format);
    viewer.onWindowResize();

    // Render slides and hotspots
    renderSlideDrawer();
    viewer.setHotspots(currentPresentation.slides);
    updateProfessorControls();

    // Trigger first slide
    if (currentPresentation.slides && currentPresentation.slides.length > 0) {
      applySlide(0);
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function exitViewer() {
  viewerWorkspace.classList.remove('active');
  dashboardView.style.display = 'block';
  currentPresentation = null;
  viewer.clearModel();
  loadPresentations();
}

function updateProfessorControls() {
  const isOwner = currentUser && currentPresentation && (currentUser.id === currentPresentation.user_id);
  const addSlideBtn = document.getElementById('btn-add-slide');
  if (addSlideBtn) {
    addSlideBtn.style.display = isOwner ? 'inline-flex' : 'none';
  }
}

function renderSlideDrawer() {
  const list = document.getElementById('tour-steps-list');
  const dotsContainer = document.getElementById('step-dots');
  list.innerHTML = '';
  dotsContainer.innerHTML = '';

  if (!currentPresentation.slides || currentPresentation.slides.length === 0) return;

  currentPresentation.slides.forEach((slide, idx) => {
    // Sidebar card
    const card = document.createElement('div');
    card.className = `step-card ${idx === activeSlideIndex ? 'active' : ''}`;
    card.id = `step-card-${idx}`;
    card.innerHTML = `
      <span class="step-badge">Paso ${slide.step_order || idx + 1}</span>
      <h4 class="step-card-title">${escapeHTML(slide.title)}</h4>
      <p class="step-card-desc">${escapeHTML(slide.description)}</p>
      ${slide.hotspot_label ? `<div style="margin-top:0.5rem; font-size:0.78rem; color:var(--accent); font-weight:600;">📍 Marcador: ${escapeHTML(slide.hotspot_label)}</div>` : ''}
    `;
    card.addEventListener('click', () => applySlide(idx));
    list.appendChild(card);

    // Bottom bar indicator dot
    const dot = document.createElement('div');
    dot.className = `step-dot ${idx === activeSlideIndex ? 'active' : ''}`;
    dot.addEventListener('click', () => applySlide(idx));
    dotsContainer.appendChild(dot);
  });
}

function applySlide(index) {
  if (!currentPresentation || !currentPresentation.slides || !currentPresentation.slides[index]) return;

  activeSlideIndex = index;
  const slide = currentPresentation.slides[index];

  // Camera Animation
  const camPos = { x: slide.camera_x, y: slide.camera_y, z: slide.camera_z };
  const targetPos = { x: slide.target_x, y: slide.target_y, z: slide.target_z };
  viewer.flyTo(camPos, targetPos, 1400);

  // Update UI Cards and Dots
  document.querySelectorAll('.step-card').forEach((c, i) => {
    c.classList.toggle('active', i === index);
  });
  document.querySelectorAll('.step-dot').forEach((d, i) => {
    d.classList.toggle('active', i === index);
  });

  // Update HUD Card
  document.getElementById('hud-slide-title').innerText = slide.title;
  document.getElementById('hud-slide-desc').innerText = slide.description;
  document.getElementById('hud-step-counter').innerText = `Paso ${index + 1} de ${currentPresentation.slides.length}`;

  // Scroll into view in sidebar
  const cardElem = document.getElementById(`step-card-${index}`);
  if (cardElem) cardElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function navigateSlide(direction) {
  if (!currentPresentation || !currentPresentation.slides) return;
  const newIndex = activeSlideIndex + direction;
  if (newIndex >= 0 && newIndex < currentPresentation.slides.length) {
    applySlide(newIndex);
  }
}

function handleHotspotClick(hotspotData, index) {
  // Find matching slide or navigate to it
  const slideIdx = currentPresentation.slides.findIndex(s => s.id === hotspotData.id);
  if (slideIdx !== -1) {
    applySlide(slideIdx);
    showToast(`Explorando: ${hotspotData.hotspot_label || hotspotData.title}`, 'info');
  }
}

// -------------------------------------------------------------
// ADD SLIDE / HOTSPOT MANAGEMENT
// -------------------------------------------------------------

function openAddSlideModal() {
  tempHotspotCoords = null;
  document.getElementById('form-new-slide').reset();
  document.getElementById('slide-hotspot-coords').innerText = 'Ninguno (Opcional)';
  
  // Capture current camera state from viewer
  const state = viewer.getCurrentCameraState();
  document.getElementById('slide-cam-preview').innerText = 
    `Cam [${state.camera.x}, ${state.camera.y}, ${state.camera.z}]`;

  openModal(modalSlide);
}

async function handleCreateSlide(e) {
  e.preventDefault();
  if (!currentPresentation) return;

  const title = document.getElementById('slide-title').value.trim();
  const description = document.getElementById('slide-desc').value.trim();
  const hotspot_label = document.getElementById('slide-hotspot-label').value.trim();

  const camState = viewer.getCurrentCameraState();

  const payload = {
    title,
    description,
    camera_x: camState.camera.x,
    camera_y: camState.camera.y,
    camera_z: camState.camera.z,
    target_x: camState.target.x,
    target_y: camState.target.y,
    target_z: camState.target.z,
    hotspot_x: tempHotspotCoords ? tempHotspotCoords.x : null,
    hotspot_y: tempHotspotCoords ? tempHotspotCoords.y : null,
    hotspot_z: tempHotspotCoords ? tempHotspotCoords.z : null,
    hotspot_label: hotspot_label || null
  };

  try {
    const res = await fetch(`/api/presentations/${currentPresentation.id}/slides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('¡Nueva diapositiva 3D guardada!', 'success');
    closeModals();

    // Reload presentation data and go to new slide
    const presRes = await fetch(`/api/presentations/${currentPresentation.id}`);
    currentPresentation = await presRes.json();
    renderSlideDrawer();
    viewer.setHotspots(currentPresentation.slides);
    applySlide(currentPresentation.slides.length - 1);
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// -------------------------------------------------------------
// UTILITIES
// -------------------------------------------------------------

function openModal(modal) {
  modal.classList.add('active');
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✅' : type === 'danger' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${escapeHTML(message)}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
