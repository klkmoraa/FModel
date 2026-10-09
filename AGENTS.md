# FModel — guía para agentes

FModel (FS-M01, familia **Modelo**) es un CAD 2D profesional, local-first y sin servidor: React 19, TypeScript y Vite. Modelo, geometría, comandos y render no dependen de React; React sólo presenta.

## Límites duros

1. **Sólo 2D.** Nada de BIM, IFC, sólidos, mallas ni render 3D.
2. **Nada sale del dispositivo** sin una acción explícita (abrir, guardar, descargar, importar). Sin backend, cuentas, telemetría ni red nueva.
3. **No perder dibujos.** Cambios por `CadDocument.transact` / `CommandApi.apply`; cada comando es atómico y deshacible; el formato nativo sube versión con migración cuando cambia su contrato.
4. **Entradas no confiables:** `.fmodel`, `.fmodellib`, DXF/DWG, portapapeles y launch queue se validan antes de tocar el dibujo.
5. **Git:** commit, push, rama o release sólo cuando el usuario lo pide. Nada destructivo sin permiso; los cambios ajenos se respetan.

DWG es experimental y tiene pendiente la decisión de licencia (`REL-001` en `fix/features/`): no ampliar su superficie pública.

## Fuentes de verdad

Código y pruebas → contratos en `src/document/`, `docs/arquitectura.md`, `docs/tolerancias.md` → `src/app/features.ts` (genera `docs/FEATURES.md` con `pnpm docs:features`; no editarlo a mano) → `docs/dxf-compatibilidad.md` → README. Una función no existe porque aparezca en un plan o en la interfaz.

## Capas

`pnpm check:layers` impide importar hacia arriba (`import type` sí se permite).

| Capa | Directorios |
|---:|---|
| 0 | `geometry`, `lib`, `view` |
| 1 | `document`, `history` |
| 2 | `model`, `spatial`, `constraints`, `layers`, `annotation` |
| 3 | `selection`, `snap`, `blocks`, `modify`, `audit`, `io`, `storage`, `xref`, `app` |
| 4 | `render`, `output`, `workers` |
| 5 | `commands`, `editor` |
| 6 | `ui`, `pwa`, `main` |

- Coordenadas en unidades de dibujo, nunca píxeles; tolerancias de `src/geometry/`, sin epsilons sueltos.
- Nunca `NaN`, `Infinity`, radios negativos ni referencias a IDs inexistentes. Los IDs son estables.
- Lo pesado va en `workers/heavyOps.ts` con fallback equivalente; PDF, DWG y exportadores grandes se cargan diferidos.
- Todo texto visible en español e inglés (`L`, `tr` u objeto `{ es, en }`). Chrome, Edge y Safari; no asumir File System Access API.

## Marca

- Canon: [FusionStructureBrand](https://klkmoraa.github.io/FusionStructureBrand/). Brandbook de la familia: `docs/brandbook/` (abrir `index.html`).
- FModel cambia sólo el acento: `#7657D5` / `#A990FF` en relleno, `#5B3FC0` como texto en Día, `#FFFFFF` sobre el acento. Neutros, tipo, radios, materia, movimiento, señales y voz son del canon.
- La marca es la ménsula con la franja morada; el verde `#1AA57A` sólo aparece cuando se nombra a FusionStructure. El papel técnico no se tiñe.
- **Una fuente de color:** `src/styles/tokens.css`. `src/render/theme.ts` la lee (`?raw`) y un test vigila la paridad; en TS sólo quedan opacidades del CAD.
- UI nueva: teclado, foco visible, nombre accesible, contraste AA, Día y Noche, objetivos táctiles.
- Si cambia la mesa o un componente, actualiza las capturas y la ficha de `docs/brandbook/`.

## Comandos

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm vitest run ruta/al.test.ts   # primero lo focalizado
pnpm typecheck                    # cuando se modifica TypeScript
```

## Verificación proporcional

Ejecutar siempre sólo las pruebas mínimas necesarias para comprobar el cambio y
sus riesgos concretos. Elegir pruebas focalizadas existentes y añadir una
regresión cuando aporte cobertura útil. No crear pruebas que repitan la
implementación ni repetir comprobaciones aprobadas sin cambios o fallos nuevos.

No hay obligación de ejecutar suites completas, cobertura, `pnpm verify` ni una
matriz fija por tipo de cambio. Tipos, capas, build y revisión visual se usan
cuando el cambio los necesita. Registrar lo que se comprobó y sus limitaciones.
Esta regla prevalece sobre requisitos de pruebas de planes, backlog y skills.

## Backlog

`fix/features/README.md` es la única fuente de estado. Con «trabajemos en las mejoras» (o un ID como «DAT-001»): leer README, `00-auditoria-base.md` y la categoría; tomar la tarea abierta de mayor prioridad no bloqueada; marcarla `[>] En curso` con fecha; implementar sólo su alcance; cerrarla `[x]` con evidencia. Trabajo extra = ID nuevo.

## Revisión de código

En orden: pérdida de dibujos o guardado falso → geometría/unidades y resultados no finitos → entradas no confiables y licencias → carreras, workers y listeners → compatibilidad, accesibilidad y rendimiento. Cada hallazgo con archivo:línea, escenario, impacto y alternativa.

## Skills

Usar el plugin externo **Superpowers** disponible en el entorno. No copiar ni
mantener skills dentro de FModel. Las instrucciones del usuario, este archivo,
el código y las pruebas prevalecen sobre cualquier skill; aplicar siempre la
verificación mínima necesaria indicada arriba.
