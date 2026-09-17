# GhostPPT 🥑

GhostPPT is a local-first 3D presentation studio by [aoxilus](https://github.com/aoxilus). Professors can load OBJ/STL models, create camera slides, add markers and arrows, select materials, and share a public viewer with a descriptive URL or QR code.

> **QA note:** automated end-to-end QA is still pending. Smoke tests covered auth, slide CRUD, autosave, ownership, and the public viewer; full regression QA is recommended before classroom use.

## Requirements

- Node.js 22 or newer
- npm
- A modern browser with WebGL support

Node.js 22+ is required because the server uses the built-in `node:sqlite` module.

## Run locally

```powershell
npm install
npm start
```

Open <http://localhost:3000/>.

For development with automatic server reloads:

```powershell
npm run dev
```

## Authentication

The editor requires a session login. Public presentation viewers do not require a login.

The initial owner account is:

- Username: `oscar`
- Password: supplied through `GHOSTPPT_INITIAL_PASSWORD`

Set the environment variable before initializing a new database. Never commit the password or any `.env` file.

The session signing secret should be supplied through `GHOSTPPT_SESSION_SECRET`.

## SQLite data

The server creates `database.sqlite` automatically and initializes the users, presentations, and slides tables. Slide changes are saved automatically through the authenticated API.

The database stores:

- Users and bcrypt password hashes
- Presentation titles, model references, and categories
- Slide camera position, rotation, material, arrows, markers, and notes

## Sharing

The editor creates public viewer URLs such as:

```text
/user/oscar/collection/general/presentation/example-presentation/item/4
```

The URL opens `view.html` only. It never opens the editor. The Share / QR dialog can:

- Copy the public viewer link
- Download a PNG QR code for PowerPoint
- Copy HTML that links a website image to the public viewer

The public viewer also has its own background selector for the 3D canvas. The viewer can use a white, dark, custom solid-color, or two-color gradient background without changing the presentation data.

## Documentation

- [English user guide](docs/USER-GUIDE.en.md)
- [Guía de usuario en español](docs/USER-GUIDE.es.md)
- [GitHub Wiki](https://github.com/aoxilus/GhostPPT/wiki)

## Main folders

- `server.js` — Express server and API routes
- `db.js` — SQLite schema, migrations, and bootstrap account
- `public/` — editor and public viewer
- `uploads/` — local OBJ/STL model files
- `database.sqlite` — local SQLite database

## License

CC BY-NC-SA 4.0. See <https://creativecommons.org/licenses/by-nc-sa/4.0/>.

Made with 🥑 by [aoxilus](https://github.com/aoxilus)
