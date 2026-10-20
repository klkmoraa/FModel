# Separación de la candidata de publicación

Base exacta: `f55f0e8a5340bf159483dcd337e6f31dfa086ddf`. No se incluyeron las modificaciones anteriores ajenas de la carpeta local. El inventario y los hashes, patch, baseline y pruebas están en `/tmp/fmodel-publish-20261020/`.

[QA del árbol exacto, alcance y capturas](six-cad-improvements-qa.md). Los 1430 casos de esta integración son distintos de los 1609 del árbol local mixto anterior. El fix de room-recognition (TST-003 local) permanece únicamente en ese árbol; en HEAD la prueba original ya pasa sin dicho subsistema. ROOMDATA sirve como editor nativo existente, sin portar ROOMPROPERTIES.

También se corrigió un getter recursivo ya presente en HEAD: lectura de último punto sin punto activo. Dos regresiones RED→GREEN y un clic real de Aceptar en LINE fresca acreditan la corrección; no se trasladó ningún subsistema ajeno.

## Recuperación de CI posterior a ff948b2

El despliegue Pages de `ff948b2910565cc775707ccb293fb9b75a41bc9a` terminó correctamente. La CI se canceló por el presupuesto global de 15 minutos: completó Chromium y llegó a WebKit, con fallos reproducibles en tres escenarios. Se conservaron los límites de cada prueba, los reintentos, los motores y sus aserciones funcionales; el presupuesto del job pasa a 25 minutos (158 escenarios, incluidos dos nuevos recorridos de foco por motor).

- La fixture PNG de 1 px ya tenía un CRC IDAT inválido en la base f55f0e8. Se corrigieron únicamente sus tres bytes CRC, sin alterar los píxeles; los tres chunks son válidos y se mantienen las comprobaciones de imagen incrustada y anchura natural.
- WebKit omite la sombra y ajusta el radio del select nativo. Fondo, borde, color, nombre, valor e interacción permanecen comprobados; el input de autoguardado acredita el radio de 12 px y la sombra inset. No se sustituye el control nativo ni se añaden excepciones por navegador. Su contorno de foco usa el token de interacción, pues WebKit también omite la sombra de foco.
- La secuencia táctil podía empezar con el editor aún a 800×600 y el lienzo a 390×794. Se espera a que el lienzo visible y la transformación coincidan de forma estable y a cada solicitud de punto; se conservan los toques, la selección y el borrado. A/B con f55f0e8 y ff948b2, con esa preparación, mantiene la selección correcta.

Validación focal: 71 casos aprobados en el primer recorrido de los tres specs en Chromium/WebKit; el escenario de material ajustado después pasa 2/2 en ambos motores. No se afirma una segunda ejecución completa de esos 72 casos. TypeScript, lint, build público e inspección de sus 189 archivos: exit 0. Cuatro comprobaciones adicionales de foco WebKit: exit 0. La nueva ejecución remota queda pendiente del commit de recuperación; la matriz E2E completa corresponde a esa CI, no a esta ejecución local. Evidencia cruda en `/tmp/fmodel-publish-20261020/ci-diagnosis/`.

Capturas originales WebKit: Opciones [Día](assets/ci-recovery-options-day-focus.png) / [Noche](assets/ci-recovery-options-night-focus.png); UNITS [Día](assets/ci-recovery-units-day-focus.png) / [Noche](assets/ci-recovery-units-night-focus.png). No se acredita Safari de dispositivo físico.
