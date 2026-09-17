# Guía de usuario de GhostPPT

## Inicio de sesión

El editor está protegido por una sesión. El visor público no requiere iniciar sesión.

El usuario inicial del propietario es `oscar`. Configura `GHOSTPPT_INITIAL_PASSWORD` antes de inicializar la base de datos por primera vez; nunca coloques la contraseña en el código fuente ni en la documentación.

## Crear y editar presentaciones

1. Inicia sesión en el editor.
2. Selecciona un modelo desde el selector Model.
3. Usa el selector superior de presentaciones para abrir una presentación existente o elegir **New Presentation**.
4. Usa el panel derecho para agregar flechas, marcadores, notas, materiales, rotaciones y Auto Center.
5. Usa la línea de tiempo inferior para seleccionar slides, crear una slide nueva o borrar la slide actual.

Los cambios de las slides se guardan automáticamente en SQLite. No existe un botón manual de guardar. Los cambios de cámara, Auto Center, rotaciones, materiales, anotaciones, marcadores, flechas, títulos y limpieza activan el autosave.

## Fondos

El editor y el visor público tienen su propio selector Background con estas opciones:

- White
- Dark
- Solid color
- Gradient

Los colores inicial y final del gradiente permanecen visibles mientras Gradient está seleccionado y se guardan localmente en el navegador.

## Compartir una presentación

Usa **Share / QR** en el editor para copiar la URL pública, descargar un PNG QR para PowerPoint o copiar el HTML para una página web. El enlace abre el visor público y nunca el editor.

## SQLite

El servidor crea `database.sqlite` y guarda usuarios, presentaciones y estado de las slides. La base de datos es información local de la aplicación y no debe publicarse con credenciales reales ni contenido privado.
