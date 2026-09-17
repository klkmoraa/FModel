# Tolerancias geométricas

Todas las coordenadas del documento están en **unidades de dibujo** (mundo). Las tolerancias expresadas en píxeles (apertura de referencia a objetos, caja de designación, pinzamientos) se convierten a unidades de dibujo en la capa de vista multiplicando por el tamaño del píxel (`worldPerPixel`) y **nunca se guardan en el documento**.

## Núcleo — `src/geometry/tolerance.ts`

La geometría base (vectores, ángulos, curvas, intersecciones, polilíneas) usa solo estas constantes:

| Constante | Valor | Uso |
|---|---|---|
| `TOL.LINEAR` | 1e-9 | coincidencia de puntos, longitudes nulas |
| `TOL.ANGULAR` | 1e-10 rad | paralelismo, ángulos iguales |
| `TOL.PARAM` | 1e-9 | parámetros normalizados de curva en [0, 1] |
| `TOL.RELATIVE` | 1e-12 | factor relativo para coordenadas grandes (p. ej. UTM ≈ 1e6) |
| `TOL.TESSELLATION` | 1e-3 unidades | desviación cordal al teselar curvas |
| `TOL.NEWTON_MAX_ITER` | 32 | refinamiento numérico de intersecciones con splines y elipses |

`linearTol(magnitud)` devuelve `max(TOL.LINEAR, |magnitud| · TOL.RELATIVE)` y `nearEqual(a, b)` aplica esa escala relativa, de modo que un plano georreferenciado no pierde coincidencias por redondeo de doble precisión.

## Tolerancias de operación

Las operaciones de más alto nivel declaran su tolerancia explícitamente (y la exponen cuando tiene sentido para el usuario):

| Operación | Tolerancia | Dónde |
|---|---|---|
| OVERKILL (duplicados y colineales) | 1e-6 unidades por defecto, configurable en el comando | `src/audit/overkill.ts` |
| AUDIT / HEALTHREPORT (duplicados, longitud nula) | 1e-6 unidades | `src/audit/health.ts` |
| Polilínea «casi cerrada» | 1e-4 unidades (o la de auditoría si es mayor) | `src/audit/health.ts` |
| Autointersección de polilíneas | 1e-6; los contactos en vértices no cuentan como cruce | `src/audit/health.ts` |
| Detección de contornos (HATCH, BOUNDARY) | 1e-6 unidades para uniones de aristas | `src/geometry/boundary.ts` |
| Designación de puntos en comandos de modificación | 5 % del píxel, mínimo 1e-4 unidades | `src/commands/modify.ts` |
| Arcos a Bézier en PDF/SVG | error radial ≤ 2,7e-4 · r (tramos de ≤ 90°) | `src/output/bezier.ts` |
| Patrones de línea al trazar | patrones de menos de 0,5 mm impresos se trazan continuos | `src/output/vectorSink.ts` |
| Grosor mínimo impreso | 0,05 mm; sin grosores, línea fina de 0,13 mm | `src/output/vectorSink.ts` |
| Restricciones de bloques dinámicos | objetivo de residuo 1e-10; se acepta como resuelto hasta 1e-7 y por encima se marca conflicto (Gauss-Newton amortiguado) | `src/constraints/solver.ts` |
| Curvas suavizadas exportadas a DXF | 1e-3 unidades | `src/io/dxf/exportDxf.ts` |

## Reglas

1. Las funciones del núcleo geométrico usan `TOL` o reciben `tol` como parámetro; los valores por defecto locales se documentan en esta tabla o junto a la función (p. ej. el rayo que busca la arista más cercana en `boundary.ts` usa 1e-12 para no perder cruces rasantes).
2. Ninguna tolerancia en píxeles entra en el modelo.
3. Un redondeo para mostrar (`roundTo`) nunca se escribe en el documento.
