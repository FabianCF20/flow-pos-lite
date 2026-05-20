# Despliegue de la PWA POS Offline

La app es **100% offline**: todos los datos viven en IndexedDB del dispositivo
y un Service Worker cachea el shell. No necesita base de datos ni servidor
propio, sólo un hosting de archivos estáticos con fallback SPA.

## Build

```bash
bun install
bun run build
```

Salida estática: `dist/client/` (esto es lo que se publica).

## Vercel (recomendado, gratis)

1. Sube el repo a GitHub.
2. En vercel.com → **New Project** → importa el repo.
3. Vercel detecta `vercel.json` automáticamente:
   - Build: `bun run build`
   - Output: `dist/client`
   - Rewrites SPA + headers correctos para `sw.js` y `manifest.webmanifest`.
4. Deploy. Listo.

## Netlify

1. **Add new site** → from Git.
2. Detecta `netlify.toml` automáticamente.
3. Deploy.

## Cloudflare Pages

- Build command: `bun run build`
- Output directory: `dist/client`
- En **Settings → Pages → Functions → Compatibility flags**: no requiere.
- Añade en **Settings → Pages → SPA fallback**: `/index.html`.

## Servidor propio (VPS / nginx / Apache)

Sirve el contenido de `dist/client/` como sitio estático. Importante:

- Cualquier ruta desconocida debe responder con `index.html` (SPA fallback).
- `sw.js` debe servirse sin caché (`Cache-Control: no-cache`).
- `manifest.webmanifest` con `Content-Type: application/manifest+json`.
- **HTTPS obligatorio** para que el Service Worker y la instalación como PWA
  funcionen (excepto en `localhost`).

### Ejemplo nginx

```nginx
server {
  listen 443 ssl http2;
  server_name pos.midominio.com;

  root /var/www/pos/dist/client;
  index index.html;

  # Assets con hash → caché eterno
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Service Worker → sin caché
  location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Service-Worker-Allowed "/";
  }

  location = /manifest.webmanifest {
    add_header Content-Type "application/manifest+json";
  }

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

## Instalación en Android

Una vez desplegado en HTTPS, abre la URL en Chrome → menú → **Instalar app**.
Se añade al cajón de apps y funciona sin internet.