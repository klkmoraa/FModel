# Parte 4 — Bloques dinámicos de AutoCAD: plan (tal como se ejecutó)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Importar bloques dinámicos de AutoCAD (DXF y DWG) como bloques dinámicos de FModel cuando la traducción sea verificable; si no, conservar la geometría estática y explicarlo.

**Architecture:** `io/dxf/acadDynamic.ts` lee el grafo de evaluación de cada definición (parámetros y acciones por nodo, selecciones por handle, conjuntos de valores) y los datos por nodo de cada instancia; `importDxfFile` omite los `*U` de definiciones traducibles, apunta las instancias a la definición con su estado y adjunta la definición con los IDs importados. Referencia de códigos: lector DXF de ACadSharp (MIT).

**Spec:** `docs/superpowers/specs/2026-09-17-bloques-biblioteca-dwg-design.md` (Parte 4)

### Task 1: Muestras
- [x] `src/io/dxf/fixtures/acad-dynamic/`: DXF+DWG de AutoCAD 2018 por tipo (ACadSharp, MIT), con README de atribución.

### Task 2: Lector y traducción
- [x] Parámetros lineal (conjunto de valores), punto, rotación (ángulo absoluto normalizado al rango), simetría, visibilidad (las entidades controladas quedan visibles y decide el parámetro; las que no aparecen en ningún estado, invisibles), punto base.
- [x] Acciones desplazar, estirar (marco de 2 esquinas → rectángulo), escalar, girar, simetría; conexiones por código o por nombre (LibreDWG usa otros códigos).
- [x] Estado de instancia desde `ACAD_ENHANCEDBLOCKDATA`.

### Task 3: Verificación
- [x] `acadDynamic.test.ts`: por tipo admitido, cada instancia = geometría `*U` de AutoCAD (caja y número de entidades); por tipo no admitido, geometría estática idéntica y aviso.
- [x] `acadDynamicDwg.test.ts`: el DWG equivalente da el mismo resultado.
- [x] Estado Experimental en `features.ts`; `dxf-compatibilidad.md`.
