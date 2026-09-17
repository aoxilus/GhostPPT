# GhostPPT User Guide

## Sign in

The editor is protected by a session login. The public viewer does not require a login.

The initial owner username is `oscar`. Set `GHOSTPPT_INITIAL_PASSWORD` before the first database initialization; never place the password in source code or documentation.

## Create and edit presentations

1. Sign in to the editor.
2. Select a model from the Model selector.
3. Use the top presentation selector to open an existing presentation or choose **New Presentation**.
4. Use the right tool palette to add arrows, markers, notes, materials, rotations, and Auto Center.
5. Use the bottom timeline to select slides, create a new slide, or delete the current slide.

Slide changes are autosaved to SQLite. There is no manual save button. Camera changes, Auto Center, rotations, materials, annotations, markers, arrows, slide titles, and cleanup actions all trigger autosave.

## Backgrounds

The editor and public viewer each have a Background selector with:

- White
- Dark
- Solid color
- Gradient

Gradient start and end colors remain visible while Gradient is selected and are stored locally in the browser.

## Share a presentation

Use **Share / QR** in the editor to copy the public URL, download a QR PNG for PowerPoint, or copy website embed HTML. The generated link opens the public viewer route and never the editor.

## SQLite

The server creates `database.sqlite` and stores users, presentations, and slide state. The database is local application data and should not be committed with real credentials or private content.
