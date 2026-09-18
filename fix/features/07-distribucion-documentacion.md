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

- [ ] **Estado:** Abierta
- **Prioridad:** P2 — evitar promesas superiores a la validación
- **Depende de:** CMD-001, TST-001
- **Bloquea:** —

**Evidencia:** el catálogo genera correctamente 42 funciones disponibles, pero hoy la prueba garantiza principalmente que los comandos existan. Algunas afirmaciones —PWA, táctil y recorridos completos— dependen del navegador/dispositivo y no tienen evidencia automatizada equivalente.

**Archivos previstos:**

- Modificar: `src/app/features.ts`, `scripts/features-md.mjs`, `docs/FEATURES.md`
- Crear: `docs/testing.md` o matriz generada de evidencia

**Criterios de aceptación:**

- [ ] Cada función enlaza pruebas unitarias, integración, E2E o evidencia manual vigente.
- [ ] “Disponible”, “Experimental” y “No comprometido” tienen puertas objetivas.
- [ ] La documentación generada muestra limitaciones sin inflar el README.
- [ ] CI detecta funciones disponibles sin evidencia mínima.

**Verificación:** `pnpm check:features && pnpm verify`

---

## DOC-003 — Unificar requisitos de desarrollo y operación

- [ ] **Estado:** Abierta
- **Prioridad:** P3 — onboarding reproducible
- **Depende de:** CI-001
- **Bloquea:** —

**Evidencia:** `package.json` acepta Node `>=22.13`, README recomienda Node 24 y añade un requisito `>=23.6` para documentación. Los workflows usan Node 24, pero pnpm 10/11.

**Archivos previstos:** `package.json`, `README.md`, workflows y, si aplica, `.nvmrc`/`.node-version`.

**Criterios de aceptación:**

- [ ] Existe una sola versión/rango soportado y comprobado.
- [ ] Instalación desde clon limpio reproduce `pnpm verify`.
- [ ] Los requisitos especiales de scripts se eliminan o se validan automáticamente con mensaje claro.

**Verificación:** instalación limpia con versiones declaradas + `pnpm verify`
