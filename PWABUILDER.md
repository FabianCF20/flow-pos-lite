# Generar APK con PWABuilder

1. Publica la app (Vercel/Netlify/Cloudflare). PWABuilder necesita HTTPS público.
2. Abre https://www.pwabuilder.com y pega la URL publicada.
3. Verifica el score: Manifest, Service Worker e Iconos deben estar en verde.
4. Pulsa **Package For Stores → Android**.
   - Package ID sugerido: `app.poslite.offline` (cámbialo si tienes el tuyo).
   - Display mode: `standalone`.
   - Signing: deja que PWABuilder genere la keystore y **guárdala** (la necesitarás para futuras actualizaciones).
5. Descarga el ZIP. Dentro vienen:
   - `app-release-signed.apk` → instalable directo en Android.
   - `app-release-bundle.aab` → para subir a Google Play.
   - `assetlinks.json` → cópialo a `public/.well-known/assetlinks.json` y vuelve a desplegar para habilitar TWA sin barra de URL.

## Checklist ya cubierto en el repo

- `public/manifest.webmanifest` con `name`, `short_name`, `id`, `start_url`, `scope`, `display`, `theme_color`, `background_color`, `icons` (any + maskable), `screenshots`, `shortcuts`, `launch_handler`.
- `public/sw.js` registrado en `src/routes/__root.tsx` con cache offline.
- Iconos PNG reales 192 y 512.
- Capturas móvil (540x960) y escritorio (1280x800).