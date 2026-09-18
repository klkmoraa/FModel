# FModel 2D CAD — instrucciones del repositorio

Este archivo es la guía persistente para cualquier asistente que trabaje en FModel. Aplica a todo el repositorio. Mantén las decisiones específicas de una tarea en su spec, plan o archivo de seguimiento; no conviertas `AGENTS.md` en un historial de cambios.

## 1. Producto y alcance

FModel es un CAD 2D profesional, local-first y sin servidor, construido con React 19, TypeScript y Vite. El modelo, la geometría, los comandos y el renderizado no dependen de React; React presenta la interfaz.

Invariantes de producto:

- Alcance estrictamente 2D. No introducir BIM, IFC, sólidos, mallas ni render 3D.
- Los dibujos, versiones, recursos y preferencias permanecen en el navegador salvo una acción explícita de abrir, guardar, descargar o importar.
- No añadir backend, cuentas, telemetría, sincronización remota ni llamadas de red nuevas sin petición explícita del usuario.
- Mantener español e inglés. Todo texto nuevo visible debe usar los mecanismos bilingües existentes (`L`, `tr` u objeto `{ es, en }`).
- Chrome, Edge y Safari son plataformas objetivo; no asumir que File System Access API existe.
- DWG es experimental y tiene una decisión de distribución/licencia pendiente en `fix/features/`. No ampliar su superficie pública sin resolver `REL-001`.

## 2. Fuentes de verdad

Cuando dos fuentes discrepen, usar este orden:

1. Comportamiento comprobado por código y pruebas ejecutadas.
2. Contratos y tipos en `src/document/`, arquitectura en `docs/arquitectura.md` y tolerancias en `docs/tolerancias.md`.
3. Estado generado de funciones en `src/app/features.ts` y `docs/FEATURES.md`.
4. Compatibilidad declarada en `docs/dxf-compatibilidad.md`.
5. README, planes, specs y documentación histórica.

No afirmar que una función está implementada solo porque aparece en un plan, comentario o interfaz. `docs/FEATURES.md` se genera desde `src/app/features.ts`: no editarlo a mano; ejecutar `pnpm docs:features`.

## 3. Preparación antes de cambiar código

1. Leer la solicitud completa y clasificarla como consulta, diagnóstico, cambio o tarea del backlog.
2. Revisar `git status --short` antes de editar. Los cambios existentes pertenecen al usuario u otro asistente: preservarlos y evitar archivos solapados.
3. Localizar el módulo, sus pruebas y los contratos relacionados con `rg`; no empezar por una reescritura amplia.
4. Leer la documentación del subsistema solo cuando sea relevante.
5. Si el comportamiento o alcance tiene una decisión material ausente, detenerse y pedir únicamente esa decisión.

Para diagnósticos, explicar causa y evidencia antes de implementar. Implementar solo cuando la solicitud incluya corregir, cambiar o construir.

## 4. Skills y conocimiento especializado

Las skills locales viven en `.agents/skills/`; su inventario, origen y revisión están en `.agents/skills/CATALOG.md`. Cargar una skill solo cuando la solicitud coincida con su descripción y leer únicamente las referencias necesarias. Las reglas de este archivo, el código y las pruebas de FModel siempre prevalecen sobre consejos genéricos de terceros.

| Necesidad | Skill preferida | Límite |
|---|---|---|
| Comandos, lienzo, selección, snaps, bloques, capas, cotas, layouts, DXF/DWG o UX propia de CAD | `fmodel-cad-workflows` | Solo CAD 2D de FModel; no BIM/3D ni servicios remotos |
| Implementación o revisión de rendimiento en React | `vercel-react-best-practices` | Aplicar solo reglas de React/Vite/navegador pertinentes; ignorar reglas exclusivas de Next.js/servidor |
| API de componentes, providers o refactor con demasiadas props booleanas | `vercel-composition-patterns` | No reestructurar componentes estables sin una necesidad demostrable |
| Auditoría explícita de UI, UX o accesibilidad | `web-design-guidelines` | Revisar el código solicitado y validar en navegador; no convertir preferencias visuales en bugs |
| Rediseño o creación visual amplia | `frontend-design` | Preservar lenguaje visual, densidad y flujos profesionales del CAD |
| Planificación, depuración, TDD, revisión o cierre disciplinado | Superpowers si está disponible en el host | Es metodología de trabajo, no fuente de verdad del producto |

Si coinciden varias skills, usar el conjunto mínimo y declarar el orden. Antes de adoptar una skill nueva, revisar sus instrucciones, scripts, llamadas de red, licencia y ajuste al alcance; registrar fuente y revisión inmutable en el catálogo. Nunca ejecutar ciegamente scripts de una skill. No usar una skill remota para subir dibujos, código o datos del usuario sin autorización explícita.

## 5. Comandos del proyecto

Usar `pnpm`. El runtime objetivo está declarado en `package.json` y CI utiliza Node 24.

```bash
pnpm install --frozen-lockfile  # instalación reproducible
pnpm dev                       # servidor Vite
pnpm typecheck                 # TypeScript estricto
pnpm lint                      # oxlint
pnpm check:layers              # dependencias entre capas
pnpm check:features            # documentación generada al día
pnpm test                      # suite Vitest
pnpm vitest run ruta/al.test.ts
pnpm build                     # typecheck + build de producción
pnpm verify                    # tipos, capas, features, pruebas y build
```

Mientras `CI-001` siga abierta, `pnpm verify` no incluye lint. La puerta completa actual es:

```bash
pnpm lint && pnpm verify
```

No ejecutar siempre la suite completa durante la exploración. Usar primero la prueba focalizada y ejecutar la puerta proporcional antes de cerrar.

## 6. Mapa de arquitectura

La dependencia es descendente y `pnpm check:layers` la valida:

| Capa | Directorios | Responsabilidad |
|---:|---|---|
| 0 | `geometry`, `lib`, `view` | matemáticas, curvas, tolerancias y transformaciones |
| 1 | `document`, `history` | contratos, transacciones, identidad y undo/redo |
| 2 | `model`, `spatial`, `constraints`, `layers`, `annotation` | comportamiento de entidades e índices |
| 3 | `selection`, `snap`, `blocks`, `modify`, `audit`, `io`, `storage`, `xref`, `app` | operaciones de dominio y persistencia |
| 4 | `render`, `output`, `workers` | Canvas, PDF/SVG y operaciones pesadas |
| 5 | `commands`, `editor` | interacción y orquestación de comandos |
| 6 | `ui`, `pwa`, `main` | React, eventos del navegador y arranque |

Reglas de frontera:

- No importar una capa superior desde una inferior. Los `import type` están permitidos por el validador cuando no crean dependencia de ejecución.
- Mantener el núcleo independiente de React, DOM y estado visual.
- No duplicar lógica de dominio en componentes: la UI invoca comandos/servicios existentes.
- Operaciones costosas y serializables pertenecen en `workers/heavyOps.ts`; deben conservar fallback equivalente cuando no hay Worker.
- La lista de visualización y `EntityKind` son la extensión del modelo; no añadir casos especiales al renderizador para una entidad nueva si el registro puede expresarla.

## 7. Invariantes de datos y precisión

- Coordenadas y tamaños se almacenan en unidades de dibujo, nunca en píxeles. Convertir tolerancias de pantalla mediante zoom/contexto.
- Usar funciones y tolerancias de `src/geometry/`; no dispersar epsilons arbitrarios.
- Nunca introducir `NaN`, `Infinity`, radios negativos, matrices inválidas o referencias a IDs inexistentes en el documento.
- Los IDs son estables. Renombrar no debe romper referencias.
- Modificar el documento mediante `CadDocument.transact`, `CommandApi.apply` y métodos de `Transaction`; no mutar mapas o registros directamente.
- Un comando mutable debe ser atómico y producir un paso coherente de undo. Si falla o se cancela, no debe dejar cambios residuales.
- Conservar `owner`, `layer`, `order`, estilos, assets, bloques y referencias transitivas al copiar/importar.
- Validar datos externos antes de reemplazar o mutar el dibujo. Los formatos `.fmodel`, `.fmodellib`, DXF/DWG, portapapeles y launch queue son entradas no confiables.
- Toda evolución del formato nativo requiere subir versión, migración hacia delante y pruebas con versiones anteriores y futuras rechazadas.
- No declarar un guardado exitoso hasta distinguir escritura, descarga iniciada y cancelación.

## 8. Convenciones de implementación

- TypeScript estricto; preferir tipos discriminados y `unknown` validado sobre `any` o casts amplios.
- Mantener funciones pequeñas y responsabilidades claras, siguiendo patrones actuales. No hacer refactors no relacionados dentro de un fix.
- Evitar remapeos de IDs mediante sustitución de JSON; usar recorridos tipados.
- No añadir dependencia de producción si una solución pequeña con APIs existentes es suficiente. Si se añade, justificar tamaño, licencia y efecto en navegador/worker.
- Cargar de forma diferida motores pesados y funciones opcionales. No mover PDF, DWG o exportadores grandes al bundle inicial.
- Liberar listeners, timers, animation frames, object URLs y workers. Las operaciones largas deben tener ruta de error/cancelación cuando sea viable.
- No silenciar errores que afecten datos. Convertirlos en resultados o mensajes bilingües accionables.
- No dejar `console.log`, `debugger`, `@ts-ignore` ni reglas de lint desactivadas sin motivo documentado.
- Respetar estilos/tokens existentes. Para UI nueva, cubrir teclado, foco visible, nombre accesible, contraste, tema claro/oscuro y tamaños táctiles.
- No editar `dist/`, `node_modules/`, artefactos generados ni fixtures de terceros salvo que la tarea lo requiera expresamente.
- Conservar atribuciones y licencias en `public/library/` y fixtures importados.

## 9. Estrategia de pruebas por tipo de cambio

Empezar con una prueba que falle al corregir un defecto, salvo que sea imposible observarlo fuera de un navegador real.

| Cambio | Verificación mínima |
|---|---|
| Geometría, snap, constraints, modify | prueba focalizada con casos degenerados + `typecheck` |
| Documento, historial, comandos mutables | éxito, cancelación/error y undo/redo |
| Formato nativo, biblioteca, DXF/DWG, xref | archivo válido, dañado, versión incompatible e ida/vuelta |
| Persistencia/IndexedDB | éxito, almacenamiento ausente, error/cuota y atomicidad |
| Worker | worker, fallback inline, error y datos serializables |
| Render/output | estructura vectorial y comparación numérica; revisión visual si cambia apariencia |
| UI/teclado/táctil | prueba de lógica/componente disponible + revisión real proporcional |
| PWA/service worker | instalación, caché, offline y actualización sin mezclar versiones |
| Documentación/catálogo | `pnpm check:features` cuando aplique |

Para cambios transversales, release o cierre de una tarea de `fix/features`, ejecutar `pnpm lint && pnpm verify`. Si un comando no pudo ejecutarse, decirlo explícitamente; no presentar como validado lo que no se corrió.

## 10. Git y cambios compartidos

- No crear rama, commit, push, PR, tag ni release salvo petición explícita del usuario.
- No usar comandos destructivos (`reset --hard`, checkout para descartar, limpieza amplia) sin autorización clara.
- No modificar ni borrar cambios ajenos para dejar el árbol “limpio”.
- Mantener cada cambio enfocado; separar defectos encontrados que no bloquean el trabajo en una tarea nueva.
- Antes de terminar, revisar `git diff --check`, `git status --short` y el diff de los archivos tocados.

## 11. Flujo especial del backlog de mejoras

Frases activadoras: “vamos a trabajar en las mejoras”, “trabajemos en las mejoras” o equivalente.

Cuando aparezcan:

1. Leer completos `fix/features/README.md`, `fix/features/00-auditoria-base.md` y el archivo de categoría de la tarea.
2. Si el usuario da un ID, usarlo. Si no, elegir la tarea abierta de mayor prioridad que no esté bloqueada, en curso, pendiente de decisión del usuario ni solapada con cambios actuales.
3. Antes de implementar, cambiar la tarea a `[>]`, `Estado: En curso`, añadir responsable y fecha, y actualizar la misma fila del índice maestro.
4. Implementar solo ese alcance y sus criterios de aceptación.
5. Ejecutar su verificación específica y la puerta general indicada.
6. Cerrar solo con todos los criterios cumplidos: `[x]`, `Estado: Cerrada`, fecha y evidencia. Actualizar el índice.
7. Si aparece trabajo adicional, crear otro ID enlazado; no inflar silenciosamente la tarea.

`fix/features/README.md` es la única fuente de estado. No crear listas paralelas ni tomar una tarea ya marcada `En curso`.

Frases relacionadas:

- “Vamos con DAT-001”: ejecutar exactamente ese ID.
- “Revisa el avance de las mejoras”: informar estados/bloqueos sin implementar.
- “Cierra la mejora en curso”: verificar y cerrar únicamente con evidencia.

## 12. Reglas para revisión de código

Priorizar hallazgos demostrables sobre preferencias de estilo. Revisar, en este orden:

1. Pérdida/corrupción de dibujos, guardado falso, migraciones y undo incorrecto.
2. Geometría o unidades incorrectas, referencias rotas y resultados no finitos.
3. Entradas no confiables, licencias, exposición de datos y recursos sin límites.
4. Carreras, cancelación, workers, listeners y consumo no acotado.
5. Regresiones de compatibilidad, accesibilidad, rendimiento y mantenibilidad.

Cada hallazgo debe indicar archivo/línea, escenario reproducible, impacto y alternativa segura. No reportar como bug una posibilidad puramente teórica sin ruta alcanzable.

## 13. Definición de terminado

Un cambio está terminado cuando:

- satisface exactamente la solicitud y conserva invariantes del producto;
- incluye pruebas proporcionales y estas pasan;
- mantiene tipos, capas y documentación generada coherentes;
- no introduce errores silenciosos, dependencias o trabajo fuera de alcance;
- el diff fue revisado y no contiene cambios ajenos;
- el resumen final explica qué cambió, qué se verificó y cualquier limitación real.

Compilar por sí solo no demuestra corrección. Una tarea del backlog no está cerrada hasta registrar su evidencia en `fix/features/`.

## 14. Mantenimiento de estas instrucciones

- Mantener un solo `AGENTS.md` autoritativo en la raíz. No crear `CLAUDE.md`, `GEMINI.md`, adaptadores equivalentes ni `AGENTS.md` anidados salvo petición explícita del usuario.
- Mantener este archivo breve, accionable y verificable; mover procedimientos especializados a `.agents/skills/` y el estado cambiante a `fix/features/`.
- No copiar aquí manuales completos, resultados de auditoría, historial de cambios ni reglas que ya hagan cumplir TypeScript, lint o las pruebas.
- Después de cambios de estructura, comprobar que cada ruta y comando citado siga existiendo. Eliminar instrucciones obsoletas en lugar de acumular excepciones.
- Mantener el tamaño combinado de instrucciones por debajo del límite de descubrimiento del agente; como objetivo local, este archivo debe permanecer holgadamente por debajo de 32 KiB.
