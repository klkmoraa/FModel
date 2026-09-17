/**
 * Estado real de las funciones de FModel 2D CAD. Es la fuente de la pestaña «Estado de
 * funciones» de la ayuda y de docs/FEATURES.md: solo se marca «Disponible» lo que funciona
 * de extremo a extremo y está probado.
 */
export type FeatureStatus = 'available' | 'experimental' | 'planned' | 'not-committed';

export interface Feature {
  area: { es: string; en: string };
  name: { es: string; en: string };
  status: FeatureStatus;
  commands?: string[];
  note?: { es: string; en: string };
}

const F = (areaEs: string, areaEn: string, es: string, en: string, status: FeatureStatus, commands?: string[], note?: [string, string]): Feature => ({
  area: { es: areaEs, en: areaEn },
  name: { es, en },
  status,
  commands,
  note: note ? { es: note[0], en: note[1] } : undefined,
});

export const FEATURES: Feature[] = [
  F('Lienzo', 'Canvas', 'Zoom, encuadre, extensión, zoom a selección y vistas guardadas', 'Zoom, pan, extents, zoom to selection and saved views', 'available', ['ZOOM', 'PAN', 'VIEW']),
  F('Lienzo', 'Canvas', 'Rejilla, coordenadas, cruz CAD y previsualización', 'Grid, coordinates, CAD crosshair and previews', 'available', ['GRIDTOGGLE', 'DSETTINGS']),
  F('Lienzo', 'Canvas', 'Selección por ventana, captura, polígono, borde, tipo y capa; ciclo de selección', 'Window, crossing, polygon, fence, type and layer selection; selection cycling', 'available', ['QSELECT', 'SELECTSIMILAR']),
  F('Lienzo', 'Canvas', 'Aislar, ocultar, bloquear y pantalla limpia; paneles acoplables', 'Isolate, hide, lock and clean screen; dockable panels', 'available', ['ISOLATEOBJECTS', 'HIDEOBJECTS', 'CLEANSCREENON']),
  F('Lienzo', 'Canvas', 'Uso táctil (encuadre, pellizco, pulsación larga) y paneles en hoja móvil', 'Touch use (pan, pinch, long press) and mobile sheet panels', 'experimental', undefined, ['Diseñado para tableta; en teléfono el dibujo detallado es limitado por el tamaño de pantalla.', 'Designed for tablets; detailed drafting on phones is limited by screen size.']),
  F('Precisión', 'Precision', 'Coordenadas absolutas, relativas y polares; distancia directa; entrada dinámica', 'Absolute, relative and polar coordinates; direct distance; dynamic input', 'available', ['DYNTOGGLE']),
  F('Precisión', 'Precision', 'Orto, rastreo polar, referencias a objetos permanentes y temporales, rastreo OTRACK, Tab entre candidatos', 'Ortho, polar tracking, running and temporary object snaps, OTRACK, Tab cycling', 'available', ['ORTHOTOGGLE', 'POLARTOGGLE', 'OSNAP', 'OTRACKTOGGLE']),
  F('Dibujo', 'Draw', 'Línea, polilínea, círculo, arco, rectángulo, polígono, elipse, spline, punto, rayo, línea auxiliar, nube de revisión, arandela', 'Line, polyline, circle, arc, rectangle, polygon, ellipse, spline, point, ray, xline, revision cloud, donut', 'available', ['LINE', 'PLINE', 'CIRCLE', 'ARC', 'RECTANG', 'POLYGON', 'ELLIPSE', 'SPLINE', 'POINT', 'RAY', 'XLINE', 'REVCLOUD', 'DONUT']),
  F('Dibujo', 'Draw', 'Sombreado con islas, contorno, región, cobertura, multilínea, dividir y medir', 'Hatch with islands, boundary, region, wipeout, multiline, divide and measure', 'available', ['HATCH', 'BOUNDARY', 'REGION', 'WIPEOUT', 'MLINE', 'DIVIDE', 'MEASURE']),
  F('Dibujo', 'Draw', 'Texto, texto de párrafos, directriz múltiple y tabla', 'Text, mtext, multileader and table', 'available', ['TEXT', 'MTEXT', 'MLEADER', 'TABLE']),
  F('Modificar', 'Modify', 'Borrar, desplazar, copiar, girar, escalar, simetría, desfase, recortar, alargar, empalme, chaflán, estirar', 'Erase, move, copy, rotate, scale, mirror, offset, trim, extend, fillet, chamfer, stretch', 'available', ['ERASE', 'MOVE', 'COPY', 'ROTATE', 'SCALE', 'MIRROR', 'OFFSET', 'TRIM', 'EXTEND', 'FILLET', 'CHAMFER', 'STRETCH']),
  F('Modificar', 'Modify', 'Matrices rectangular, polar y por trayectoria (asociativas)', 'Rectangular, polar and path arrays (associative)', 'available', ['ARRAYRECT', 'ARRAYPOLAR', 'ARRAYPATH']),
  F('Modificar', 'Modify', 'Juntar, partir, partir en punto, descomponer, editar polilínea, longitud, alinear, invertir, orden de dibujo, grupos, operaciones booleanas', 'Join, break, break at point, explode, edit polyline, lengthen, align, reverse, draw order, groups, booleans', 'available', ['JOIN', 'BREAK', 'BREAKATPOINT', 'EXPLODE', 'PEDIT', 'LENGTHEN', 'ALIGN', 'REVERSE', 'DRAWORDER', 'GROUP', 'UNION']),
  F('Capas y propiedades', 'Layers and properties', 'Administrador de capas: estados, filtros, aislar, fusionar, congelación por viewport; herencia PorCapa/PorBloque', 'Layer manager: states, filters, isolate, merge, per-viewport freeze; ByLayer/ByBlock inheritance', 'available', ['LAYER', 'LAYERSTATE', 'LAYISO', 'LAYMRG', 'VPLAYER']),
  F('Capas y propiedades', 'Layers and properties', 'Inspector de propiedades con edición por lotes e igualar propiedades', 'Properties inspector with batch editing and match properties', 'available', ['PROPERTIES', 'MATCHPROP']),
  F('Anotación', 'Annotation', 'Estilos de texto, cota, directriz múltiple, tabla y multilínea; lista de escalas', 'Text, dimension, multileader, table and multiline styles; scale list', 'available', ['STYLE', 'SCALELISTEDIT']),
  F('Anotación', 'Annotation', 'Cotas lineales, alineadas, angulares, radio, diámetro, arco, coordenada, continuas y de línea base; asociativas', 'Linear, aligned, angular, radius, diameter, arc, ordinate, continue and baseline dimensions; associative', 'available', ['DIMLINEAR', 'DIMALIGNED', 'DIMANGULAR', 'DIMRADIUS', 'DIMDIAMETER', 'DIMARC', 'DIMORDINATE', 'DIMCONTINUE', 'DIMBASELINE']),
  F('Anotación', 'Annotation', 'Campos, tolerancias, prefijos/sufijos, unidades alternativas y escala anotativa', 'Fields, tolerances, prefix/suffix, alternate units and annotative scale', 'available', ['FIELD']),
  F('Bloques', 'Blocks', 'Definiciones, inserción con autoescala, atributos, extracción, biblioteca compartida local', 'Definitions, insertion with unit scaling, attributes, extraction, local shared library', 'available', ['BLOCK', 'INSERT', 'ATTDEF', 'ATTEDIT', 'DATAEXTRACTION', 'WBLOCK']),
  F('Bloques', 'Blocks', 'Bloques dinámicos: parámetros, acciones, estados de visibilidad, tablas de consulta, fórmulas y variables', 'Dynamic blocks: parameters, actions, visibility states, lookup tables, formulas and variables', 'available', ['BEDIT', 'BPARAMETER', 'BACTION', 'BVSTATE', 'BVARIABLE']),
  F('Bloques', 'Blocks', 'Editor de bloques con prueba, edición en contexto, validación y vista previa en vivo', 'Block editor with testing, in-place editing, validation and live preview', 'available', ['BEDIT', 'BTESTBLOCK', 'BCLOSE']),
  F('Bloques', 'Blocks', 'Restricciones geométricas y dimensionales dentro de bloques', 'Geometric and dimensional constraints inside blocks', 'experimental', ['BCONSTRAINT', 'BCPARAMETER'], ['El resolvedor es numérico; los glifos de restricción aún no se dibujan en el lienzo.', 'The solver is numeric; constraint glyphs are not drawn on the canvas yet.']),
  F('Paletas', 'Palettes', 'Paletas de herramientas con categorías, favoritos, búsqueda y arrastrar y soltar', 'Tool palettes with categories, favorites, search and drag and drop', 'available', ['TOOLPALETTES']),
  F('Presentaciones', 'Layouts', 'Presentaciones, viewports rectangulares, poligonales y de objeto, escala bloqueada, capas por viewport', 'Layouts, rectangular, polygonal and object viewports, locked scale, per-viewport layers', 'available', ['LAYOUT', 'MVIEW', 'MSPACE', 'PSPACE', 'VPSCALE', 'VPLOCK']),
  F('Presentaciones', 'Layouts', 'Configuración de página, cajetín con campos', 'Page setup, title block with fields', 'available', ['PAGESETUP', 'TITLEBLOCK']),
  F('Salida', 'Output', 'PDF vectorial por hoja y publicación multipágina; monocromo y escala de grises; grosores', 'Vector PDF per sheet and multi-page publishing; monochrome and grayscale; lineweights', 'available', ['PLOT', 'EXPORTPDF', 'PUBLISH']),
  F('Salida', 'Output', 'SVG en milímetros', 'Millimetre SVG', 'available', ['EXPORTSVG']),
  F('Intercambio', 'Interchange', 'Formato nativo versionado .fmodel y JSON de depuración', 'Versioned native .fmodel format and debug JSON', 'available', ['QSAVE', 'SAVEAS', 'OPEN', 'EXPORTJSON']),
  F('Intercambio', 'Interchange', 'Importación y exportación DXF con informe de conversión', 'DXF import and export with conversion report', 'available', ['IMPORTDXF', 'EXPORTDXF'], ['Detalle en docs/dxf-compatibilidad.md.', 'Details in docs/dxf-compatibilidad.md.']),
  F('Intercambio', 'Interchange', 'CSV/JSON de atributos y tablas', 'Attribute and table CSV/JSON', 'available', ['DATAEXTRACTION']),
  F('Intercambio', 'Interchange', 'DWG', 'DWG', 'not-committed', undefined, ['No hay una solución legal y fiable para una aplicación web; no se simula.', 'There is no legal and reliable solution for a web app; it is not simulated.']),
  F('Referencias', 'References', 'Dibujos referenciados (enlazar/superponer), recarga, descarga, unión, ruta, detección de ciclos', 'Referenced drawings (attach/overlay), reload, unload, bind, repath, cycle detection', 'available', ['XATTACH', 'XREFMANAGER', 'XRELOAD', 'XBIND', 'XREPATH']),
  F('Referencias', 'References', 'Imágenes y calcos PDF con recorte, opacidad, atenuación y bloqueo', 'Images and PDF underlays with clip, opacity, fade and lock', 'available', ['IMAGEATTACH', 'PDFATTACH', 'IMAGECLIP', 'IMAGEADJUST']),
  F('Referencias', 'References', 'Referencias a objetos sobre la geometría de calcos PDF', 'Object snaps on PDF underlay geometry', 'planned'),
  F('Calidad', 'Quality', 'Auditoría con corrección, informe de salud, limpieza de duplicados y elementos sin uso', 'Audit with fixes, health report, duplicate and unused cleanup', 'available', ['AUDIT', 'HEALTHREPORT', 'OVERKILL', 'PURGE']),
  F('Calidad', 'Quality', 'Comparación de revisiones', 'Revision comparison', 'available', ['COMPARE']),
  F('Productividad', 'Productivity', 'Paleta de comandos, alias y atajos configurables, repetir último, favoritos, ayuda contextual', 'Command palette, configurable aliases and shortcuts, repeat last, favorites, contextual help', 'available', ['OPTIONS', 'HELP']),
  F('Productividad', 'Productivity', 'Autoguardado, recuperación tras cierre y versiones locales', 'Autosave, crash recovery and local versions', 'available', ['VERSIONS', 'RECOVER']),
  F('Productividad', 'Productivity', 'Español e inglés', 'Spanish and English', 'available', ['OPTIONS']),
  F('Productividad', 'Productivity', 'Uso sin conexión instalable (PWA)', 'Installable offline use (PWA)', 'planned'),
  F('Rendimiento', 'Performance', 'Índice espacial, renderizado por lotes con caché de trazados', 'Spatial index, batched rendering with path cache', 'available'),
  F('Rendimiento', 'Performance', 'Operaciones pesadas (DXF grandes, auditoría) en segundo plano con Web Workers', 'Heavy operations (large DXF, audit) in background Web Workers', 'planned'),
];

export const STATUS_LABEL: Record<FeatureStatus, { es: string; en: string; tone: string }> = {
  available: { es: 'Disponible', en: 'Available', tone: 'disponible' },
  experimental: { es: 'Experimental', en: 'Experimental', tone: 'experimental' },
  planned: { es: 'Planeado', en: 'Planned', tone: 'planeado' },
  'not-committed': { es: 'No comprometido', en: 'Not committed', tone: 'no-comprometido' },
};
