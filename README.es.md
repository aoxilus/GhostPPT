# GhostPPT 🥑

**Estudio local de presentaciones 3D** por [aoxilus](https://github.com/aoxilus).

Arma un deck con modelos OBJ/STL, anota en 3D y comparte un enlace o QR de **solo visualización**—el público no necesita iniciar sesión.

[English](README.md) · [Español](README.es.md)

![Editor — slide con un modelo 3D](docs/images/editor-slide-model-a.png)

![Editor — el siguiente slide puede usar otro modelo](docs/images/editor-slide-model-b.png)

## Por qué GhostPPT

- **Una presentación, muchos modelos** — cada slide puede mostrar un STL/OBJ distinto de tu biblioteca
- **Estudio para autores** — flechas, marcadores, notas, materiales, Auto Center, cámaras
- **Reproducción pública** — Share / QR abre solo el viewer (celulares en la misma Wi‑Fi)
- **Local primero** — Node + SQLite en tu PC; sin cuenta en la nube
- **UI bilingüe** — interruptor English / Español

## Inicio rápido

```powershell
npm install
npm start
```

Abre <http://localhost:3000/>.

Requiere **Node.js 22+** (módulo integrado `node:sqlite`).

## Flujo típico

1. **Archivos 3D** — sube tu colección STL/OBJ a la biblioteca (no crea presentaciones)
2. **Nueva presentación** — crea el deck solo con el título
3. **Por slide** — elige el modelo, encuadra la cámara, anota; el autosave guarda en SQLite
4. **Share / QR** — comparte la URL o el QR; el alumno abre el viewer sin login

## Documentación

| | |
|---|---|
| English user guide | [docs/USER-GUIDE.en.md](docs/USER-GUIDE.en.md) |
| Guía en español | [docs/USER-GUIDE.es.md](docs/USER-GUIDE.es.md) |
| Wiki | [github.com/aoxilus/GhostPPT/wiki](https://github.com/aoxilus/GhostPPT/wiki) |

## Auth y compartir

- **Editor** — requiere login (profesores crean y editan)
- **Viewer público** — sin login; las escrituras siguen protegidas
- Usuario inicial: `oscar` (contraseña con `GHOSTPPT_INITIAL_PASSWORD` — nunca la subas al repo)
- Secreto de sesión: `GHOSTPPT_SESSION_SECRET`

En la misma Wi‑Fi, Share / QR usa tu IP LAN para que el celular abra el viewer.

## Licencia

**CC BY-NC-SA 4.0** — <https://creativecommons.org/licenses/by-nc-sa/4.0/>

Código abierto para aprendizaje y uso no comercial. Ver `LICENSE`.

Made with 🥑 by [aoxilus](https://github.com/aoxilus)
