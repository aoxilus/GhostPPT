const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const sessionSecret = process.env.GHOSTPPT_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Ensure upload directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage for 3D files (OBJ and STL)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const originalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(originalName).toLowerCase();
    const base = path.basename(originalName, ext);
    const uniqueSuffix = Date.now();
    cb(null, `${base}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
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

// Session middleware (using in-memory store for instant responsiveness)
app.use(
  session({
    secret: sessionSecret,
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

// Auth Helpers
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
  }
  next();
}

function requireProfessor(req, res, next) {
  if (!req.session.userId || req.session.userRole !== 'professor') {
    return res.status(403).json({ error: 'Acceso restringido para profesores.' });
  }
  next();
}

// ----------------------------------------------------
// AUTH ENDPOINTS
// ----------------------------------------------------
app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.json({ user: null });
  }
  res.json({ user });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  const userRole = role === 'student' ? 'student' : 'professor';
  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)');
    const result = stmt.run(username.trim().toLowerCase(), hash, full_name.trim(), userRole);
    req.session.userId = result.lastInsertRowid;
    req.session.userRole = userRole;
    res.json({
      user: {
        id: result.lastInsertRowid,
        username: username.trim().toLowerCase(),
        full_name: full_name.trim(),
        role: userRole
      }
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
    }
    res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  req.session.userId = user.id;
  req.session.userRole = user.role;
  res.json({
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Error al cerrar sesión' });
    res.json({ success: true });
  });
});

// ----------------------------------------------------
// MODELS REPOSITORY LIST
// ----------------------------------------------------
app.get('/api/models', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const modelFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.obj' || ext === '.stl';
    }).map(f => {
      const stat = fs.statSync(path.join(uploadsDir, f));
      return {
        filename: f,
        format: path.extname(f).toLowerCase().replace('.', ''),
        sizeBytes: stat.size,
        modified: stat.mtime
      };
    });
    res.json({ models: modelFiles });
  } catch (err) {
    res.status(500).json({ error: 'Error al leer modelos: ' + err.message });
  }
});

// ----------------------------------------------------
// PRESENTATIONS / TOURS ENDPOINTS
// ----------------------------------------------------
app.get('/api/presentations', (req, res) => {
  try {
    const presentations = db.prepare(`
      SELECT p.*, u.full_name as author_name,
        (SELECT COUNT(*) FROM slides s WHERE s.presentation_id = p.id) as slide_count
      FROM presentations p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.id ASC
    `).all();
    res.json({ presentations });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener presentaciones: ' + err.message });
  }
});

app.get('/api/presentations/:id', (req, res) => {
  const presId = req.params.id;
  try {
    const pres = db.prepare(`
      SELECT p.*, u.full_name as author_name
      FROM presentations p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(presId);

    if (!pres) {
      return res.status(404).json({ error: 'Presentación no encontrada' });
    }

    const slides = db.prepare(`
      SELECT * FROM slides
      WHERE presentation_id = ?
      ORDER BY step_order ASC, id ASC
    `).all(presId);

    // Parse arrows JSON safely for each slide
    const formattedSlides = slides.map(s => {
      let parsedArrows = [];
      try {
        parsedArrows = s.arrows ? JSON.parse(s.arrows) : [];
      } catch (e) {
        parsedArrows = [];
      }
      return {
        ...s,
        arrows: parsedArrows
      };
    });

    res.json({ presentation: pres, slides: formattedSlides });
  } catch (err) {
    res.status(500).json({ error: 'Error al cargar tour: ' + err.message });
  }
});

app.post('/api/presentations', requireAuth, (req, res) => {
  upload.single('modelFile')(req, res, err => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    const { title, description, category, existing_filename } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'El título es requerido' });
    }

    let modelFilename = '';
    let modelFormat = 'obj';

    if (req.file) {
      modelFilename = req.file.filename;
      modelFormat = path.extname(req.file.filename).toLowerCase().replace('.', '');
    } else if (existing_filename) {
      modelFilename = existing_filename;
      modelFormat = path.extname(existing_filename).toLowerCase().replace('.', '');
    } else {
      return res.status(400).json({ error: 'Debes subir un archivo 3D o seleccionar uno existente' });
    }

    const userId = req.session.userId;

    try {
      const stmt = db.prepare(`
        INSERT INTO presentations (title, description, category, model_filename, model_format, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        title.trim(),
        (description || '').trim(),
        (category || 'General').trim(),
        modelFilename,
        modelFormat,
        userId
      );

      const presId = result.lastInsertRowid;

      // Create an initial starter slide
      const insertSlide = db.prepare(`
        INSERT INTO slides (
          presentation_id, step_order, title, description,
          camera_x, camera_y, camera_z,
          target_x, target_y, target_z,
          marker_x, marker_y, marker_z, marker_label,
          view_mode, arrows
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertSlide.run(
        presId, 1,
        '1. Vista General',
        'Inicio del recorrido 3D. Explora el modelo en 360 grados.',
        0, 3, 8,
        0, 0, 0,
        null, null, null, null,
        'metal:#e2e8f0', '[]'
      );

      res.status(201).json({ id: presId, message: 'Presentación creada con éxito' });
    } catch (dbErr) {
      res.status(500).json({ error: 'Error al crear presentación: ' + dbErr.message });
    }
  });
});

app.put('/api/presentations/:id', requireAuth, (req, res) => {
  const { title, description, category } = req.body;
  const presId = req.params.id;
  try {
    db.prepare(`
      UPDATE presentations
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          category = COALESCE(?, category)
      WHERE id = ?
    `).run(title, description, category, presId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar presentación: ' + err.message });
  }
});

app.delete('/api/presentations/:id', requireAuth, (req, res) => {
  const presId = req.params.id;
  try {
    db.prepare('DELETE FROM presentations WHERE id = ?').run(presId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar presentación: ' + err.message });
  }
});

// ----------------------------------------------------
// SLIDES ENDPOINTS (CÁMARA, FLECHAS 3D, MATERIALES, MARCADORES)
// ----------------------------------------------------
app.post('/api/presentations/:id/slides', requireAuth, (req, res) => {
  const presId = req.params.id;
  const {
    title,
    description,
    camera_x, camera_y, camera_z,
    target_x, target_y, target_z,
    marker_x, marker_y, marker_z, marker_label,
    view_mode,
    arrows,
    rot_x, rot_y, rot_z
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'El título del slide es requerido' });
  }

  try {
    // Determine next step order
    const maxOrderRow = db.prepare('SELECT MAX(step_order) as maxOrder FROM slides WHERE presentation_id = ?').get(presId);
    const nextOrder = (maxOrderRow && maxOrderRow.maxOrder !== null) ? maxOrderRow.maxOrder + 1 : 1;

    const arrowsStr = typeof arrows === 'string' ? arrows : JSON.stringify(arrows || []);

    const stmt = db.prepare(`
      INSERT INTO slides (
        presentation_id, step_order, title, description,
        camera_x, camera_y, camera_z,
        target_x, target_y, target_z,
        marker_x, marker_y, marker_z, marker_label,
        view_mode, arrows,
        rot_x, rot_y, rot_z
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      presId,
      nextOrder,
      title.trim(),
      (description || '').trim(),
      Number(camera_x) || 0,
      Number(camera_y) || 0,
      Number(camera_z) || 7.5,
      Number(target_x) || 0,
      Number(target_y) || 0,
      Number(target_z) || 0,
      marker_x !== undefined && marker_x !== null ? Number(marker_x) : null,
      marker_y !== undefined && marker_y !== null ? Number(marker_y) : null,
      marker_z !== undefined && marker_z !== null ? Number(marker_z) : null,
      marker_label || null,
      view_mode || 'metal:#e2e8f0',
      arrowsStr,
      Number(rot_x) || 0,
      Number(rot_y) || 0,
      Number(rot_z) || 0
    );

    res.status(201).json({
      slide: {
        id: result.lastInsertRowid,
        presentation_id: Number(presId),
        step_order: nextOrder,
        title: title.trim(),
        description: (description || '').trim(),
        camera_x: Number(camera_x) || 0,
        camera_y: Number(camera_y) || 0,
        camera_z: Number(camera_z) || 7.5,
        target_x: Number(target_x) || 0,
        target_y: Number(target_y) || 0,
        target_z: Number(target_z) || 0,
        marker_x: marker_x !== undefined && marker_x !== null ? Number(marker_x) : null,
        marker_y: marker_y !== undefined && marker_y !== null ? Number(marker_y) : null,
        marker_z: marker_z !== undefined && marker_z !== null ? Number(marker_z) : null,
        marker_label: marker_label || null,
        view_mode: view_mode || 'metal:#e2e8f0',
        arrows: typeof arrows === 'string' ? JSON.parse(arrowsStr) : (arrows || []),
        rot_x: Number(rot_x) || 0,
        rot_y: Number(rot_y) || 0,
        rot_z: Number(rot_z) || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear slide: ' + err.message });
  }
});

app.put('/api/presentations/:id/slides/:slideId', requireAuth, (req, res) => {
  const { id: presId, slideId } = req.params;
  const {
    title,
    description,
    step_order,
    camera_x, camera_y, camera_z,
    target_x, target_y, target_z,
    marker_x, marker_y, marker_z, marker_label,
    view_mode,
    arrows,
    rot_x, rot_y, rot_z
  } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM slides WHERE id = ? AND presentation_id = ?').get(slideId, presId);
    if (!existing) {
      return res.status(404).json({ error: 'Slide no encontrado' });
    }

    const arrowsStr = arrows !== undefined ? (typeof arrows === 'string' ? arrows : JSON.stringify(arrows)) : existing.arrows;

    db.prepare(`
      UPDATE slides
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          step_order = COALESCE(?, step_order),
          camera_x = COALESCE(?, camera_x),
          camera_y = COALESCE(?, camera_y),
          camera_z = COALESCE(?, camera_z),
          target_x = COALESCE(?, target_x),
          target_y = COALESCE(?, target_y),
          target_z = COALESCE(?, target_z),
          marker_x = ?,
          marker_y = ?,
          marker_z = ?,
          marker_label = ?,
          view_mode = COALESCE(?, view_mode),
          arrows = ?,
          rot_x = COALESCE(?, rot_x),
          rot_y = COALESCE(?, rot_y),
          rot_z = COALESCE(?, rot_z)
      WHERE id = ? AND presentation_id = ?
    `).run(
      title ?? null,
      description ?? null,
      step_order ?? null,
      camera_x ?? null,
      camera_y ?? null,
      camera_z ?? null,
      target_x ?? null,
      target_y ?? null,
      target_z ?? null,
      marker_x !== undefined ? marker_x : existing.marker_x,
      marker_y !== undefined ? marker_y : existing.marker_y,
      marker_z !== undefined ? marker_z : existing.marker_z,
      marker_label !== undefined ? marker_label : existing.marker_label,
      view_mode ?? null,
      arrowsStr,
      rot_x ?? null,
      rot_y ?? null,
      rot_z ?? null,
      slideId,
      presId
    );

    res.json({ success: true, message: 'Slide actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar slide: ' + err.message });
  }
});

app.delete('/api/presentations/:id/slides/:slideId', requireAuth, (req, res) => {
  const { id: presId, slideId } = req.params;
  try {
    db.prepare('DELETE FROM slides WHERE id = ? AND presentation_id = ?').run(slideId, presId);
    res.json({ success: true, message: 'Slide eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar slide: ' + err.message });
  }
});

// Reorder slides
app.post('/api/presentations/:id/slides/reorder', requireAuth, (req, res) => {
  const presId = req.params.id;
  const { slideIds } = req.body; // Array of IDs in order
  if (!Array.isArray(slideIds)) {
    return res.status(400).json({ error: 'slideIds debe ser un array' });
  }

  try {
    const updateStmt = db.prepare('UPDATE slides SET step_order = ? WHERE id = ? AND presentation_id = ?');
    slideIds.forEach((id, index) => {
      updateStmt.run(index + 1, id, presId);
    });
    res.json({ success: true, message: 'Orden actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al reordenar slides: ' + err.message });
  }
});

// Descriptive public viewer URL:
// /user/:user/collection/:collection/presentation/:presentation/item/:id
app.get('/user/:username/collection/:collection/presentation/:presentation/item/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// Single Page Application Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`GhostPPT Server running on http://localhost:${PORT}`);
});
