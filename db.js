const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Enable foreign keys and WAL mode
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Initialize database schema
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'professor', -- 'professor' or 'student'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS presentations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'General',
      model_filename TEXT NOT NULL,
      model_format TEXT NOT NULL, -- 'obj' or 'stl'
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      presentation_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      camera_x REAL NOT NULL DEFAULT 0,
      camera_y REAL NOT NULL DEFAULT 2,
      camera_z REAL NOT NULL DEFAULT 6,
      target_x REAL NOT NULL DEFAULT 0,
      target_y REAL NOT NULL DEFAULT 0,
      target_z REAL NOT NULL DEFAULT 0,
      marker_x REAL,
      marker_y REAL,
      marker_z REAL,
      marker_label TEXT,
      view_mode TEXT DEFAULT 'metal:#e2e8f0', -- 'plain', 'metal:#hex', 'wireframe', 'texture'
      arrows TEXT DEFAULT '[]', -- JSON array of {start: {x,y,z}, end: {x,y,z}}
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
    );
  `);

  // Ensure columns exist if table already existed without them
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN marker_x REAL;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN marker_y REAL;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN marker_z REAL;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN marker_label TEXT;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN view_mode TEXT DEFAULT 'plain';`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN arrows TEXT DEFAULT '[]';`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN rot_x REAL DEFAULT 0;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN rot_y REAL DEFAULT 0;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE slides ADD COLUMN rot_z REAL DEFAULT 0;`);
  } catch (e) {}

  // Check if we need to seed demo data
  const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (!userCountRow || userCountRow.count === 0) {
    const profPass = bcrypt.hashSync('prof123', 10);
    const studentPass = bcrypt.hashSync('student123', 10);

    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?)
    `);

    const profRes = insertUser.run('profesor', profPass, 'Prof. Alex Mercer', 'professor');
    insertUser.run('estudiante', studentPass, 'Estudiante Demo', 'student');
    const profId = profRes.lastInsertRowid;

    const insertPres = db.prepare(`
      INSERT INTO presentations (title, description, category, model_filename, model_format, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertSlide = db.prepare(`
      INSERT INTO slides (
        presentation_id, step_order, title, description,
        camera_x, camera_y, camera_z,
        target_x, target_y, target_z,
        marker_x, marker_y, marker_z, marker_label,
        view_mode, arrows
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Tour 1: ED-209 Mecha Robot (Con flechas y marcadores reales de 3D-OBJ-Viewer-Show)
    const pres1 = insertPres.run(
      'ED-209 Mecha & Articulaciones Robóticas',
      'Inspección cinemática detallada del bípedo ED-209 con flechas vectoriales 3D en piernas, torreta y armamento.',
      'Robótica y Mecatrónica',
      'ImageToStl.com_ed2zero9.obj',
      'obj',
      profId
    );
    const p1Id = pres1.lastInsertRowid;

    const arrowsSlide1 = JSON.stringify([
      { start: { x: 0.37, y: -0.04, z: -35.6 }, end: { x: 0.38, y: 0.04, z: -35.55 } },
      { start: { x: 0.50, y: -0.18, z: -34.98 }, end: { x: 0.50, y: -0.24, z: -34.96 } },
      { start: { x: 0.48, y: -0.16, z: -34.95 }, end: { x: 0.49, y: -0.18, z: -34.95 } },
      { start: { x: 0.35, y: -0.01, z: -35.53 }, end: { x: 0.38, y: 0.12, z: -35.46 } },
      { start: { x: 0.37, y: 0.19, z: -35.39 }, end: { x: 0.45, y: 0.22, z: -35.41 } }
    ]);

    insertSlide.run(
      p1Id, 1,
      '1. Articulación de Pierna Superior & Actuadores',
      'Sistema de amortiguación hidráulica y pivote de rodilla reforzado con aleación de titanio.',
      0.73, 0.02, -35.18,
      0.40, -0.02, -34.85,
      0.405, -0.018, -34.846, 'Pivote Hidráulico',
      'plain', arrowsSlide1
    );

    const arrowsSlide2 = JSON.stringify([
      { start: { x: 0.21, y: 0.07, z: -34.70 }, end: { x: 0.14, y: 0.09, z: -34.70 } },
      { start: { x: -0.21, y: 0.07, z: -34.70 }, end: { x: -0.14, y: 0.09, z: -34.70 } }
    ]);

    insertSlide.run(
      p1Id, 2,
      '2. Chasis Frontal y Sistema de Visión LIDAR',
      'Módulo sensor frontal con visor de escaneo continuo y protección balística frontal.',
      -0.03, 0.15, -33.9,
      0.01, -0.10, -34.70,
      0.015, -0.100, -34.702, 'Sensores Centrales',
      'texture', arrowsSlide2
    );

    insertSlide.run(
      p1Id, 3,
      '3. Ensamblaje de Malla Alámbrica (Wireframe)',
      'Estructura de polígonos y topología de baja densidad optimizada para render en tiempo real.',
      1.2, 0.8, -34.2,
      0, 0, -34.8,
      null, null, null, null,
      'wireframe', '[]'
    );

    // Tour 2: Operador Robot
    const pres2 = insertPres.run(
      'Robot Operador & Diseño Modular',
      'Recorrido de inspección geométrica para automatización industrial.',
      'Ingeniería Industrial',
      'robot_operator.obj',
      'obj',
      profId
    );
    const p2Id = pres2.lastInsertRowid;

    insertSlide.run(
      p2Id, 1,
      '1. Vista General del Operador',
      'Unidad autónoma bípeda para operaciones en planta y logística de almacén.',
      0, 1.5, 4.5,
      0, 0, 0,
      0, 0.8, 0.2, 'Unidad de Control',
      'texture', '[]'
    );

    insertSlide.run(
      p2Id, 2,
      '2. Cinemática de Brazos Manipuladores',
      'Extremidades superiores con 6 grados de libertad para manipulación de alta precisión.',
      -1.8, 1.2, 2.5,
      -0.5, 0.5, 0,
      -0.8, 0.6, 0.1, 'Actuador de Brazo',
      'plain', '[]'
    );

    // Tour 3: Silbato de Alta Eficiencia
    const pres3 = insertPres.run(
      'Silbato Acústico V2 (Aerodinámica y Resonancia)',
      'Diseño acústico optimizado para resonancia y cámaras de flujo de aire.',
      'Diseño 3D & Acústica',
      'whistle_v2.obj',
      'obj',
      profId
    );
    const p3Id = pres3.lastInsertRowid;

    insertSlide.run(
      p3Id, 1,
      '1. Boquilla y Cámara de Resonancia',
      'El aire ingresa comprimido provocando vórtices turbulentos que generan la onda sonora.',
      0, 2, 4,
      0, 0, 0,
      0, 0.3, 0, 'Cámara Vórtice',
      'plain', '[]'
    );
  }

  // Ensure the local owner account exists even when the database was
  // initialized by an older version of GhostPPT.
  const initialUsername = 'oscar';
  const initialUser = db.prepare('SELECT id FROM users WHERE username = ?').get(initialUsername);
  const initialPassword = process.env.GHOSTPPT_INITIAL_PASSWORD;
  if (!initialUser && initialPassword) {
    const initialPasswordHash = bcrypt.hashSync(initialPassword, 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?)
    `).run(initialUsername, initialPasswordHash, 'Oscar', 'professor');
  } else if (!initialUser) {
    console.warn('GHOSTPPT_INITIAL_PASSWORD is not set; the Oscar account was not created.');
  }

  // One-time migration for the original white/matte starter slides.
  // After this version, a user-selected matte slide remains matte.
  const schemaVersion = db.prepare('PRAGMA user_version').get().user_version || 0;
  if (schemaVersion < 2) {
    db.exec(`
      UPDATE slides
      SET view_mode = 'metal:#e2e8f0'
      WHERE view_mode IS NULL OR view_mode = 'plain';
      PRAGMA user_version = 2;
    `);
  }

  // Make the first slide of an older local tour open in silver chrome.
  // Later slides keep their individually saved material.
  const currentVersion = db.prepare('PRAGMA user_version').get().user_version || 0;
  if (currentVersion < 3) {
    db.exec(`
      UPDATE slides
      SET view_mode = 'metal:#e2e8f0'
      WHERE id IN (
        SELECT MIN(id)
        FROM slides
        GROUP BY presentation_id
      );
      PRAGMA user_version = 3;
    `);
  }
}

initDB();

module.exports = db;
