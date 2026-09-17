# GhostPPT User Guide (English)

Open-source local 3D presentation studio by [aoxilus](https://github.com/aoxilus).  
UI language: use the **EN / ES** toggle in the studio header.

## Sign in vs public viewer

| Surface | Login |
|---------|--------|
| **3D Editor** (create / edit) | Required |
| **Public viewer** (Share / QR link) | Not required |

The initial owner username is `oscar`. Set `GHOSTPPT_INITIAL_PASSWORD` before the first database init. Never put passwords in source or docs.

## 3D Files library

1. Open the **3D Files** tab.
2. Upload one or many `.stl` / `.obj` files.
3. Files go into the **library only** — uploading does **not** create a presentation.

Use **Usar en slide activo / Use on active slide** once a presentation is open.

## Create a presentation

1. Sign in to the editor.
2. In the presentation selector, choose **New Presentation** and enter a title.
3. Slide 1 starts with a library model (or the first available file).

## Edit slides (per-slide model)

1. Select a slide in the bottom timeline.
2. Choose **Slide model** in the toolbar — each slide can use a different STL/OBJ.
3. Use the right palette: 3D Arrow, Marker, Text, Clean, Auto Center, rotations, materials.
4. Changes **autosave** to SQLite (status shows Saved). There is no separate Save button.

Tips:

- **Copy elements to next** — when creating a new slide, optionally copy annotations from the current one.
- Switch slides freely; the viewer reloads that slide’s model when needed.

## Backgrounds

Editor and public viewer each have Background: White, Dark, Solid color, Gradient. Gradient colors stay in local browser storage.

## Share / QR (viewer only)

1. Open a presentation in the editor.
2. Click **Share / QR**.
3. Copy the public URL, download a PNG QR for PowerPoint, or copy embed HTML.

The link opens the **public viewer only** — never the editor. On the same Wi‑Fi, the QR prefers your computer’s LAN IP so phones can connect.

Audience can navigate slides and change viewer background; they cannot edit the deck.

## Run locally

```powershell
npm install
npm start
```

Open <http://localhost:3000/>. Requires Node.js 22+.

## License

CC BY-NC-SA 4.0. Made with 🥑 by [aoxilus](https://github.com/aoxilus).
