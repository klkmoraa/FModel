# Distribución, licencia y documentación

## REL-001 — Resolver la distribución del lector DWG GPL-3.0

- [ ] **Estado:** Abierta
- **Prioridad:** P0 — bloquea una publicación jurídicamente clara
- **Depende de:** —
- **Bloquea:** REL-002, DOC-001, PERF-001

**Evidencia interna:**

- `@mlightcad/libredwg-web@0.7.11` declara `GPL-3.0`.
- El build genera `dist/assets/libredwg-web-*.wasm` de ≈9.96 MB y el workflow de Pages publica `dist` automáticamente.
- `docs/dxf-compatibilidad.md` y el diseño original afirman que, si FModel se publica, debe adoptarse una estrategia compatible o retirarse el lector.
- No se encontró una decisión de licencia del proyecto ni avisos legales integrados para esta distribución.

**Decisión requerida:** elegir una de estas rutas con revisión jurídica cuando corresponda:

- [ ] A. Distribuir FModel bajo términos compatibles con GPL-3.0, con código fuente correspondiente, avisos y textos de licencia.
- [ ] B. Retirar LibreDWG del build público y ofrecer solo DXF.
- [ ] C. Sustituir el lector por una alternativa con licencia aprobada y compatibilidad verificada.

**Archivos previstos:** dependen de la decisión; como mínimo `package.json`, `src/io/dwg/`, comandos/manifest, documentación, avisos de terceros y workflows.

**Criterios de aceptación:**

- [ ] La decisión está documentada por el propietario del producto.
- [ ] El artefacto publicado coincide con esa decisión; no basta ocultar el botón.
- [ ] Licencias, atribuciones, código fuente correspondiente y avisos requeridos están accesibles según la ruta elegida.
- [ ] CI comprueba que una dependencia prohibida no reaparezca o que los avisos requeridos existan.
- [ ] Un profesional competente revisa la conclusión si el producto seguirá distribuyéndose públicamente.

**Verificación:** inspección de `dist`, inventario de licencias y prueba de que OPEN/manifest/docs coinciden con la decisión.

**Referencia informativa:** [GPLv3, especialmente la sección 6](https://www.gnu.org/licenses/gpl-3.0.html#section6) y [guía oficial de GNU sobre distribución de object code](https://www.gnu.org/licenses/quick-guide-gplv3.html). Esta tarea no sustituye asesoría legal.

---

## REL-002 — Hacer que el despliegue dependa de la verificación

- [ ] **Estado:** Abierta
- **Prioridad:** P1 — una entrega puede publicarse aunque falle CI
- **Depende de:** REL-001, CI-001
- **Bloquea:** PERF-002, SEC-001

**Evidencia:** `.github/workflows/deploy-pages.yml` instala y ejecuta `pnpm build`, pero no lint, pruebas, arquitectura ni documentación; corre en paralelo al workflow `ci.yml` y no depende de su resultado.

**Archivos previstos:**

- Modificar: `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`
- Posible crear: workflow reutilizable para evitar duplicación

**Implementación:**

- [ ] Tener una única verificación requerida que ejecute el `pnpm verify` consolidado.
- [ ] Desplegar solo el commit exacto cuyo artefacto fue verificado.
- [ ] Evitar recompilar con toolchain distinta entre prueba y publicación.
- [ ] Conservar control de concurrencia y cancelación segura.

**Criterios de aceptación:**

- [ ] Una prueba/lint/check de capas fallido impide publicar.
- [ ] El artefacto desplegado se construye una vez y se promueve tras verificarlo.
- [ ] Node/pnpm coinciden con `package.json`.

**Verificación:** prueba controlada en PR/branch con un check fallido y uno exitoso.

---

## DOC-001 — Unificar la documentación de DWG y del estado real

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — mensajes contradictorios al usuario
- **Depende de:** REL-001
- **Bloquea:** —

**Evidencia:** README, `HelpDialog` y onboarding dicen “DWG no se admite”; `FEATURES`, arquitectura, compatibilidad, OPEN, LIBRARYIMPORT y el manifiesto PWA sí lo admiten como experimental.

**Archivos previstos:**

- Modificar: `README.md`, `src/ui/dialogs/HelpDialog.tsx`, `src/ui/Onboarding.tsx`, `src/app/features.ts`, `docs/dxf-compatibilidad.md`, `docs/arquitectura.md`, `public/manifest.webmanifest`
- Regenerar: `docs/FEATURES.md`

**Criterios de aceptación:**

- [ ] Todos los puntos dicen lo mismo que la decisión REL-001.
- [ ] Se distingue claramente lectura, escritura, estado experimental, versiones probadas y limitaciones.
- [ ] El manifiesto solo registra extensiones realmente soportadas por el artefacto publicado.
- [ ] Una prueba busca frases/estados incompatibles y falla si reaparecen.

**Verificación:** `pnpm check:features && pnpm vitest run src/app/features.test.ts && pnpm verify`

---

## DOC-002 — Vincular el estado “Disponible” con evidencia

- [x] **Estado:** Cerrada
- **Prioridad:** P2 — evitar promesas superiores a la validación
- **Responsable:** Antigravity · **Inicio:** 2026-09-19 · **Cierre:** 2026-09-19
- **Depende de:** CMD-001, TST-001
- **Bloquea:** —

**Evidencia:**
1. Se centralizó la trazabilidad en el catálogo tipado `src/audit/evidence.ts`. Cada registro enlaza una referencia, archivo de prueba, nombre de prueba, comando ejecutable y comandos cubiertos; no se acepta una lista de strings sin prueba.
2. Se actualizaron `scripts/features-md.mjs` y `docs/FEATURES.md` para incluir la columna `Evidencia` de forma compacta y verificable en cada tabla de área.
3. Se añadió validación estricta en tiempo de ejecución tanto en `scripts/features-md.mjs --check` como en `src/app/features.test.ts`:
   - Ninguna función puede estar marcada como `available` sin evidencia registrada.
   - Todo registro debe tener archivo y marcador existentes, comando ejecutable y cobertura de cada comando declarado `available`.
   - Las funciones experimentales deben documentar de forma obligatoria sus limitaciones en notas bilingües.

**Archivos modificados:**
- `src/app/features.ts`
- `scripts/features-md.mjs`
- `docs/FEATURES.md`
- `src/app/features.test.ts`

**Criterios de aceptación:**

- [x] Cada función enlaza pruebas unitarias, integración, E2E o evidencia manual vigente.
- [x] “Disponible”, “Experimental” y “No comprometido” tienen puertas objetivas.
- [x] La documentación generada muestra limitaciones sin inflar el README.
- [x] CI detecta funciones disponibles sin evidencia mínima.

**Verificación:** `pnpm check:features`, `pnpm vitest run src/app/features.test.ts` y la suite completa validan archivo, marcador, comando ejecutable y relación feature → comando → test.

---

## DOC-003 — Unificar requisitos de desarrollo y operación

- [x] **Estado:** Cerrada
- **Responsable:** Antigravity
- **Inicio:** 2026-09-19
- **Cierre:** 2026-09-19
- **Prioridad:** P3 — onboarding reproducible
- **Depende de:** CI-001
- **Bloquea:** —

**Evidencia:** `package.json` declara `engines: { "node": ">=24.0.0" }` y `packageManager: "pnpm@11.25.0"`. `README.md` documenta Node 24 y pnpm 11. Los workflows configuran Node 24 y dejan que `pnpm/action-setup@v4` lea la única versión declarada en `package.json`; no contienen un segundo `version:` de pnpm.

**Archivos modificados:**
- `package.json`
- `README.md`
- `.github/workflows/deploy-pages.yml`

**Criterios de aceptación:**

- [x] Existe una sola versión/rango soportado y comprobado (Node 24 y pnpm 11).
- [x] Instalación y verificación reproducen `pnpm verify` con la toolchain unificada.
- [x] Los requisitos especiales de scripts quedan alineados con Node 24.

**Cierre:** 2026-09-19

**Verificación:** puertas locales completas pasan; la verificación remota de GitHub Actions del commit final queda registrada al cerrar la tarea.
