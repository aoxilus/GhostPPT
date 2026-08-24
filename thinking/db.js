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
      role TEXT NOT NULL DEFAULT 'professor',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS presentations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'General',
      model_filename TEXT NOT NULL,
      model_format TEXT NOT NULL,
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
      camera_y REAL NOT NULL DEFAULT 4,
      camera_z REAL NOT NULL DEFAULT 12,
      target_x REAL NOT NULL DEFAULT 0,
      target_y REAL NOT NULL DEFAULT 0,
      target_z REAL NOT NULL DEFAULT 0,
      hotspot_x REAL,
      hotspot_y REAL,
      hotspot_z REAL,
      hotspot_label TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
    );
  `);

  // Create demo users and presentation if DB is fresh
  const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (!userCountRow || userCountRow.count === 0) {
    const profPass = bcrypt.hashSync('prof123', 10);
    const studentPass = bcrypt.hashSync('student123', 10);

    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?)
    `);

    const profRes = insertUser.run('profesor', profPass, 'Dr. Alejandro Soto', 'professor');
    insertUser.run('estudiante', studentPass, 'Valeria Gomez', 'student');

    const insertPres = db.prepare(`
      INSERT INTO presentations (title, description, category, model_filename, model_format, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const presRes = insertPres.run(
      'Anatomía del Corazón y Flujo Cardíaco',
      'Recorrido anatómico interactivo 3D con marcadores tridimensionales y descripción de cavidades.',
      'Medicina y Biología',
      'demo_heart.obj',
      'obj',
      profRes.lastInsertRowid
    );

    const presId = presRes.lastInsertRowid;

    const insertSlide = db.prepare(`
      INSERT INTO slides (
        presentation_id, step_order, title, description,
        camera_x, camera_y, camera_z,
        target_x, target_y, target_z,
        hotspot_x, hotspot_y, hotspot_z, hotspot_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertSlide.run(
      presId, 1,
      '1. Vista General del Órgano',
      'El corazón es un órgano muscular hueco con cuatro cámaras principales que impulsa el ciclo cardiovascular continuo.',
      0, 4, 12,
      0, 0, 0,
      0, 1.2, 0.5, 'Ventrículo y Miocardio'
    );

    insertSlide.run(
      presId, 2,
      '2. Arco Aórtico y Arterias Principales',
      'La arteria aorta es la principal arteria sistémica, distribuyendo sangre oxigenada a todo el organismo a alta presión.',
      -3.5, 6, 6,
      0, 2.2, 0,
      -0.8, 3.2, 0.4, 'Arco Aórtico'
    );

    insertSlide.run(
      presId, 3,
      '3. Ventrículo Derecho y Vena Cava',
      'Zona receptora y de bombeo hacia la arteria pulmonar para el intercambio gaseoso en los pulmones.',
      4.5, 2, 6,
      0, 0, 0,
      1.8, 0.4, 0.3, 'Vena Cava & Aurícula Derecha'
    );
  }
}

initDB();

module.exports = db;
