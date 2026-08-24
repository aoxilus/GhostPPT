const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure upload directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration for OBJ and STL 3D models
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'model-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.obj' || ext === '.stl') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos 3D en formato .obj o .stl'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(
  session({
    secret: 'ghostppt-super-secure-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Auth Middleware Helper
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción' });
  }
  next();
}

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user: user || null });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
    }
    const password_hash = bcrypt.hashSync(password, 10);
    const assignedRole = role === 'student' ? 'student' : 'professor';

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?)
    `).run(username, password_hash, full_name, assignedRole);

    req.session.userId = result.lastInsertRowid;
    res.json({
      success: true,
      user: {
        id: result.lastInsertRowid,
        username,
        full_name,
        role: assignedRole
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    req.session.userId = user.id;
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión: ' + err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Error al cerrar sesión' });
    res.json({ success: true });
  });
});

// -------------------------------------------------------------
// PRESENTATIONS & 3D TOURS ROUTES
// -------------------------------------------------------------

// Get all presentations
app.get('/api/presentations', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT p.*, u.full_name as author_name, u.role as author_role,
        (SELECT COUNT(*) FROM slides WHERE presentation_id = p.id) as slide_count
      FROM presentations p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single presentation with its slides
app.get('/api/presentations/:id', (req, res) => {
  try {
    const presentation = db.prepare(`
      SELECT p.*, u.full_name as author_name, u.role as author_role
      FROM presentations p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!presentation) {
      return res.status(404).json({ error: 'Presentación no encontrada' });
    }

    const slides = db.prepare(`
      SELECT * FROM slides
      WHERE presentation_id = ?
      ORDER BY step_order ASC
    `).all(req.params.id);

    res.json({ ...presentation, slides });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new presentation with 3D model upload
app.post('/api/presentations', requireAuth, upload.single('modelFile'), (req, res) => {
  try {
    const { title, description, category, defaultModelType } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'El título es obligatorio' });
    }

    let model_filename = '';
    let model_format = 'obj';

    if (req.file) {
      model_filename = req.file.filename;
      model_format = path.extname(req.file.originalname).substring(1).toLowerCase();
    } else if (defaultModelType) {
      model_filename = defaultModelType === 'stl' ? 'demo_gear.stl' : 'demo_heart.obj';
      model_format = defaultModelType === 'stl' ? 'stl' : 'obj';
    } else {
      model_filename = 'demo_heart.obj';
      model_format = 'obj';
    }

    const result = db.prepare(`
      INSERT INTO presentations (title, description, category, model_filename, model_format, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, description || '', category || 'General', model_filename, model_format, req.session.userId);

    const presId = result.lastInsertRowid;

    // Create initial overview slide
    db.prepare(`
      INSERT INTO slides (
        presentation_id, step_order, title, description,
        camera_x, camera_y, camera_z,
        target_x, target_y, target_z
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      presId, 1,
      'Introducción al Modelo 3D',
      'Exploración general y orientación espacial del objeto.',
      0, 4, 12,
      0, 0, 0
    );

    res.json({ success: true, id: presId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete presentation
app.delete('/api/presentations/:id', requireAuth, (req, res) => {
  try {
    const pres = db.prepare('SELECT * FROM presentations WHERE id = ?').get(req.params.id);
    if (!pres) return res.status(404).json({ error: 'Presentación no encontrada' });
    
    // Check ownership
    if (pres.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta presentación' });
    }

    db.prepare('DELETE FROM presentations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// SLIDES / TOURS / HOTSPOTS MANAGEMENT
// -------------------------------------------------------------

// Add slide to presentation
app.post('/api/presentations/:id/slides', requireAuth, (req, res) => {
  try {
    const pres = db.prepare('SELECT * FROM presentations WHERE id = ?').get(req.params.id);
    if (!pres) return res.status(404).json({ error: 'Presentación no encontrada' });
    if (pres.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta presentación' });
    }

    const {
      title, description,
      camera_x, camera_y, camera_z,
      target_x, target_y, target_z,
      hotspot_x, hotspot_y, hotspot_z, hotspot_label
    } = req.body;

    const count = db.prepare('SELECT COUNT(*) as c FROM slides WHERE presentation_id = ?').get(req.params.id).c;
    const nextOrder = count + 1;

    const result = db.prepare(`
      INSERT INTO slides (
        presentation_id, step_order, title, description,
        camera_x, camera_y, camera_z,
        target_x, target_y, target_z,
        hotspot_x, hotspot_y, hotspot_z, hotspot_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id, nextOrder,
      title || `Paso ${nextOrder}`,
      description || '',
      camera_x || 0, camera_y || 4, camera_z || 12,
      target_x || 0, target_y || 0, target_z || 0,
      hotspot_x !== undefined && hotspot_x !== null ? Number(hotspot_x) : null,
      hotspot_y !== undefined && hotspot_y !== null ? Number(hotspot_y) : null,
      hotspot_z !== undefined && hotspot_z !== null ? Number(hotspot_z) : null,
      hotspot_label || null
    );

    res.json({ success: true, id: result.lastInsertRowid, step_order: nextOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update slide
app.put('/api/slides/:slideId', requireAuth, (req, res) => {
  try {
    const slide = db.prepare(`
      SELECT s.*, p.user_id FROM slides s
      JOIN presentations p ON s.presentation_id = p.id
      WHERE s.id = ?
    `).get(req.params.slideId);

    if (!slide) return res.status(404).json({ error: 'Diapositiva no encontrada' });
    if (slide.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const {
      title, description,
      camera_x, camera_y, camera_z,
      target_x, target_y, target_z,
      hotspot_x, hotspot_y, hotspot_z, hotspot_label
    } = req.body;

    db.prepare(`
      UPDATE slides SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        camera_x = COALESCE(?, camera_x),
        camera_y = COALESCE(?, camera_y),
        camera_z = COALESCE(?, camera_z),
        target_x = COALESCE(?, target_x),
        target_y = COALESCE(?, target_y),
        target_z = COALESCE(?, target_z),
        hotspot_x = ?,
        hotspot_y = ?,
        hotspot_z = ?,
        hotspot_label = ?
      WHERE id = ?
    `).run(
      title, description,
      camera_x, camera_y, camera_z,
      target_x, target_y, target_z,
      hotspot_x !== undefined ? hotspot_x : slide.hotspot_x,
      hotspot_y !== undefined ? hotspot_y : slide.hotspot_y,
      hotspot_z !== undefined ? hotspot_z : slide.hotspot_z,
      hotspot_label !== undefined ? hotspot_label : slide.hotspot_label,
      req.params.slideId
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete slide
app.delete('/api/slides/:slideId', requireAuth, (req, res) => {
  try {
    const slide = db.prepare(`
      SELECT s.*, p.user_id FROM slides s
      JOIN presentations p ON s.presentation_id = p.id
      WHERE s.id = ?
    `).get(req.params.slideId);

    if (!slide) return res.status(404).json({ error: 'Diapositiva no encontrada' });
    if (slide.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    db.prepare('DELETE FROM slides WHERE id = ?').run(req.params.slideId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(` 👻 GhostPPT Server running at: http://localhost:${PORT}`);
  console.log(`===========================================`);
});
