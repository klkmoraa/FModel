# Muestras de bloques dinámicos de AutoCAD

DXF y DWG escritos por AutoCAD 2018 (`AC1032`), uno por tipo de parámetro dinámico. Proceden de
[ACadSharp](https://github.com/DomCR/ACadSharp) (`samples/dynamic-blocks`, licencia MIT,
© Albert Domenech). Las usa `src/io/dxf/acadDynamic.test.ts` y `src/io/dwg/acadDynamicDwg.test.ts`:
cada instancia evaluada por FModel se compara con la geometría que AutoCAD guardó en su bloque `*U`.
