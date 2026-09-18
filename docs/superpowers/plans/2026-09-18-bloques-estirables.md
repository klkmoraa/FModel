# Bloques estirables, biblioteca inicial y muebles paramétricos: plan (tal como se ejecutó)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Spec:** `docs/superpowers/specs/2026-09-18-bloques-estirables-design.md`

- [x] Task 1 — `blocks/stretchable.ts`: `cutPosition`, `niceIncrement`, `stretchableDefinition`, `makeStretchable`, `stretchablePackage`; pruebas de medida exacta, piezas sin deformar, conjunto de valores y rechazo de bloques dinámicos.
- [x] Task 2 — `BESTIRABLE`, botón en el panel Dibujo y en las tarjetas de la biblioteca, casilla «Estirable» al importar (mobiliario por defecto).
- [x] Task 3 — 100 DXF de LibreCAD en `public/library/librecad/` con `index.json` (nombres, categorías, unidades reales) y README de licencia; `blocks/starterLibrary.ts`; prueba que convierte los 100.
- [x] Task 4 — `blocks/furniture.ts`: doce muebles paramétricos (matriz para hojas y sillas); pruebas de hojas, sillas, anchos de cama y brazos del sofá; nombres sin choque con LibreCAD.
- [x] Task 5 — `LIBRARYSTARTER` (idempotente, sin nombres repetidos, miniaturas), botón en la biblioteca, `public/library` fuera de la precarga, estado de funciones y arquitectura.
- [x] Verificación en el navegador: 112 bloques instalados; clóset de correderas insertado y alargado de 1800 a 3000 desde Propiedades (de 3 a 5 hojas).
