# Rendimiento, workers y PWA

## PWA-001 — Versionar la caché por contenido real

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-18 · **Cierre:** 2026-09-18
- **Reapertura:** 2026-09-18 · **Responsable:** Codex · **Cierre de seguimiento:** 2026-09-18
- **Prioridad:** P1 — usuarios pueden conservar recursos públicos obsoletos
- **Depende de:** —
- **Bloquea:** —

**Evidencia:** `vite.config.ts` y `src/pwa/serviceWorker.ts` calculan la versión mediante `computeCacheVersion` incorporando el hash SHA-256 de los bytes de cada chunk y de cada archivo público; un cambio de contenido en manifiesto o iconos genera una versión de caché distinta incluso con el mismo nombre. El service worker maneja respuestas de navegación no exitosas (`!res.ok`) con caída en el `index.html` precargado, y la biblioteca inicial se gestiona con caché en tiempo de ejecución (`cache-first`) sin inflar el precache.

**Archivos previstos:**

- Modificar: `vite.config.ts`, `src/pwa/serviceWorker.ts`
- Ampliar: `src/pwa/serviceWorker.test.ts`
- Crear: prueba del plugin/build para cambio de contenido público

**Implementación:**

- [x] Calcular revisión con nombre + hash de contenido de cada asset incluido o usar el hash del bundle/manifiesto generado.
- [x] Probar que cambiar solo un icono/manifiesto genera un CACHE distinto.
- [x] Definir estrategia explícita para la biblioteca inicial excluida del precache.
- [x] Manejar respuestas de navegación no exitosas cuando corresponda, no solo rechazo de red.

**Criterios de aceptación:**

- [x] Dos builds con bytes distintos no comparten versión de caché.
- [x] Un build idéntico conserva versión reproducible.
- [x] Actualizar no mezcla recursos de versiones distintas y el modo offline sigue funcionando.

**Cierre:** 2026-09-18

**Verificación:** `pnpm vitest run src/pwa/serviceWorker.test.ts` (6 pruebas focalizadas) y `pnpm lint && pnpm verify` (50 archivos, 391 pruebas, capas correctas, typecheck estricto y build limpio con service worker emitido sin avisos).

**Seguimiento 2026-09-18:** commit `205e63d`. Las solicitudes HTTP `Range` omiten por completo la caché y nunca reciben una respuesta 200 almacenada para la URL completa. La regresión falló primero con 200 y luego pasó con 206; `pnpm vitest run src/pwa/serviceWorker.test.ts` cerró con 7 pruebas y `pnpm lint && pnpm verify` con 50 archivos/404 pruebas, capas, documentación, tipos y build correctos (avisos de lint preexistentes).

---

## PWA-002 — Conservar recursos offline de pestañas abiertas durante una actualización

- [>] **Estado:** En curso
- **Responsable:** Codex · **Inicio:** 2026-09-23
- **Prioridad:** P1 — una pestaña que conserva el trabajador anterior puede perder sus módulos fuera de línea
- **Depende de:** PWA-001
- **Bloquea:** —

**Evidencia:** `src/pwa/serviceWorker.ts` borra todas las cachés `fmodel-cad-*` anteriores al activar una versión nueva. En una reproducción unitaria con `CacheStorage` compartido, una pestaña todavía atendida por el trabajador previo pierde un chunk ya almacenado cuando otra pestaña activa la actualización. La reproducción no es evidencia de navegador real.

**Avance 2026-09-23:** el trabajador conserva un mapa persistente de clientes y cachés; al activar toma una instantánea de las pestañas anteriores y asigna a la caché nueva las pestañas abiertas después. Atiende los recursos de cada cliente desde su versión y reconcilia las cachés tras navegación o cierre seguido de actividad. La prueba unitaria reprodujo tanto el borrado de v1 como la entrega incorrecta de un recurso v1 a una pestaña nueva antes de `ready`; ambas pasan tras la corrección. `e2e/serviceWorkerMultiTab.spec.ts` usa dos pestañas y dos versiones del trabajador: Chromium cargó por primera vez un módulo dinámico desde cada caché estando offline, y tras cerrar la pestaña v1 quedó solo v2. WebKit verificó aviso, versiones correctas con red y limpieza. Su modo offline de Playwright falla incluso con una sola pestaña v1, un recurso confirmado en caché y un controlador activo (`WebKit encountered an internal error`), antes de cualquier actualización; por ello no se atribuye validación offline de Safari.

**Escenario:** abrir dos pestañas de la misma versión, aplicar la actualización en una, desconectar la red e invocar en la otra una función que carga un chunk bajo demanda. La pestaña antigua debe conservar los recursos de su versión hasta cerrar o actualizarse.

**Archivos previstos:** `src/pwa/serviceWorker.ts`, `src/pwa/serviceWorker.test.ts` y un recorrido de navegador que controle dos pestañas y la conexión.

**Criterios de aceptación:**

- [ ] La pestaña que sigue ejecutando la versión anterior puede cargar sus recursos precargados sin red después de activar la nueva en otra pestaña. Comprobado en Chromium; falta evidencia offline de WebKit/Safari.
- [x] La pestaña actualizada usa solo recursos de su nueva versión y conserva el aviso antes de recargar un dibujo abierto.
- [x] Las cachés que ya no tienen clientes se eliminan con una política acotada y verificable, sin acumulación indefinida.
- [x] Una prueba de navegador reproduce actualización, dos pestañas y modo offline en Chromium; las pruebas unitarias cubren activación, limpieza y solicitudes `Range`. La prueba WebKit cubre enrutamiento online y limpieza; falta evidencia offline de Safari.

**Verificación prevista:** pruebas focalizadas del service worker, recorrido E2E multi pestaña y `pnpm verify`.

**Verificación 2026-09-23:** `pnpm exec vitest run src/pwa/serviceWorker.test.ts src/pwa/register.test.ts` (11/11), `pnpm verify` (83 archivos, 748/748 pruebas, 590 importaciones entre capas y build), `PLAYWRIGHT_WEBKIT=1 pnpm exec playwright test e2e/serviceWorkerMultiTab.spec.ts --workers=1` (2/2). Sigue En curso por la evidencia offline de WebKit/Safari y el cierre formal con referencia de commit/PR; no se crea commit sin petición explícita.

---

## WRK-001 — Cancelar y transferir operaciones pesadas

- [x] **Estado:** Cerrada
- **Responsable:** Codex · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Prioridad:** P2 — memoria, bloqueos y control del usuario
- **Depende de:** DAT-003
- **Bloquea:** UI-003

**Evidencia:** `src/workers/client.ts` mantiene una cola FIFO determinista con una sola operación activa. Timeout, abort y crash terminan y recrean el worker cuando corresponde, rechazan solo la operación afectada y dejan continuar las siguientes; el fallback inline conserva una copia de payload aunque un `ArrayBuffer` ya haya sido transferido.

**Archivos previstos:**

- Modificar: `src/workers/client.ts`, `src/workers/heavy.worker.ts`, `src/workers/heavyOps.ts`
- Ampliar: `src/workers/client.test.ts`
- Modificar: consumidores en archivos, auditoría y salida

**Interfaz a producir:** `runHeavy(op, payload, { signal, timeoutMs, onProgress, transfer })` con error de cancelación distinguible.

**Criterios de aceptación:**

- [x] Cancelar retira la petición de `pending` y evita aplicar resultados tardíos.
- [x] Timeout termina/reinicia el worker cuando no puede cancelar cooperativamente.
- [x] `ArrayBuffer` grandes se transfieren cuando el llamador ya no los necesita.
- [x] El fallback inline conserva semántica de cancelación entre etapas.
- [x] Error del worker reintenta inline solo cuando es seguro e idempotente.

**Cierre:** 2026-09-19

**Verificación:** `pnpm vitest run src/workers/client.test.ts` (11 pruebas: FIFO/concurrencia, timeout, abort, crash, recreación y transferibles) y las puertas locales completas pasan con 63 archivos y 582 pruebas Vitest.

---

## PERF-001 — Fijar presupuestos y reducir el bundle inicial

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — tiempo de arranque y coste de actualización
- **Depende de:** REL-001
- **Bloquea:** GEO-002

**Evidencia:** el chunk inicial mide ≈1,178 KB/368 KB gzip. PDF, worker y DWG ya se dividen, pero UI pesada, comandos y catálogos permanecen en el arranque. No existe presupuesto automatizado.

**Archivos previstos:**

- Modificar: `src/main.tsx`, `src/ui/App.tsx`, registro de comandos si procede, `vite.config.ts`
- Crear: `scripts/check-bundle.mjs`
- Modificar: `package.json`, CI

**Implementación:**

- [ ] Generar reporte de composición y establecer línea base por chunk.
- [ ] Cargar de forma diferida diálogos/paneles poco usados y motores opcionales sin romper el registro de comandos.
- [ ] Evitar duplicación de módulos entre main/worker.
- [ ] Fijar límites iniciales explícitos y revisables para JS gzip, CSS, fuentes y precache.

**Criterios de aceptación:**

- [ ] El presupuesto falla con un mensaje que identifica el chunk excedido.
- [ ] La carga inicial disminuye de forma medida sin aumentar interacciones bloqueantes.
- [ ] Abrir una función lazy por primera vez tiene estado de carga y prueba E2E.

**Verificación:** `pnpm build && pnpm check:bundle && pnpm test:e2e -- smoke`

---

## PERF-002 — Definir política de source maps y fuentes de producción

- [ ] **Estado:** Abierta
- **Prioridad:** P3 — tamaño de artefacto y exposición innecesaria
- **Depende de:** REL-002
- **Bloquea:** —

**Evidencia:** `vite.config.ts` usa `sourcemap: true`; Pages publica ≈8.6 MB de mapas. El build también emite subconjuntos no latinos y archivos WOFF/WOFF2, aunque el service worker filtra parte del precache.

**Archivos previstos:**

- Modificar: `vite.config.ts`, importaciones de fuentes en `src/main.tsx`
- Modificar: workflow de despliegue si los mapas se suben a almacenamiento privado de errores

**Criterios de aceptación:**

- [ ] Elegir y documentar una política: sin mapas públicos, mapas ocultos o publicación consciente.
- [ ] El artefacto público contiene solo formatos/subconjuntos de fuente requeridos por idiomas soportados.
- [ ] La depuración de producción conserva una ruta aprobada para simbolizar errores si se retiran mapas.
- [ ] `check:bundle` mide mapas y fuentes por separado.

**Verificación:** inspección de `dist/` + `pnpm build && pnpm check:bundle`
