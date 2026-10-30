# Arquitectura del sistema

> Estado: documentación inicial basada en la inspección del código del repositorio. Los detalles funcionales se ampliarán al revisar cada módulo.

## 1. Descripción general

Flow POS Lite es una aplicación web de punto de venta y gestión comercial con arquitectura local-first. La aplicación utiliza una base de datos local en el navegador mediante IndexedDB, gestionada por Dexie. Firebase se utiliza para autenticación, administración de accesos y sincronización parcial de determinados catálogos.

La aplicación incluye una interfaz adaptable a escritorio y dispositivos móviles y recursos para funcionar como PWA.

## 2. Tecnologías identificadas

| Tecnología | Uso observado |
|---|---|
| React 19 | Interfaz de usuario |
| TypeScript | Lenguaje y tipado |
| Vite 7 | Herramienta de desarrollo y compilación |
| TanStack Router / TanStack Start | Enrutamiento y estructura de la aplicación |
| Tailwind CSS 4 | Estilos |
| Dexie 4 | Acceso a IndexedDB |
| Firebase Authentication | Inicio de sesión |
| Cloud Firestore | Perfiles, asignaciones, roles y sincronización parcial |
| Vitest | Pruebas automatizadas |
| Factus | Integración para documentos electrónicos |
| Service Worker | Caché y capacidades PWA |

Las versiones exactas deben confirmarse en `package.json` al actualizar esta documentación.

## 3. Organización del código

- `src/routes/`: pantallas y rutas de la aplicación.
- `src/routes/api/public/factus.ts`: endpoint del servidor que actúa como proxy para Factus.
- `src/components/`: componentes compartidos de interfaz.
- `src/lib/db.ts`: definición de entidades, tablas locales, índices y datos iniciales.
- `src/lib/erp.ts`: operaciones de negocio, inventario y contabilidad.
- `src/lib/production.ts`: reglas de producción y conversión de medidas.
- `src/lib/auth.tsx`: contexto de autenticación y sesión.
- `src/lib/access-session.ts` y `src/lib/permissions.ts`: carga y evaluación de permisos.
- `src/lib/sync.tsx`: sincronización entre Dexie y Firestore.
- `src/lib/backup.ts`: exportación e importación de respaldos.
- `src/lib/factus.ts`: integración del cliente con Factus.
- `src/lib/pwa.ts` y `public/sw.js`: registro y comportamiento del Service Worker.

## 4. Persistencia de datos

### 4.1 Base local

Los datos operativos se almacenan en IndexedDB a través de Dexie. Esto permite que las operaciones que utilizan las tablas locales sigan disponibles sin conexión, sujeto a que el dispositivo tenga los datos necesarios y la sesión ya esté disponible.

### 4.2 Servicios en la nube

Firebase cumple funciones distintas:

- Authentication: autenticación con correo y contraseña.
- Firestore: perfiles y asignaciones de acceso, definición de roles y sincronización de algunos catálogos.
- La sincronización de datos operativos no cubre todas las entidades del sistema.

### 4.3 Alcance real de la sincronización

El código de `src/lib/sync.tsx` identifica como tablas sincronizadas productos, clientes y proveedores. El roadmap declara pendiente la sincronización de ventas, compras, cartera, contabilidad y adjuntos.

Por tanto, no debe describirse el sistema como una solución multi-dispositivo con todos los movimientos sincronizados. La operación local y la sincronización parcial son capacidades diferentes.

## 5. Autenticación y permisos

La autenticación se realiza con Firebase Authentication. La aplicación consulta en Firestore la asignación del usuario y el rol correspondiente. Los permisos se definen por módulo con niveles de acceso de consulta, modificación o ninguno.

La aplicación conserva también un registro local de usuario para asociar operaciones realizadas en el dispositivo. El alcance efectivo de los controles debe contrastarse con las reglas de Firestore y con cada pantalla antes de considerar el modelo de seguridad terminado.

## 6. PWA y despliegue

El repositorio contiene manifiesto, iconos, capturas y Service Worker. La configuración de despliegue documentada en `DEPLOY.md` contempla publicación del resultado compilado en Vercel, Netlify, Cloudflare Pages o un servidor web propio.

La compilación y el despliegue deben validarse con la configuración vigente antes de seguir las instrucciones en un entorno productivo.

## 7. Integración con Factus

El cliente de Factus está implementado en `src/lib/factus.ts` y envía solicitudes a `/api/public/factus`. La ruta de servidor correspondiente obtiene el token de Factus y reenvía acciones de facturación y consulta.

La disponibilidad y el cumplimiento de los requisitos de facturación electrónica dependen de la configuración válida de Factus y de las autorizaciones correspondientes. Esta documentación no certifica por sí misma el cumplimiento tributario.

## 8. Observaciones y aspectos por verificar

1. Confirmar el alcance real del modo offline en los flujos de autenticación, autorización y operaciones.
2. Revisar las reglas de Firestore junto con los permisos definidos en el cliente.
3. Verificar cómo se protegen las credenciales de Factus y el endpoint servidor.
4. Documentar la estrategia de conflictos y borrados de la sincronización.
5. Verificar el proceso de compilación y publicación en un entorno limpio.
6. Confirmar que los respaldos incluyen todas las tablas y que la restauración conserva las relaciones e identificadores necesarios.

## 9. Archivos de referencia

- `package.json`
- `src/lib/db.ts`
- `src/lib/sync.tsx`
- `src/lib/auth.tsx`
- `src/lib/permissions.ts`
- `src/lib/erp.ts`
- `src/lib/production.ts`
- `src/lib/factus.ts`
- `src/routes/api/public/factus.ts`
- `src/lib/backup.ts`
- `DEPLOY.md`
- `roadmap.md`
