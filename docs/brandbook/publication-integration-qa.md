# Separación de la candidata de publicación

Base exacta: `f55f0e8a5340bf159483dcd337e6f31dfa086ddf`. No se incluyeron las modificaciones anteriores ajenas de la carpeta local. El inventario y los hashes, patch, baseline y pruebas están en `/tmp/fmodel-publish-20261020/`.

[QA del árbol exacto, alcance y capturas](six-cad-improvements-qa.md). Los 1430 casos de esta integración son distintos de los 1609 del árbol local mixto anterior. El fix de room-recognition (TST-003 local) permanece únicamente en ese árbol; en HEAD la prueba original ya pasa sin dicho subsistema. ROOMDATA sirve como editor nativo existente, sin portar ROOMPROPERTIES.

También se corrigió un getter recursivo ya presente en HEAD: lectura de último punto sin punto activo. Dos regresiones RED→GREEN y un clic real de Aceptar en LINE fresca acreditan la corrección; no se trasladó ningún subsistema ajeno.
