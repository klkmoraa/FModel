# Política y medición de cobertura de pruebas — FModel

Este documento establece la línea base de cobertura de código, la configuración del proveedor en Vitest y la política de umbrales para garantizar la calidad y evitar regresiones en FModel.

## 1. Configuración y ejecución

La cobertura se mide con `@vitest/coverage-v8` utilizando la configuración unificada en `vite.config.ts`.
El comando local y de integración continua es:

```bash
pnpm test:coverage
```

Genera reportes en consola y reporte detallado LCOV en `coverage/lcov-report/index.html`.

### Exclusiones justificadas
- `src/**/*.test.ts`: archivos de pruebas unitarias.
- `src/**/*.d.ts`: definiciones de tipos de TypeScript sin código de ejecución.
- `src/**/*.css`: hojas de estilo declarativas.
- `src/main.tsx`: punto de montaje del DOM en el navegador.
- `src/workers/heavy.worker.ts`: entrypoint del Web Worker dedicado cargado mediante worker thread.

---

## 2. Línea base por subsistema

A fecha de 2026-09-19 (`main`), tras completar las tareas de integridad y arquitectura, la línea base es:

| Subsistema | Directorio | Líneas (%) | Sentencias (%) | Ramas (%) | Funciones (%) |
|---|---|:---:|:---:|:---:|:---:|
| **Plantillas** | `src/templates/` | **99.7%** | **99.6%** | **90.9%** | **99.1%** |
| **Documento** | `src/document/` | **91.1%** | **86.2%** | **63.7%** | **77.1%** |
| **Índices espaciales** | `src/spatial/` | **85.1%** | **80.8%** | **70.1%** | **87.5%** |
| **Selección** | `src/selection/` | **82.1%** | **72.8%** | **68.5%** | **66.6%** |
| **Persistencia y storage** | `src/storage/` | **76.2%** | **74.0%** | **61.4%** | **71.7%** |
| **Referencias externas (Xref)** | `src/xref/` | **74.9%** | **69.7%** | **44.8%** | **85.7%** |
| **Workers** | `src/workers/` | **71.7%** | **63.7%** | **48.2%** | **76.1%** |
| **Geometría** | `src/geometry/` | **70.3%** | **68.5%** | **56.2%** | **66.6%** |
| **Snaps y coordenadas** | `src/snap/` | **61.6%** | **57.7%** | **47.5%** | **66.6%** |
| **Transformación de vista** | `src/view/` | **54.2%** | **51.3%** | **58.3%** | **41.6%** |
| **Comandos de aplicación** | `src/commands/` | **52.3%** | **48.1%** | **37.2%** | **48.0%** |
| **Modelo de entidades** | `src/model/` | **43.1%** | **40.4%** | **29.8%** | **41.2%** |
| **Editor / Runner** | `src/editor/` | **35.0%** | **31.3%** | **21.7%** | **40.6%** |
| **Interfaz de usuario** | `src/ui/` | **5.3%** | **5.6%** | **4.9%** | **3.4%** |
| **Global total** | **`src/**`** | **49.7%** | **46.5%** | **35.4%** | **35.5%** |

---

## 3. Umbrales aplicados y política de no retroceso

Los umbrales mínimos forzados en `vite.config.ts` evitan regresiones y exigen mayor rigor en las capas críticas del CAD:

- **Global:**
  - Líneas: >= 48%
  - Sentencias: >= 45%
  - Ramas: >= 34%
  - Funciones: >= 34%
- **Capa crítica de Documento (`src/document/**`):**
  - Líneas: >= 85%
  - Sentencias: >= 80%
- **Persistencia local (`src/storage/**`):**
  - Líneas: >= 70%
  - Sentencias: >= 70%
- **Matemáticas y Geometría (`src/geometry/**`):**
  - Líneas: >= 65%
  - Sentencias: >= 65%

## 4. Reglas de calidad para pruebas
1. No se permiten pruebas vacías o aserciones triviales con el único fin de inflar métricas.
2. Todo caso degenerado (coordenadas repetidas, radios cero, matrices singulares, documentos corruptos) debe probarse con aserciones explícitas.
3. Si en algún momento se añade una directiva `/* c8 ignore */` o `/* v8 ignore */`, es obligatorio acompañarla de un comentario con la justificación técnica demostrable.
