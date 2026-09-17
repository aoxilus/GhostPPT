# GhostPPT 🥑

GhostPPT es un estudio local para crear presentaciones 3D, por [aoxilus](https://github.com/aoxilus). Permite cargar modelos OBJ/STL, crear slides con cámara, agregar marcadores y flechas, seleccionar materiales y compartir un visor público mediante una URL descriptiva o código QR.

> **Nota de QA:** la batería completa de pruebas aún está pendiente. Se verificaron humo de auth, CRUD de slides, autosave, ownership y el visor público; se recomienda QA de regresión antes de uso en clase.

## Requisitos

- Node.js 22 o posterior
- npm
- Un navegador moderno con soporte WebGL

Se requiere Node.js 22+ porque el servidor utiliza el módulo integrado `node:sqlite`.

## Ejecutar localmente

```powershell
npm install
npm start
```

Abre <http://localhost:3000/>.

Para desarrollo con recarga automática:

```powershell
npm run dev
```

## Autenticación

El editor requiere iniciar sesión. Los visores públicos no requieren login.

La cuenta inicial del propietario es:

- Usuario: `oscar`
- Contraseña: se proporciona mediante `GHOSTPPT_INITIAL_PASSWORD`

Configura esa variable antes de inicializar una base nueva. Nunca publiques la contraseña ni archivos `.env`.

La clave de sesión debe proporcionarse mediante `GHOSTPPT_SESSION_SECRET`.

## Datos SQLite

El servidor crea `database.sqlite` automáticamente y prepara las tablas de usuarios, presentaciones y slides. Los cambios de cada slide se guardan mediante autosave.

## Compartir

El editor genera URLs públicas como:

```text
/user/oscar/collection/general/presentation/example-presentation/item/4
```

La URL abre únicamente `view.html`; nunca abre el editor. El diálogo Share / QR permite copiar el enlace público, descargar un PNG para PowerPoint y copiar HTML para una página web.

El editor y el visor público tienen selector de fondo con opciones White, Dark, Solid color y Gradient. Los colores del gradiente se conservan localmente en el navegador.

## Documentación

- [English user guide](docs/USER-GUIDE.en.md)
- [Guía de usuario en español](docs/USER-GUIDE.es.md)
- [GitHub Wiki](https://github.com/aoxilus/GhostPPT/wiki)

## Licencia

CC BY-NC-SA 4.0. Consulta <https://creativecommons.org/licenses/by-nc-sa/4.0/>.

Made with 🥑 by [aoxilus](https://github.com/aoxilus)
