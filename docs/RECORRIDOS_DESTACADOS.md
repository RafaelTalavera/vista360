# Recorridos destacados en el inicio

El inicio (`/inicio#recorridos`) presenta hasta cuatro recorridos elegidos por la administración de Vision360. Las tarjetas muestran título publicado, tipo de espacio, descripción editorial, portada del ambiente inicial y una etiqueta «Demostración» cuando corresponde. El enlace abre el visor público `/tour/{slug}` sin registro.

## Administración

1. Iniciar sesión con una cuenta incluida en `PLATFORM_ADMIN_USER_IDS`.
2. Abrir **Administración → Recorridos destacados** (`/studio/destacados`).
3. Buscar el recorrido por su título publicado. La búsqueda recorre las publicaciones de toda la plataforma, está paginada y sólo es accesible para la administración.
4. Elegir uno de los cuatro lugares, un recorrido publicado, su categoría y una descripción breve (hasta 240 caracteres).
5. Mantener **Mostrar como demostración** si las imágenes son de prueba. Desmarcarlo únicamente para trabajos reales autorizados.
6. Confirmar que se tiene autorización para mostrar el recorrido y sus imágenes, y guardar.

La confirmación de autorización debe marcarse en cada guardado. No representa una validación automática de derechos de las imágenes. No se seleccionan trabajos automáticamente ni se modifica su contenido.

**Quitar del inicio** elimina sólo la selección editorial. Conserva el trabajo, las fotos, la publicación y el enlace de entrega.

## Publicaciones y rendimiento

- Se muestran únicamente recorridos con una versión pública activa. Los borradores y los cambios pendientes no se exponen.
- Al retirar una publicación, el recorrido desaparece de la selección pública en la siguiente carga del inicio. La configuración queda en administración como «Oculto»; si se vuelve a publicar, aparece nuevamente.
- Una nueva versión publicada actualiza título y portada, conservando el lugar, la descripción y la etiqueta configurados.
- Al borrar un recorrido, su selección editorial se elimina por clave foránea.
- La portada usa la variante más pequeña ya publicada del ambiente inicial. No se duplican fotos ni se crean visores WebGL en el inicio.
- Las imágenes se cargan de forma diferida. Si falla una portada, el título y el enlace siguen disponibles.
- La respuesta pública contiene únicamente datos de la tarjeta, sin emails, IDs de titulares ni información de clientes. No se almacena en caché la selección para evitar conservar tarjetas de recorridos retirados.
- Español y portugués disponibles para la interfaz. Títulos y descripciones editoriales conservan el idioma en que se escribieron.

## Despliegue

La migración `0021_featured_tours` agrega una tabla vacía; no selecciona ni publica datos existentes. El contenedor ejecuta `alembic upgrade head` mediante `app.demo` al arrancar. Para un backend iniciado sin ese supervisor, ejecutar desde `backend`:

```sh
.venv/bin/python -m alembic upgrade head
```

No se agregan dependencias ni variables de entorno. Al desplegar habrá que elegir los ejemplos desde la cuenta administradora; no habrá trabajos destacados hasta hacerlo.

## Verificación

Las pruebas de backend usan una base PostgreSQL temporal y verifican permisos, CSRF, autorización explícita, cuatro lugares, duplicados, búsquedas, paginación, privacidad de borradores, retiro de publicaciones, portada pública y migración de ida y vuelta. Las pruebas de navegador recorren la selección administrativa, la persistencia, ambos idiomas y la apertura anónima del visor en escritorio y celular simulado.
