# Guía de usuario de GhostPPT (Español)

Estudio local de presentaciones 3D de código abierto por [aoxilus](https://github.com/aoxilus).  
Idioma de la interfaz: interruptor **EN / ES** en la barra superior.

## Inicio de sesión vs visor público

| Superficie | Login |
|------------|--------|
| **Editor 3D** (crear / editar) | Obligatorio |
| **Visor público** (enlace Share / QR) | No requiere |

El usuario inicial del propietario es `oscar`. Configura `GHOSTPPT_INITIAL_PASSWORD` antes de la primera inicialización. Nunca pongas contraseñas en el código ni en la documentación.

## Biblioteca Archivos 3D

1. Abre la pestaña **Archivos 3D**.
2. Sube uno o varios archivos `.stl` / `.obj`.
3. Los archivos van solo a la **biblioteca** — subir **no** crea una presentación.

Usa **Usar en slide activo** cuando ya tengas una presentación abierta.

## Crear una presentación

1. Inicia sesión en el editor.
2. En el selector de presentaciones, elige **New Presentation** / nueva y escribe un título.
3. El slide 1 arranca con un modelo de la biblioteca (o el primero disponible).

## Editar slides (modelo por slide)

1. Selecciona un slide en la línea de tiempo inferior.
2. Elige **Modelo del slide** en la barra — cada slide puede usar un STL/OBJ distinto.
3. Usa el panel derecho: Flecha 3D, Marcador, Texto, Limpiar, Auto Center, rotaciones, materiales.
4. Los cambios se **guardan solos** en SQLite (estado Saved). No hay botón Guardar aparte.

Consejos:

- **Copiar elementos al siguiente** — al crear un slide nuevo, puedes copiar anotaciones del actual.
- Cambia de slide con libertad; el visor recarga el modelo de ese slide cuando hace falta.

## Fondos

El editor y el visor público tienen Background: White, Dark, Solid color, Gradient. Los colores del gradiente se guardan en el navegador.

## Share / QR (solo viewer)

1. Abre una presentación en el editor.
2. Pulsa **Share / QR** / Compartir.
3. Copia la URL pública, descarga un PNG QR para PowerPoint o copia el HTML embebido.

El enlace abre **solo el visor público** — nunca el editor. En la misma Wi‑Fi, el QR prioriza la IP LAN de tu PC para que el celular pueda entrar.

El público puede navegar slides y cambiar el fondo del viewer; no puede editar el deck.

## Ejecutar en local

```powershell
npm install
npm start
```

Abre <http://localhost:3000/>. Requiere Node.js 22+.

## Licencia

CC BY-NC-SA 4.0. Made with 🥑 by [aoxilus](https://github.com/aoxilus).
