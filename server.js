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

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTitle(value) {
  return String(value || '').trim();
}

function normalizeArrows(arrows) {
  let parsed = arrows;
  if (typeof arrows === 'string') {
    try {
      parsed = JSON.parse(arrows);
    } catch {
      throw new Error('arrows debe ser JSON válido');
    }
  }
  if (parsed == null) return [];
  if (!Array.isArray(parsed)) throw new Error('arrows debe ser un array');
  return parsed.map((arrow, index) => {
    if (!arrow || typeof arrow !== 'object' || !arrow.start || !arrow.end) {
      throw new Error(`Flecha inválida en índice ${index}`);
    }
    return {
      start: {
        x: asFiniteNumber(arrow.start.x),
        y: asFiniteNumber(arrow.start.y),
        z: asFiniteNumber(arrow.start.z)
      },
      end: {
        x: asFiniteNumber(arrow.end.x),
        y: asFiniteNumber(arrow.end.y),
        z: asFiniteNumber(arrow.end.z)
      }
    };
  });
}

function getOwnedPresentation(presId, userId) {
  return db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(presId, userId);
}

function withTransaction(work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore rollback errors */ }
    throw err;
  }
}

function listLibraryModels() {
  if (!fs.existsSync(uploadsDir)) return [];
  return fs.readdirSync(uploadsDir)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.obj' || ext === '.stl';
    })
    .map((f) => {
      const stat = fs.statSync(path.join(uploadsDir, f));
      return {
        filename: f,
        format: path.extname(f).toLowerCase().replace('.', ''),
        sizeBytes: stat.size,
        modified: stat.mtime
      };
    })
    .sort((a, b) => String(a.filename).localeCompare(String(b.filename)));
}

function resolveLibraryModel(filename) {
  if (!filename) return null;
  const safeName = path.basename(String(filename));
  if (!safeName || safeName !== String(filename).replace(/^.*[\\/]/, '')) {
    // Still accept basename-normalized names from clients
  }
  const resolved = path.basename(safeName);
  const fullPath = path.join(uploadsDir, resolved);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`El modelo "${resolved}" no existe en la biblioteca`);
  }
  const format = path.extname(resolved).toLowerCase().replace('.', '');
  if (format !== 'obj' && format !== 'stl') {
    throw new Error('Solo se permiten modelos .obj o .stl');
  }
  return { model_filename: resolved, model_format: format };
}

function syncPresentationCover(presId) {
  const first = db.prepare(`
    SELECT model_filename, model_format
    FROM slides
    WHERE presentation_id = ?
    ORDER BY step_order ASC, id ASC
    LIMIT 1
  `).get(presId);
  if (!first?.model_filename) return;
  db.prepare(`
    UPDATE presentations
    SET model_filename = ?, model_format = ?
    WHERE id = ?
  `).run(first.model_filename, first.model_format || path.extname(first.model_filename).replace('.', ''), presId);
}

function buildSlidePayload(body = {}, { requireModel = false } = {}) {
  const title = normalizeTitle(body.title);
  if (!title) {
    throw new Error('El título del slide es requerido');
  }
  const arrows = normalizeArrows(body.arrows);
  let model_filename = body.model_filename == null ? null : String(body.model_filename).trim();
  let model_format = body.model_format == null ? null : String(body.model_format).trim().toLowerCase();

  if (model_filename) {
    const resolved = resolveLibraryModel(model_filename);
    model_filename = resolved.model_filename;
    model_format = resolved.model_format;
  } else if (requireModel) {
    throw new Error('El modelo del slide es requerido');
  } else {
    model_filename = null;
    model_format = null;
  }

  return {
    title,
    description: String(body.description || '').trim(),
    camera_x: asFiniteNumber(body.camera_x, 0),
    camera_y: asFiniteNumber(body.camera_y, 2),
    camera_z: asFiniteNumber(body.camera_z, 7.5),
    target_x: asFiniteNumber(body.target_x, 0),
    target_y: asFiniteNumber(body.target_y, 0),
    target_z: asFiniteNumber(body.target_z, 0),
    object_x: asFiniteNumber(body.object_x, 0),
    object_y: asFiniteNumber(body.object_y, 0),
    object_z: asFiniteNumber(body.object_z, 0),
    marker_x: asNullableNumber(body.marker_x),
    marker_y: asNullableNumber(body.marker_y),
    marker_z: asNullableNumber(body.marker_z),
    marker_label: body.marker_label == null ? null : String(body.marker_label),
    view_mode: String(body.view_mode || 'metal:#e2e8f0').trim() || 'metal:#e2e8f0',
    arrows,
    arrowsStr: JSON.stringify(arrows),
    rot_x: asFiniteNumber(body.rot_x, 0),
    rot_y: asFiniteNumber(body.rot_y, 0),
    rot_z: asFiniteNumber(body.rot_z, 0),
    step_order: body.step_order == null ? null : asFiniteNumber(body.step_order, null),
    model_filename,
    model_format
  };
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
  // Public registration creates students. Only an authenticated professor can create professors.
  let userRole = 'student';
  if (role === 'professor') {
    if (req.session.userId && req.session.userRole === 'professor') {
      userRole = 'professor';
    } else {
      return res.status(403).json({ error: 'Solo un profesor autenticado puede crear cuentas de profesor.' });
    }
  }
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
// MODELS REPOSITORY LIST / LIBRARY UPLOAD
// ----------------------------------------------------
app.get('/api/models', (req, res) => {
  try {
    res.json({ models: listLibraryModels() });
  } catch (err) {
    res.status(500).json({ error: 'Error al leer modelos: ' + err.message });
  }
});

app.post('/api/models', requireAuth, requireProfessor, (req, res) => {
  upload.fields([
    { name: 'modelFiles', maxCount: 40 },
    { name: 'modelFile', maxCount: 40 }
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    const files = [
      ...(req.files?.modelFiles || []),
      ...(req.files?.modelFile || [])
    ];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Sube al menos un archivo .obj o .stl' });
    }
    const models = files.map((file) => ({
      filename: file.filename,
      format: path.extname(file.filename).toLowerCase().replace('.', ''),
      sizeBytes: file.size,
      originalName: file.originalname
    }));
    res.status(201).json({ models, message: `${models.length} modelo(s) añadidos a la biblioteca` });
  });
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
  const presId = parseId(req.params.id);
  if (!presId) {
    return res.status(400).json({ error: 'ID de presentación inválido' });
  }
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

    const formattedSlides = slides.map(s => {
      let parsedArrows = [];
      try {
        parsedArrows = s.arrows ? JSON.parse(s.arrows) : [];
      } catch (e) {
        parsedArrows = [];
      }
      return {
        ...s,
        model_filename: s.model_filename || pres.model_filename,
        model_format: s.model_format || pres.model_format,
        arrows: parsedArrows
      };
    });

    res.json({ presentation: pres, slides: formattedSlides });
  } catch (err) {
    res.status(500).json({ error: 'Error al cargar tour: ' + err.message });
  }
});

app.post('/api/presentations', requireAuth, requireProfessor, (req, res) => {
  upload.single('modelFile')(req, res, err => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    const { title, description, category, existing_filename } = req.body;
    const cleanTitle = normalizeTitle(title);
    if (!cleanTitle) {
      return res.status(400).json({ error: 'El título es requerido' });
    }

    let modelFilename = '';
    let modelFormat = 'obj';

    try {
      if (req.file) {
        modelFilename = req.file.filename;
        modelFormat = path.extname(req.file.filename).toLowerCase().replace('.', '');
      } else if (existing_filename) {
        const resolved = resolveLibraryModel(existing_filename);
        modelFilename = resolved.model_filename;
        modelFormat = resolved.model_format;
      } else {
        const library = listLibraryModels();
        if (library.length === 0) {
          return res.status(400).json({
            error: 'La biblioteca 3D está vacía. Sube al menos un STL/OBJ en Archivos 3D antes de crear una presentación.'
          });
        }
        modelFilename = library[0].filename;
        modelFormat = library[0].format;
      }
    } catch (resolveErr) {
      return res.status(400).json({ error: resolveErr.message });
    }

    const userId = req.session.userId;

    try {
      const created = withTransaction(() => {
        const result = db.prepare(`
          INSERT INTO presentations (title, description, category, model_filename, model_format, user_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          cleanTitle,
          (description || '').trim(),
          (category || 'General').trim(),
          modelFilename,
          modelFormat,
          userId
        );

        const presId = result.lastInsertRowid;

        db.prepare(`
          INSERT INTO slides (
            presentation_id, step_order, title, description,
            camera_x, camera_y, camera_z,
            target_x, target_y, target_z,
            object_x, object_y, object_z,
            marker_x, marker_y, marker_z, marker_label,
            view_mode, arrows,
            rot_x, rot_y, rot_z,
            model_filename, model_format
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          presId, 1,
          '1. Vista General',
          'Inicio del recorrido 3D. Explora el modelo en 360 grados.',
          0, 3, 8,
          0, 0, 0,
          0, 0, 0,
          null, null, null, null,
          'metal:#e2e8f0', '[]',
          0, 0, 0,
          modelFilename, modelFormat
        );

        return { id: Number(presId), model_filename: modelFilename, model_format: modelFormat };
      });

      res.status(201).json({
        id: created.id,
        model_filename: created.model_filename,
        model_format: created.model_format,
        message: 'Presentación creada con éxito'
      });
    } catch (dbErr) {
      res.status(500).json({ error: 'Error al crear presentación: ' + dbErr.message });
    }
  });
});

app.put('/api/presentations/:id', requireAuth, requireProfessor, (req, res) => {
  const { title, description, category } = req.body;
  const presId = parseId(req.params.id);
  if (!presId) {
    return res.status(400).json({ error: 'ID de presentación inválido' });
  }
  try {
    const owned = getOwnedPresentation(presId, req.session.userId);
    if (!owned) {
      return res.status(404).json({ error: 'Presentación no encontrada o sin permiso' });
    }
    db.prepare(`
      UPDATE presentations
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          category = COALESCE(?, category)
      WHERE id = ? AND user_id = ?
    `).run(
      title == null ? null : normalizeTitle(title) || null,
      description == null ? null : String(description).trim(),
      category == null ? null : String(category).trim(),
      presId,
      req.session.userId
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar presentación: ' + err.message });
  }
});

app.delete('/api/presentations/:id', requireAuth, requireProfessor, (req, res) => {
  const presId = parseId(req.params.id);
  if (!presId) {
    return res.status(400).json({ error: 'ID de presentación inválido' });
  }
  try {
    const owned = getOwnedPresentation(presId, req.session.userId);
    if (!owned) {
      return res.status(404).json({ error: 'Presentación no encontrada o sin permiso' });
    }
    db.prepare('DELETE FROM presentations WHERE id = ? AND user_id = ?').run(presId, req.session.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar presentación: ' + err.message });
  }
});

// ----------------------------------------------------
// SLIDES ENDPOINTS (CÁMARA, FLECHAS 3D, MATERIALES, MARCADORES)
// ----------------------------------------------------
app.post('/api/presentations/:id/slides', requireAuth, requireProfessor, (req, res) => {
  const presId = parseId(req.params.id);
  if (!presId) {
    return res.status(400).json({ error: 'ID de presentación inválido' });
  }

  try {
    const owned = getOwnedPresentation(presId, req.session.userId);
    if (!owned) {
      return res.status(404).json({ error: 'Presentación no encontrada o sin permiso' });
    }

    const body = { ...req.body };
    if (!body.model_filename) {
      body.model_filename = owned.model_filename;
      body.model_format = owned.model_format;
    }
    const payload = buildSlidePayload(body, { requireModel: true });
    const maxOrderRow = db.prepare('SELECT MAX(step_order) as maxOrder FROM slides WHERE presentation_id = ?').get(presId);
    const nextOrder = (maxOrderRow && maxOrderRow.maxOrder !== null) ? maxOrderRow.maxOrder + 1 : 1;

    const result = db.prepare(`
      INSERT INTO slides (
        presentation_id, step_order, title, description,
        camera_x, camera_y, camera_z,
        target_x, target_y, target_z,
        object_x, object_y, object_z,
        marker_x, marker_y, marker_z, marker_label,
        view_mode, arrows,
        rot_x, rot_y, rot_z,
        model_filename, model_format
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      presId,
      nextOrder,
      payload.title,
      payload.description,
      payload.camera_x,
      payload.camera_y,
      payload.camera_z,
      payload.target_x,
      payload.target_y,
      payload.target_z,
      payload.object_x,
      payload.object_y,
      payload.object_z,
      payload.marker_x,
      payload.marker_y,
      payload.marker_z,
      payload.marker_label,
      payload.view_mode,
      payload.arrowsStr,
      payload.rot_x,
      payload.rot_y,
      payload.rot_z,
      payload.model_filename,
      payload.model_format
    );

    syncPresentationCover(presId);

    res.status(201).json({
      slide: {
        id: result.lastInsertRowid,
        presentation_id: Number(presId),
        step_order: nextOrder,
        title: payload.title,
        description: payload.description,
        camera_x: payload.camera_x,
        camera_y: payload.camera_y,
        camera_z: payload.camera_z,
        target_x: payload.target_x,
        target_y: payload.target_y,
        target_z: payload.target_z,
        object_x: payload.object_x,
        object_y: payload.object_y,
        object_z: payload.object_z,
        marker_x: payload.marker_x,
        marker_y: payload.marker_y,
        marker_z: payload.marker_z,
        marker_label: payload.marker_label,
        view_mode: payload.view_mode,
        arrows: payload.arrows,
        rot_x: payload.rot_x,
        rot_y: payload.rot_y,
        rot_z: payload.rot_z,
        model_filename: payload.model_filename,
        model_format: payload.model_format
      }
    });
  } catch (err) {
    const status = /requerido|inválid|JSON|array|Flecha|modelo|biblioteca/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: 'Error al crear slide: ' + err.message });
  }
});

app.put('/api/presentations/:id/slides/:slideId', requireAuth, requireProfessor, (req, res) => {
  const presId = parseId(req.params.id);
  const slideId = parseId(req.params.slideId);
  if (!presId || !slideId) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const owned = getOwnedPresentation(presId, req.session.userId);
    if (!owned) {
      return res.status(404).json({ error: 'Presentación no encontrada o sin permiso' });
    }

    const existing = db.prepare('SELECT * FROM slides WHERE id = ? AND presentation_id = ?').get(slideId, presId);
    if (!existing) {
      return res.status(404).json({ error: 'Slide no encontrado' });
    }

    const payload = buildSlidePayload({
      ...existing,
      ...req.body,
      title: req.body.title != null ? req.body.title : existing.title,
      description: req.body.description != null ? req.body.description : existing.description,
      arrows: req.body.arrows !== undefined ? req.body.arrows : existing.arrows,
      model_filename: req.body.model_filename !== undefined ? req.body.model_filename : existing.model_filename,
      model_format: req.body.model_format !== undefined ? req.body.model_format : existing.model_format
    }, { requireModel: true });

    db.prepare(`
      UPDATE slides
      SET title = ?,
          description = ?,
          step_order = COALESCE(?, step_order),
          camera_x = ?,
          camera_y = ?,
          camera_z = ?,
          target_x = ?,
          target_y = ?,
          target_z = ?,
          object_x = ?,
          object_y = ?,
          object_z = ?,
          marker_x = ?,
          marker_y = ?,
          marker_z = ?,
          marker_label = ?,
          view_mode = ?,
          arrows = ?,
          rot_x = ?,
          rot_y = ?,
          rot_z = ?,
          model_filename = ?,
          model_format = ?
      WHERE id = ? AND presentation_id = ?
    `).run(
      payload.title,
      payload.description,
      payload.step_order,
      payload.camera_x,
      payload.camera_y,
      payload.camera_z,
      payload.target_x,
      payload.target_y,
      payload.target_z,
      payload.object_x,
      payload.object_y,
      payload.object_z,
      payload.marker_x,
      payload.marker_y,
      payload.marker_z,
      payload.marker_label,
      payload.view_mode,
      payload.arrowsStr,
      payload.rot_x,
      payload.rot_y,
      payload.rot_z,
      payload.model_filename,
      payload.model_format,
      slideId,
      presId
    );

    syncPresentationCover(presId);

    res.json({ success: true, message: 'Slide actualizado' });
  } catch (err) {
    const status = /requerido|inválid|JSON|array|Flecha|modelo|biblioteca/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: 'Error al actualizar slide: ' + err.message });
  }
});

app.delete('/api/presentations/:id/slides/:slideId', requireAuth, requireProfessor, (req, res) => {
  const presId = parseId(req.params.id);
  const slideId = parseId(req.params.slideId);
  if (!presId || !slideId) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const owned = getOwnedPresentation(presId, req.session.userId);
    if (!owned) {
      return res.status(404).json({ error: 'Presentación no encontrada o sin permiso' });
    }
    const result = db.prepare('DELETE FROM slides WHERE id = ? AND presentation_id = ?').run(slideId, presId);
    if (!result.changes) {
      return res.status(404).json({ error: 'Slide no encontrado' });
    }
    syncPresentationCover(presId);
    res.json({ success: true, message: 'Slide eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar slide: ' + err.message });
  }
});

// Reorder slides
app.post('/api/presentations/:id/slides/reorder', requireAuth, requireProfessor, (req, res) => {
  const presId = parseId(req.params.id);
  const { slideIds } = req.body;
  if (!presId) {
    return res.status(400).json({ error: 'ID de presentación inválido' });
  }
  if (!Array.isArray(slideIds)) {
    return res.status(400).json({ error: 'slideIds debe ser un array' });
  }

  try {
    const owned = getOwnedPresentation(presId, req.session.userId);
    if (!owned) {
      return res.status(404).json({ error: 'Presentación no encontrada o sin permiso' });
    }

    withTransaction(() => {
      const updateStmt = db.prepare('UPDATE slides SET step_order = ? WHERE id = ? AND presentation_id = ?');
      slideIds.forEach((id, index) => {
        const slideId = parseId(id);
        if (!slideId) throw new Error('slideIds contiene un id inválido');
        updateStmt.run(index + 1, slideId, presId);
      });
    });
    res.json({ success: true, message: 'Orden actualizado' });
  } catch (err) {
    const status = /inválido/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: 'Error al reordenar slides: ' + err.message });
  }
});

// Public network hints for QR / phone access on the LAN (no auth).
app.get('/api/public/network', (req, res) => {
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    const addresses = [];
    for (const entries of Object.values(nets)) {
      for (const net of entries || []) {
        const family = net.family === 4 || net.family === 'IPv4';
        if (family && !net.internal) addresses.push(net.address);
      }
    }
    res.json({
      port: Number(PORT),
      addresses,
      hint: 'Use a LAN address in the QR so phones on the same Wi‑Fi can open the viewer without login.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Unable to read network interfaces: ' + err.message });
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

// Start Server — bind all interfaces so QR/LAN phones can reach the viewer
app.listen(PORT, '0.0.0.0', () => {
  console.log(`GhostPPT Server running on http://localhost:${PORT}`);
  console.log(`LAN viewer (same Wi‑Fi): http://<your-ip>:${PORT}`);
});
