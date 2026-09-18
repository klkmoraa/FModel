# Plan maestro de mejoras de FModel

> **Para agentes o desarrolladores:** ejecutar una tarea a la vez. No marcarla como cerrada hasta cumplir todos sus criterios de aceptación y registrar evidencia. Para implementaciones asistidas, usar `superpowers:subagent-driven-development` o `superpowers:executing-plans`.

**Objetivo:** convertir la auditoría completa del producto en un backlog único, priorizado, enlazado y verificable.

**Arquitectura actual:** aplicación CAD 2D local-first en React 19 + TypeScript + Vite. El modelo, geometría, comandos y renderizado son independientes de React; IndexedDB conserva dibujos/versiones y un Web Worker ejecuta operaciones pesadas.

**Stack:** TypeScript 5.9, React 19, Vite 8, Vitest 5, oxlint, IndexedDB, Canvas 2D, Web Workers y PWA.

**Línea base:** [00-auditoria-base.md](./00-auditoria-base.md)

## Cómo usar este directorio

- **Atajo:** en un chat nuevo con acceso al repositorio basta decir “vamos a trabajar en las mejoras”. El archivo raíz `AGENTS.md` dirige al asistente a este backlog y al protocolo de selección/cierre.
- `[ ]` = abierta; `[>]` = en curso; `[x]` = cerrada; `[-]` = descartada con justificación.
- La prioridad no cambia por antigüedad: `P0` bloquea distribución, `P1` protege datos o flujos principales, `P2` mejora confiabilidad/calidad y `P3` optimiza mantenimiento.
- Al iniciar una tarea, cambiar su casilla a `[>]`, añadir responsable y fecha de inicio.
- Al cerrarla, cambiar a `[x]`, establecer `Estado: Cerrada`, anotar fecha, commit/PR y resultados de verificación.
- Si una tarea descubre trabajo adicional, crear un ID nuevo en la categoría correspondiente y enlazarlo; no ampliar silenciosamente el alcance.
- Una tarea bloqueada conserva su estado y registra el bloqueo concreto en su sección.

## Orden recomendado

| Orden | ID | Prioridad | Tarea | Estado | Depende de | Documento |
|---:|---|:---:|---|:---:|---|---|
| 1 | REL-001 | P0 | Resolver distribución y licencia del lector DWG | Abierta | — | [Distribución](./07-distribucion-documentacion.md#rel-001--resolver-la-distribución-del-lector-dwg-gpl-30) |
| 2 | DAT-001 | P1 | No declarar guardado cuando se cancela el selector | Cerrada | — | [Integridad](./01-integridad-archivos.md#dat-001--distinguir-guardado-descarga-y-cancelación) |
| 3 | DAT-002 | P1 | Portapapeles portable con dependencias | Cerrada | DAT-003 | [Integridad](./01-integridad-archivos.md#dat-002--hacer-portable-el-portapapeles-entre-dibujos) |
| 4 | DAT-003 | P1 | Validar formatos y limitar recursos no confiables | Cerrada | — | [Integridad](./01-integridad-archivos.md#dat-003--validar-archivos-y-aplicar-límites-de-recursos) |
| 5 | REL-002 | P1 | Impedir despliegues sin verificación completa | Abierta | REL-001 | [Distribución](./07-distribucion-documentacion.md#rel-002--hacer-que-el-despliegue-dependa-de-la-verificación) |
| 6 | PWA-001 | P1 | Versionar la caché por contenido real | Cerrada | — | [Rendimiento/PWA](./05-rendimiento-pwa.md#pwa-001--versionar-la-caché-por-contenido-real) |
| 7 | TST-001 | P1 | Automatizar recorridos críticos en navegador | Cerrada | DAT-001, DAT-002, DAT-003 | [Calidad](./06-calidad-arquitectura-pruebas.md#tst-001--cubrir-recorridos-críticos-en-un-navegador-real) |
| 8 | BLK-001 | P2 | Sustituir remapeos JSON por remapeo tipado | Abierta | DAT-003 | [Bloques](./03-bloques-referencias.md#blk-001--centralizar-el-remapeo-tipado-de-identificadores) |
| 9 | DAT-004 | P2 | Hacer visibles los fallos de persistencia y cuota | Abierta | DAT-001 | [Integridad](./01-integridad-archivos.md#dat-004--informar-fallos-de-persistencia-y-cuota) |
| 10 | WRK-001 | P2 | Cancelar y transferir operaciones pesadas | Abierta | DAT-003 | [Rendimiento/PWA](./05-rendimiento-pwa.md#wrk-001--cancelar-y-transferir-operaciones-pesadas) |
| 11 | TST-002 | P2 | Medir cobertura y fijar umbrales | Abierta | — | [Calidad](./06-calidad-arquitectura-pruebas.md#tst-002--medir-cobertura-y-fijar-umbrales) |
| 12 | GEO-001 | P2 | Probar invariantes geométricas y entradas degeneradas | Abierta | TST-002 | [Geometría](./02-geometria-comandos.md#geo-001--probar-invariantes-y-geometría-degenerada) |
| 13 | BLK-002 | P2 | Validar paquetes antes de instalar la biblioteca | Abierta | DAT-003, BLK-001 | [Bloques](./03-bloques-referencias.md#blk-002--validar-paquetes-de-biblioteca-antes-de-instalarlos) |
| 14 | XRF-001 | P2 | Verificar portabilidad de referencias y recursos | Abierta | DAT-003, BLK-001 | [Bloques](./03-bloques-referencias.md#xrf-001--verificar-portabilidad-completa-de-referencias-y-recursos) |
| 15 | PERF-001 | P2 | Presupuestos de bundle y carga diferida | Abierta | REL-001 | [Rendimiento/PWA](./05-rendimiento-pwa.md#perf-001--fijar-presupuestos-y-reducir-el-bundle-inicial) |
| 16 | UI-001 | P2 | Auditoría de accesibilidad y teclado | Abierta | TST-001 | [Interfaz](./04-interfaz-accesibilidad.md#ui-001--cerrar-la-brecha-de-accesibilidad-y-teclado) |
| 17 | DOC-001 | P2 | Unificar la verdad sobre DWG y estado de funciones | Abierta | REL-001 | [Distribución](./07-distribucion-documentacion.md#doc-001--unificar-la-documentación-de-dwg-y-del-estado-real) |
| 18 | CI-001 | P2 | Unificar toolchain y comando de verificación | Abierta | — | [Calidad](./06-calidad-arquitectura-pruebas.md#ci-001--unificar-toolchain-lint-y-verificación-local) |
| 19 | CMD-001 | P2 | Probar comportamiento de comandos disponibles | Abierta | TST-001, TST-002 | [Geometría](./02-geometria-comandos.md#cmd-001--pruebas-de-comportamiento-para-comandos-declarados-disponibles) |
| 20 | DOC-002 | P2 | Vincular funciones disponibles con evidencia | Abierta | CMD-001, TST-001 | [Distribución](./07-distribucion-documentacion.md#doc-002--vincular-el-estado-disponible-con-evidencia) |
| 21 | GEO-002 | P2 | Medir rendimiento con dibujos grandes | Abierta | TST-002, PERF-001 | [Geometría](./02-geometria-comandos.md#geo-002--presupuesto-de-rendimiento-para-dibujos-grandes) |
| 22 | ARC-001 | P3 | Dividir módulos monolíticos por responsabilidad | Abierta | TST-002 | [Calidad](./06-calidad-arquitectura-pruebas.md#arc-001--dividir-módulos-monolíticos-con-pruebas-de-caracterización) |
| 23 | UI-002 | P3 | Validar interacción táctil en dispositivos reales | Abierta | TST-001, UI-001 | [Interfaz](./04-interfaz-accesibilidad.md#ui-002--validar-la-experiencia-táctil-en-dispositivos-reales) |
| 24 | UI-003 | P3 | Estandarizar progreso, error y cancelación | Abierta | WRK-001, DAT-004 | [Interfaz](./04-interfaz-accesibilidad.md#ui-003--estandarizar-estados-de-carga-error-y-operación-larga) |
| 25 | PERF-002 | P3 | Política de source maps y fuentes | Abierta | REL-002 | [Rendimiento/PWA](./05-rendimiento-pwa.md#perf-002--definir-política-de-source-maps-y-fuentes-de-producción) |
| 26 | SEC-001 | P3 | Retirar superficies de depuración de producción | Abierta | REL-002 | [Calidad](./06-calidad-arquitectura-pruebas.md#sec-001--retirar-superficies-de-depuración-de-producción) |
| 27 | DOC-003 | P3 | Unificar requisitos de desarrollo | Abierta | CI-001 | [Distribución](./07-distribucion-documentacion.md#doc-003--unificar-requisitos-de-desarrollo-y-operación) |

## Mapa de dependencias

```text
REL-001 ──► REL-002 ──► despliegue público confiable
    ├─────► DOC-001
    └─────► PERF-001

DAT-003 ──► DAT-002 ──► TST-001 ──► UI-001 ──► UI-002
    ├─────► BLK-001
    └─────► WRK-001

DAT-001 ──► DAT-004
    └─────► TST-001

TST-002 ──► GEO-001
    └─────► ARC-001
```

## Regla de cierre

Una tarea solo está cerrada cuando:

1. Todos sus criterios de aceptación están marcados.
2. Las pruebas nuevas fallaron antes del cambio y pasan después, cuando el trabajo corrige un defecto.
3. `pnpm verify` y `pnpm lint` pasan sin errores; después de `CI-001`, ambos deben formar una sola puerta.
4. Se registran commit/PR, fecha y salida resumida de las verificaciones.
5. El índice de este archivo se actualiza al mismo estado.

Formato de evidencia para pegar al final de una tarea:

```markdown
**Cierre:** AAAA-MM-DD · commit/PR `referencia`

**Evidencia:**
- `comando`: resultado
- Prueba manual: navegador/dispositivo y resultado
- Documentación actualizada: rutas
```
