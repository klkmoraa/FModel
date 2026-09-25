export interface RibbonTool {
  cmd: string;
  icon: string;
  label: { es: string; en: string };
  size?: 'lg' | 'sm';
  args?: string[];
}

export interface RibbonGroup {
  label: { es: string; en: string };
  tools: RibbonTool[];
}

export interface RibbonTab {
  id: string;
  label: { es: string; en: string };
  groups: RibbonGroup[];
}

const t = (cmd: string, icon: string, es: string, en: string, size: 'lg' | 'sm' = 'sm', args?: string[]): RibbonTool => ({ cmd, icon, label: { es, en }, size, args });

export const RIBBON: RibbonTab[] = [
  {
    id: 'geotechnics',
    label: { es: 'Geotecnia', en: 'Geotechnics' },
    groups: [
      { label: { es: 'Incrementos de esfuerzo', en: 'Stress increments' }, tools: [t('NEWMARK', 'circle', 'Carta de Newmark', 'Newmark chart', 'lg')] },
    ],
  },
  {
    id: 'home',
    label: { es: 'Inicio', en: 'Home' },
    groups: [
      {
        label: { es: 'Dibujo', en: 'Draw' },
        tools: [
          t('LINE', 'line', 'Línea', 'Line', 'lg'),
          t('PLINE', 'pline', 'Polilínea', 'Polyline', 'lg'),
          t('CIRCLE', 'circle', 'Círculo', 'Circle', 'lg'),
          t('ARC', 'arc', 'Arco', 'Arc', 'lg'),
          t('RECTANG', 'rect', 'Rectángulo', 'Rectangle'),
          t('POLYGON', 'polygon', 'Polígono', 'Polygon'),
          t('ELLIPSE', 'ellipse', 'Elipse', 'Ellipse'),
          t('SPLINE', 'spline', 'Spline', 'Spline'),
          t('HATCH', 'hatch', 'Sombreado', 'Hatch'),
          t('XLINE', 'xline', 'Auxiliar', 'Xline'),
          t('BLEND', 'blend', 'Enlace', 'Blend'),
        ],
      },
      {
        label: { es: 'Modificar', en: 'Modify' },
        tools: [
          t('MOVE', 'move', 'Desplazar', 'Move'),
          t('COPY', 'copy', 'Copiar', 'Copy'),
          t('ROTATE', 'rotate', 'Girar', 'Rotate'),
          t('SCALE', 'scale', 'Escala', 'Scale'),
          t('MIRROR', 'mirror', 'Simetría', 'Mirror'),
          t('STRETCH', 'stretch', 'Estirar', 'Stretch'),
          t('TRIM', 'trim', 'Recortar', 'Trim'),
          t('EXTEND', 'extend', 'Alargar', 'Extend'),
          t('OFFSET', 'offset', 'Desfase', 'Offset'),
          t('FILLET', 'fillet', 'Empalme', 'Fillet'),
          t('CHAMFER', 'chamfer', 'Chaflán', 'Chamfer'),
          t('ARRAYRECT', 'array', 'Matriz', 'Array'),
          t('ERASE', 'erase', 'Borrar', 'Erase'),
          t('EXPLODE', 'explode', 'Descomponer', 'Explode'),
        ],
      },
      {
        label: { es: 'Anotación', en: 'Annotation' },
        tools: [t('MTEXT', 'mtext', 'Texto', 'Text', 'lg'), t('DIMLINEAR', 'dimlinear', 'Cota', 'Dimension', 'lg'), t('MLEADER', 'mleader', 'Directriz', 'Leader'), t('TABLE', 'table', 'Tabla', 'Table')],
      },
      {
        label: { es: 'Capas', en: 'Layers' },
        tools: [t('LAYER', 'layers', 'Capas', 'Layers', 'lg'), t('LAYISO', 'isolate', 'Aislar capa', 'Isolate layer'), t('LAYUNISO', 'layers', 'Restaurar capas', 'Unisolate'), t('LAYWALK', 'laywalk', 'Recorrer capas', 'Layer walk'), t('COPYTOLAYER', 'copytolayer', 'Copiar a capa', 'Copy to layer'), t('MATCHPROP', 'matchprop', 'Igualar', 'Match')],
      },
      {
        label: { es: 'Bloque', en: 'Block' },
        tools: [t('INSERT', 'insert', 'Insertar', 'Insert', 'lg'), t('BLOCK', 'block', 'Crear', 'Create'), t('BEDIT', 'bedit', 'Editar', 'Edit'), t('ATTDEF', 'attdef', 'Atributo', 'Attribute')],
      },
      {
        label: { es: 'Utilidades', en: 'Utilities' },
        tools: [t('DIST', 'measure', 'Medir', 'Measure'), t('MASSPROP', 'massprop', 'Propiedades de masa', 'Mass properties'), t('QSELECT', 'qselect', 'Selección rápida', 'Quick select'), t('ZOOM', 'zoomextents', 'Extensión', 'Extents', 'sm', ['E'])],
      },
    ],
  },
  {
    id: 'insert',
    label: { es: 'Insertar', en: 'Insert' },
    groups: [
      { label: { es: 'Bloque', en: 'Block' }, tools: [t('INSERT', 'insert', 'Insertar', 'Insert', 'lg'), t('BLOCK', 'block', 'Crear bloque', 'Create block', 'lg'), t('WBLOCK', 'export', 'Bloque a biblioteca', 'Block to library'), t('LIBRARYIMPORT', 'insert', 'Importar a biblioteca', 'Import to library'), t('ATTEDIT', 'attdef', 'Editar atributos', 'Edit attributes'), t('DATAEXTRACTION', 'table', 'Extraer atributos', 'Extract attributes')] },
      { label: { es: 'Referencia', en: 'Reference' }, tools: [t('XATTACH', 'xref', 'Enlazar dibujo', 'Attach drawing', 'lg'), t('IMAGEATTACH', 'image', 'Imagen', 'Image', 'lg'), t('PDFATTACH', 'pdf', 'Calco PDF', 'PDF underlay', 'lg'), t('XREFMANAGER', 'xref', 'Referencias', 'References'), t('IMAGECLIP', 'trim', 'Recortar', 'Clip'), t('IMAGEADJUST', 'image', 'Ajustar', 'Adjust')] },
      { label: { es: 'Importar', en: 'Import' }, tools: [t('IMPORTDXF', 'import', 'DXF', 'DXF', 'lg'), t('OPEN', 'import', 'Abrir .fmodel', 'Open .fmodel')] },
    ],
  },
  {
    id: 'annotate',
    label: { es: 'Anotar', en: 'Annotate' },
    groups: [
      { label: { es: 'Texto', en: 'Text' }, tools: [t('MTEXT', 'mtext', 'Líneas múltiples', 'Multiline', 'lg'), t('TEXT', 'text', 'Una línea', 'Single line'), t('STYLE', 'text', 'Estilos de texto', 'Text styles'), t('FIND', 'qselect', 'Buscar', 'Find'), t('TXT2MTXT', 'txt2mtxt', 'A texto múltiple', 'To Mtext'), t('TEXTALIGN', 'textalign', 'Alinear textos', 'Align text')] },
      {
        label: { es: 'Cotas', en: 'Dimensions' },
        tools: [
          t('DIMLINEAR', 'dimlinear', 'Lineal', 'Linear', 'lg'),
          t('QDIM', 'qdim', 'Acotación rápida', 'Quick dimension', 'lg'),
          t('DIMALIGNED', 'dimaligned', 'Alineada', 'Aligned'),
          t('DIMANGULAR', 'dimangular', 'Angular', 'Angular'),
          t('DIMRADIUS', 'dimradius', 'Radio', 'Radius'),
          t('DIMDIAMETER', 'dimdiameter', 'Diámetro', 'Diameter'),
          t('DIMARC', 'dimarc', 'Arco', 'Arc length'),
          t('DIMORDINATE', 'dimordinate', 'Coordenada', 'Ordinate'),
          t('DIMCONTINUE', 'dimcontinue', 'Continua', 'Continue'),
          t('DIMBASELINE', 'dimbaseline', 'Línea base', 'Baseline'),
          t('DIMSPACE', 'dimspace', 'Espaciar', 'Adjust space'),
          t('DIMBREAK', 'dimbreak', 'Cortar', 'Break'),
          t('DIMSTYLE', 'dimlinear', 'Estilos', 'Styles'),
        ],
      },
      { label: { es: 'Marcas de centro', en: 'Centerlines' }, tools: [t('CENTERMARK', 'centermark', 'Marca de centro', 'Center mark', 'lg'), t('CENTERLINE', 'centerline', 'Eje de centro', 'Centerline', 'lg')] },
      { label: { es: 'Directrices', en: 'Leaders' }, tools: [t('MLEADER', 'mleader', 'Directriz múltiple', 'Multileader', 'lg'), t('MLEADERSTYLE', 'mleader', 'Estilos', 'Styles')] },
      { label: { es: 'Tablas', en: 'Tables' }, tools: [t('TABLE', 'table', 'Tabla', 'Table', 'lg'), t('TABLESTYLE', 'table', 'Estilos', 'Styles')] },
      { label: { es: 'Marcas', en: 'Markup' }, tools: [t('REVCLOUD', 'revcloud', 'Nube', 'Revision cloud', 'lg'), t('WIPEOUT', 'wipeout', 'Cobertura', 'Wipeout')] },
      { label: { es: 'Escala', en: 'Scaling' }, tools: [t('SCALELISTEDIT', 'scale', 'Lista de escalas', 'Scale list')] },
    ],
  },
  {
    id: 'parametric',
    label: { es: 'Paramétrico', en: 'Parametric' },
    groups: [
      {
        label: { es: 'Geométricas', en: 'Geometric' },
        tools: [
          t('AUTOCONSTRAIN', 'autoconstrain', 'Automáticas', 'Auto constrain', 'lg'),
          t('GCCOINCIDENT', 'gccoincident', 'Coincidente', 'Coincident'),
          t('GCCOLLINEAR', 'gccollinear', 'Colineal', 'Collinear'),
          t('GCCONCENTRIC', 'gcconcentric', 'Concéntrica', 'Concentric'),
          t('GCFIX', 'gcfix', 'Fija', 'Fix'),
          t('GCPARALLEL', 'gcparallel', 'Paralela', 'Parallel'),
          t('GCPERPENDICULAR', 'gcperpendicular', 'Perpendicular', 'Perpendicular'),
          t('GCHORIZONTAL', 'gchorizontal', 'Horizontal', 'Horizontal'),
          t('GCVERTICAL', 'gcvertical', 'Vertical', 'Vertical'),
          t('GCTANGENT', 'gctangent', 'Tangente', 'Tangent'),
          t('GCSYMMETRIC', 'gcsymmetric', 'Simétrica', 'Symmetric'),
          t('GCEQUAL', 'gcequal', 'Igual', 'Equal'),
        ],
      },
      {
        label: { es: 'Cotas de restricción', en: 'Dimensional' },
        tools: [
          t('DCLINEAR', 'dimlinear', 'Lineal', 'Linear', 'lg'),
          t('DCALIGNED', 'dimaligned', 'Alineada', 'Aligned'),
          t('DCANGULAR', 'dimangular', 'Angular', 'Angular'),
          t('DCRADIUS', 'dimradius', 'Radio', 'Radius'),
          t('DCDIAMETER', 'dimdiameter', 'Diámetro', 'Diameter'),
          t('DCCONVERT', 'constraint', 'Convertir cota', 'Convert'),
        ],
      },
      {
        label: { es: 'Gestionar', en: 'Manage' },
        tools: [
          t('PARAMETERS', 'parameters', 'Parámetros', 'Parameters', 'lg'),
          t('DELCONSTRAINT', 'delconstraint', 'Borrar restricciones', 'Delete constraints'),
          t('CONSTRAINTBAR', 'constraintbar', 'Mostrar/ocultar', 'Show/hide'),
          t('CONSTRAINTINFER', 'constraintinfer', 'Inferir al dibujar', 'Infer'),
        ],
      },
      { label: { es: 'Bloques dinámicos', en: 'Dynamic blocks' }, tools: [t('BEDIT', 'bedit', 'Editor de bloques', 'Block editor', 'lg'), t('DYNBLOCKSAMPLES', 'dynblock', 'Ejemplos dinámicos', 'Dynamic samples', 'lg'), t('BTESTBLOCK', 'dynblock', 'Probar bloque', 'Test block'), t('BVSTATE', 'dynblock', 'Estados de visibilidad', 'Visibility states'), t('BCLOSE', 'bedit', 'Cerrar editor', 'Close editor')] },
      { label: { es: 'Autoría', en: 'Authoring' }, tools: [t('BPARAMETER', 'dynblock', 'Parámetro', 'Parameter'), t('BACTION', 'dynblock', 'Acción', 'Action'), t('BVARIABLE', 'constraint', 'Variable', 'Variable')] },
      { label: { es: 'Restricciones', en: 'Constraints' }, tools: [t('BCONSTRAINT', 'constraint', 'Geométrica', 'Geometric'), t('BCPARAMETER', 'constraint', 'Parámetro de restricción', 'Constraint parameter')] },
    ],
  },
  {
    id: 'modify',
    label: { es: 'Modificar', en: 'Modify' },
    groups: [
      {
        label: { es: 'Transformar', en: 'Transform' },
        tools: [t('MOVE', 'move', 'Desplazar', 'Move', 'lg'), t('COPY', 'copy', 'Copiar', 'Copy', 'lg'), t('ROTATE', 'rotate', 'Girar', 'Rotate'), t('SCALE', 'scale', 'Escala', 'Scale'), t('MIRROR', 'mirror', 'Simetría', 'Mirror'), t('STRETCH', 'stretch', 'Estirar', 'Stretch'), t('ALIGN', 'align', 'Alinear', 'Align')],
      },
      {
        label: { es: 'Editar geometría', en: 'Edit geometry' },
        tools: [t('TRIM', 'trim', 'Recortar', 'Trim', 'lg'), t('EXTEND', 'extend', 'Alargar', 'Extend'), t('OFFSET', 'offset', 'Desfase', 'Offset', 'lg'), t('FILLET', 'fillet', 'Empalme', 'Fillet'), t('CHAMFER', 'chamfer', 'Chaflán', 'Chamfer'), t('LENGTHEN', 'lengthen', 'Longitud', 'Lengthen'), t('BREAK', 'break', 'Partir', 'Break'), t('BREAKATPOINT', 'break', 'Partir en punto', 'Break at point'), t('JOIN', 'join', 'Juntar', 'Join'), t('PEDIT', 'pedit', 'Editar polilínea', 'Edit polyline'), t('REVERSE', 'join', 'Invertir', 'Reverse')],
      },
      { label: { es: 'Matrices', en: 'Arrays' }, tools: [t('ARRAYRECT', 'array', 'Rectangular', 'Rectangular', 'lg'), t('ARRAYPOLAR', 'polararray', 'Polar', 'Polar'), t('ARRAYPATH', 'spline', 'Trayectoria', 'Path')] },
      { label: { es: 'Organizar', en: 'Organize' }, tools: [t('GROUP', 'group', 'Agrupar', 'Group'), t('UNGROUP', 'group', 'Desagrupar', 'Ungroup'), t('DRAWORDER', 'draworder', 'Orden', 'Draw order'), t('EXPLODE', 'explode', 'Descomponer', 'Explode'), t('ERASE', 'erase', 'Borrar', 'Erase'), t('MATCHPROP', 'matchprop', 'Igualar propiedades', 'Match properties')] },
      { label: { es: 'Portapapeles', en: 'Clipboard' }, tools: [t('COPYBASE', 'copybase', 'Copiar con base', 'Copy with base point'), t('PASTEBLOCK', 'pasteblock', 'Pegar como bloque', 'Paste as block'), t('PASTEORIG', 'pasteorig', 'Pegar en origen', 'Paste to original')] },
      { label: { es: 'Booleanas', en: 'Booleans' }, tools: [t('REGION', 'region', 'Región', 'Region'), t('UNION', 'region', 'Unión', 'Union'), t('SUBTRACT', 'region', 'Diferencia', 'Subtract'), t('INTERSECT', 'region', 'Intersección', 'Intersect')] },
    ],
  },
  {
    id: 'layout',
    label: { es: 'Presentación', en: 'Layout' },
    groups: [
      { label: { es: 'Presentación', en: 'Layout' }, tools: [t('LAYOUT', 'layout', 'Nueva', 'New', 'lg'), t('PAGESETUP', 'layout', 'Configurar página', 'Page setup', 'lg'), t('TITLEBLOCK', 'table', 'Cajetín', 'Title block')] },
      { label: { es: 'Viewports', en: 'Viewports' }, tools: [t('MVIEW', 'viewport', 'Rectangular', 'Rectangular', 'lg'), t('MVIEW', 'polygon', 'Poligonal', 'Polygonal', 'sm', ['P']), t('MVIEW', 'viewport', 'Ajustar a hoja', 'Fit to sheet', 'sm', ['F']), t('MSPACE', 'viewport', 'Entrar', 'Enter'), t('PSPACE', 'layout', 'Salir', 'Exit'), t('VPSCALE', 'scale', 'Escala', 'Scale'), t('VPLOCK', 'viewport', 'Bloquear', 'Lock'), t('VPLAYER', 'layers', 'Capas en VP', 'VP layers')] },
      { label: { es: 'Salida', en: 'Output' }, tools: [t('PLOT', 'plot', 'Trazar', 'Plot', 'lg'), t('PUBLISH', 'plot', 'Publicar', 'Publish', 'lg'), t('EXPORTPDF', 'pdf', 'PDF', 'PDF'), t('EXPORTSVG', 'export', 'SVG', 'SVG')] },
    ],
  },
  {
    id: 'manage',
    label: { es: 'Gestionar', en: 'Manage' },
    groups: [
      { label: { es: 'Calidad', en: 'Quality' }, tools: [t('AUDIT', 'audit', 'Auditar', 'Audit', 'lg'), t('HEALTHREPORT', 'audit', 'Informe de salud', 'Health report', 'lg'), t('PURGE', 'purge', 'Limpiar', 'Purge'), t('OVERKILL', 'overkill', 'Duplicados', 'Overkill'), t('COMPARE', 'compare', 'Comparar', 'Compare')] },
      { label: { es: 'Personalizar', en: 'Customize' }, tools: [t('ALIASEDIT', 'properties', 'Alias', 'Aliases', 'lg'), t('SHORTCUTS', 'properties', 'Atajos', 'Shortcuts'), t('OPTIONS', 'properties', 'Opciones', 'Options')] },
      { label: { es: 'Versiones', en: 'Versions' }, tools: [t('VERSIONS', 'history', 'Historial', 'History', 'lg'), t('RECOVER', 'history', 'Recuperar', 'Recover')] },
    ],
  },
  {
    id: 'output',
    label: { es: 'Salida', en: 'Output' },
    groups: [
      { label: { es: 'Trazar', en: 'Plot' }, tools: [t('PLOT', 'plot', 'Trazar', 'Plot', 'lg'), t('PUBLISH', 'plot', 'Publicar', 'Publish', 'lg'), t('PAGESETUP', 'layout', 'Página', 'Page setup')] },
      { label: { es: 'Exportar', en: 'Export' }, tools: [t('EXPORTDXF', 'export', 'DXF', 'DXF', 'lg'), t('EXPORTSVG', 'export', 'SVG', 'SVG'), t('EXPORTPDF', 'pdf', 'PDF', 'PDF'), t('EXPORTJSON', 'export', 'JSON depuración', 'Debug JSON'), t('SAVEAS', 'export', 'Paquete .fmodel', '.fmodel package')] },
    ],
  },
  {
    id: 'view',
    label: { es: 'Vista', en: 'View' },
    groups: [
      { label: { es: 'Navegar', en: 'Navigate' }, tools: [t('ZOOM', 'zoomextents', 'Extensión', 'Extents', 'lg', ['E']), t('ZOOM', 'zoom', 'Ventana', 'Window', 'sm', ['W']), t('ZOOM', 'zoom', 'Previo', 'Previous', 'sm', ['P']), t('ZOOM', 'zoom', 'Objeto', 'Object', 'sm', ['O']), t('PAN', 'pan', 'Encuadre', 'Pan'), t('VIEW', 'viewport', 'Vistas', 'Views')] },
      { label: { es: 'Visibilidad', en: 'Visibility' }, tools: [t('ISOLATEOBJECTS', 'isolate', 'Aislar', 'Isolate'), t('HIDEOBJECTS', 'isolate', 'Ocultar', 'Hide'), t('UNISOLATEOBJECTS', 'isolate', 'Mostrar todo', 'Show all')] },
      { label: { es: 'Paneles', en: 'Palettes' }, tools: [t('PROPERTIES', 'properties', 'Propiedades', 'Properties', 'lg'), t('LAYER', 'layers', 'Capas', 'Layers'), t('TOOLPALETTES', 'palettes', 'Paletas', 'Palettes'), t('CLEANSCREENON', 'zoomextents', 'Pantalla limpia', 'Clean screen')] },
    ],
  },
];
