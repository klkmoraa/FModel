# Precision Deck para el espacio de trabajo de FModel

Fecha: 2026-09-20 · Estado: dirección visual aprobada por el usuario en el chat

## Objetivo

Hacer que el lienzo vuelva a ser el centro de FModel mediante una interfaz más limpia,
predecible y fluida, inspirada en la jerarquía de FStructure pero adaptada a la profundidad de
un CAD 2D. El cambio reorganiza el acceso a funciones existentes; no modifica geometría,
comandos, precisión, documentos ni compatibilidad de archivos.

## Decisiones aprobadas

- Tema automático según sistema, con selector manual día/noche existente.
- `Precision Deck` como shell principal: topbar silenciosa, lienzo dominante y dock inferior.
- Segmento contextual estable: conserva posición y tamaño, y muestra reposo, comando activo o
  cantidad seleccionada.
- Paneles Propiedades, Capas, Bloques y Paletas flotantes al abrirse, con acción para fijarlos y
  reservar ancho. Solo una superficie principal puede cubrir el lienzo a la vez.
- Biblioteca de herramientas anclada al dock, combinada con accesos por familia. `Ctrl+K`, alias,
  atajos y comandos escritos siguen siendo rutas equivalentes.
- Comando activo, selección de interfaz y foco usan el violeta de FModel: `#7657D5` en día y
  `#A990FF` en noche. Verde confirma, ámbar advierte y rojo queda reservado para peligro, error o
  destrucción real.
- Animación funcional, corta e interrumpible; no hay movimiento ornamental continuo.

## Arquitectura visual

### Topbar

Contiene únicamente marca, documento activo, estado de persistencia local, deshacer/rehacer,
búsqueda y acciones globales. No contiene herramientas de dibujo. El estado de guardado distingue
confirmación, degradación y ausencia de persistencia sin depender solo del color.

### Precision Dock

El dock se divide en tres zonas estables:

1. **Contexto**: Seleccionar en reposo; nombre y prompt del comando mientras se ejecuta; cantidad
   y tipo de selección cuando hay objetos seleccionados.
2. **Favoritos**: seis comandos ordenables por el usuario. La posición nunca cambia de forma
   automática.
3. **Familias**: accesos a Dibujo, Modificar y Todas. En anchos menores se conserva solo Todas.

El dock invoca los mismos `CommandDef` y `CommandRunner` actuales. No crea comandos alternativos
ni estado de dominio dentro de React. Enter/Espacio, Escape, keywords, repetición y alias mantienen
sus contratos vigentes.

### Precision Tool Deck

La acción de una familia abre una única superficie anclada encima del dock con:

- categorías derivadas de `RIBBON`, sin duplicar un segundo catálogo;
- búsqueda por nombre, descripción, alias o tarea, compartida con `Ctrl+K`;
- herramientas recientes en una zona separada que no reordena el catálogo;
- estrella para añadir o quitar favoritos del dock;
- nombre visible, icono, comando canónico y alias principal.

El Deck se cierra con Escape, clic fuera, ejecución de una herramienta o apertura de otra
superficie. Devuelve el foco al control que lo abrió. No convive superpuesto con paneles, diálogos
o la paleta de comandos.

### Comando activo

La línea de comandos conserva historial y entrada escrita. Su presentación se integra en una
barra contextual encima del dock con nombre canónico, prompt actual, valor exacto y keywords. No
se redondean valores para devolverlos al modelo. En móvil se convierte en hoja inferior y mantiene
acciones explícitas para Escape e Intro.

### Selección y paneles

Una selección muestra propiedades rápidas sin abrir automáticamente el inspector completo. Los
lanzadores del borde derecho abren Propiedades, Capas, Bloques o Paletas como panel flotante. La
acción Fijar convierte ese panel en columna acoplada; Desfijar recupera el lienzo completo. El ancho,
panel activo, orden, favoritos y modo fijado son preferencias locales, no datos del dibujo.

## Responsive y dispositivos

- **Escritorio amplio**: dock completo, Tool Deck anclado y panel fijable.
- **Escritorio compacto/tablet horizontal**: menos favoritos visibles, familias condensadas y
  panel flotante; el lienzo no se reduce por defecto.
- **Móvil/tablet vertical**: dock y contexto se convierten en hoja inferior con safe areas,
  desplazamiento horizontal y objetivos táctiles de al menos 40 px. Cada gesto conserva alternativa
  por toque y teclado cuando el dispositivo la ofrece.
- Español e inglés deben caber mediante truncado accesible y tooltip; no se reducen textos por
  debajo de una lectura razonable para mantener una sola línea.

## Movimiento y rendimiento

- Transiciones de 140–180 ms usando exclusivamente `transform` y `opacity`; nunca `transition: all`.
- `prefers-reduced-motion` elimina desplazamiento y escala sin perder el cambio de estado.
- Hover, apertura del Deck y paneles no invalidan el render de geometría ni disparan repintados del
  Canvas. Los eventos del editor se suscriben al mínimo conjunto pertinente.
- No se leen medidas DOM durante render ni se intercalan lecturas y escrituras en un mismo ciclo.
- La biblioteca virtualiza o usa `content-visibility` si supera 50 elementos visibles.
- Objetivo verificable: apertura y cambio de superficie sin tareas largas mayores de 50 ms; p95 de
  cuadro menor de 16,7 ms en el equipo de referencia a 60 Hz. En pantallas de 120 Hz, las
  transiciones de UI deben permanecer en el compositor y responder en el siguiente cuadro; no se
  promete una frecuencia que el hardware o el documento no puedan sostener.

## Accesibilidad e interacción

- Botones semánticos, nombre accesible para iconos, foco visible y navegación completa por teclado.
- El Tool Deck usa patrón de diálogo no modal o popover con foco contenido solo mientras está
  abierto; Escape cierra y restaura foco.
- Tabs y paneles conservan `aria-selected`, `aria-controls` y relación con su panel visible.
- Actualizaciones de guardado, error y finalización usan una región `aria-live="polite"`.
- Overlays no cubren el elemento enfocado; hojas y paneles contienen overscroll.
- Estados activo, seleccionado, bloqueado, advertencia y error combinan color, texto e icono.
- Inputs conservan label accesible, nombre, tipo e `autocomplete="off"` cuando corresponda a datos
  CAD, evitando interferencia de gestores de contraseñas.

## Estado y persistencia

La fuente de verdad sigue siendo `Editor` y `EditorPreferences`. La evolución de preferencias añade
solo datos de presentación: favoritos, familia reciente y paneles fijados. Una preferencia ausente,
inválida o procedente de una versión anterior cae en valores seguros. Ninguna preferencia nueva
entra al documento `.fmodel`, se sincroniza por red o afecta undo/redo.

## Integración con la implementación actual

- `src/ui/App.tsx`: orquesta la superficie activa y compone el shell; no absorbe lógica de paneles.
- `src/ui/Ribbon.tsx` y `src/ui/ribbonConfig.ts`: el catálogo existente alimenta Tool Deck; la cinta
  deja de ser permanente, pero no se elimina el contrato de configuración.
- `src/ui/CommandLine.tsx`: conserva entrada, sugerencias e historial; expone presentación compacta
  sin duplicar estado de `CommandRunner`.
- `src/ui/Docks.tsx`: separa contenido de panel y presentación flotante/fijada; los paneles actuales
  se reutilizan sin cambiar su dominio.
- `src/ui/StatusBar.tsx`: conserva coordenadas, unidades, escalas y estados de dibujo en una versión
  compacta.
- `src/ui/MobileBar.tsx`: adopta el mismo modelo contextual como hoja táctil.
- `src/styles/tokens.css`: añade roles de shell y movimiento sin crear una paleta paralela.

Si un componente resulta demasiado grande durante la implementación, se extraerán controladores de
presentación y componentes puros; no se hará un refactor general fuera de este shell.

## Errores y degradación

- Fallo al guardar preferencias: la sesión continúa con valores en memoria y un aviso accionable.
- Preferencias corruptas: se normalizan sin modificar el dibujo.
- API de tema o media query ausente: se usa tema día seguro.
- Apertura de panel/Deck durante un comando: no cancela ni muta el comando; al cerrarse devuelve el
  foco a la interacción previa.
- Una superficie que falla al renderizar no debe desmontar el canvas ni perder selección.

## Pruebas y evidencia

- Unitarias del reductor/controlador de superficies: exclusión mutua, apertura, cierre, fijación,
  restauración de foco y fallback de preferencias.
- Componentes: categorías derivadas de `RIBBON`, búsqueda, favoritos, alias, estados del segmento
  contextual y etiquetas bilingües.
- Interacción: teclado completo, Escape/Enter, clic fuera, selección, comando activo, panel fijado y
  retorno de foco.
- Responsive: escritorio amplio, compacto, tablet y móvil; día, noche y movimiento reducido.
- Rendimiento: traza de apertura/cierre sin long tasks y comprobación de que el Canvas no vuelve a
  renderizar por hover del chrome.
- Auditoría final contra Web Interface Guidelines y revisión real en Chrome, Edge y Safari.
- Puerta de cierre: pruebas focalizadas, `pnpm lint && pnpm verify`, `git diff --check` y revisión del
  diff de archivos tocados.

## Criterios de aceptación

1. Todas las acciones visibles actuales siguen alcanzables por dock, Tool Deck, panel, `Ctrl+K`,
   alias o atajo, según su contrato vigente.
2. El lienzo ocupa el espacio principal en reposo y ningún panel lateral permanece abierto por
   defecto para usuarios nuevos.
3. Un usuario puede abrir, fijar, redimensionar, desfijar y cerrar paneles sin perder selección,
   comando activo ni foco lógico.
4. Día y noche conservan jerarquía, contraste y semántica cromática; un comando normal nunca usa
   rojo.
5. Teclado, ratón/trackpad y touch tienen rutas equivalentes para la superficie afectada.
6. El cambio no altera geometría, historial, documento nativo, DXF/DWG, persistencia de dibujos ni
   render del modelo.
7. Las transiciones respetan los límites definidos y no introducen una regresión medible del Canvas.

## Fuera de alcance

- Cambiar el comportamiento interno de comandos, snaps, selección, geometría o undo/redo.
- Añadir BIM, 3D, backend, cuentas, telemetría o nuevas llamadas de red.
- Rediseñar la pantalla de bienvenida, los diálogos especializados o el contenido interno de cada
  panel salvo ajustes necesarios para encajar en la nueva presentación.
- Prometer 120 fps en hardware o documentos que no lo permiten; se optimiza el chrome y se mide.
