# Documentación de Flow POS Lite

Esta carpeta reúne la documentación funcional y técnica de Flow POS Lite.

## Criterios de documentación

- La documentación describe el comportamiento comprobable en el código del repositorio.
- Las funciones pendientes, incompletas o no verificadas se identifican expresamente.
- No se consideran implementadas las funciones que solo aparezcan en el roadmap.
- Los cambios de documentación no deben alterar el código funcional de la aplicación.

## Documentos

| Documento | Contenido |
|---|---|
| [Arquitectura](./ARQUITECTURA.md) | Tecnologías, estructura general y funcionamiento local/nube |
| [Módulos](./MODULOS.md) | Funciones y pantallas del sistema |
| [Base de datos](./BASE_DATOS.md) | Tablas locales, entidades y sincronización |
| [Seguridad](./SEGURIDAD.md) | Autenticación, roles, permisos y reglas de Firestore |
| [Procesos](./PROCESOS.md) | Flujos operativos y reglas de negocio |
| [Despliegue](./DESPLIEGUE.md) | Instalación, compilación y publicación |
| [Mantenimiento](./MANTENIMIENTO.md) | Pruebas, copias de seguridad y mantenimiento |
| [Manual de usuario](./MANUAL_USUARIO.md) | Guía de uso para el personal del negocio |
| [Requisitos de operación láctea](./REQUISITOS_OPERACION_LACTEA.md) | Alcance, áreas, fórmulas, compras, inventarios, ventas y despachos |
| [Sincronización multiusuario](./SINCRONIZACION_MULTIUSUARIO.md) | Arquitectura, consistencia, seguridad y migración a sincronización completa |\n| [Identidad global](./IDENTIDAD_GLOBAL.md) | Auditoría de IDs locales, relaciones y plan seguro de migración a UUID globales |\n| [Implementación cloud-first](./IMPLEMENTACION_CLOUD_FIRST.md) | Avances reales de código, alcance migrado y siguientes pasos |

## Estado

Documentación en elaboración. Los documentos se completarán después de contrastar cada módulo y proceso con su implementación.

## Repositorio

[FabianCF20/flow-pos-lite](https://github.com/FabianCF20/flow-pos-lite)
