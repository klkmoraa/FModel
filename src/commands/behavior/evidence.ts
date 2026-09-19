export interface CommandEvidenceEntry {
  command: string;
  category: 'draw' | 'modify' | 'annotate' | 'layers' | 'view' | 'blocks' | 'layout' | 'utility' | 'output' | 'file';
  nature: 'mutating' | 'readOnly' | 'ui' | 'state';
  testId: string;
  description: string;
}

export const COMMAND_EVIDENCE_REGISTRY: Record<string, CommandEvidenceEntry> = {
  // Dibujo
  LINE: { command: 'LINE', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-LINE', description: 'Crea segmentos de línea encadenados hasta Intro' },
  PLINE: { command: 'PLINE', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-PLINE', description: 'Crea polilínea con vértices consecutivos' },
  CIRCLE: { command: 'CIRCLE', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-CIRCLE', description: 'Crea círculo mediante centro y radio' },
  ARC: { command: 'ARC', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-ARC', description: 'Crea arco mediante tres puntos o centro/inicio/fin' },
  RECTANG: { command: 'RECTANG', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-RECTANG', description: 'Crea rectángulo como polilínea cerrada de 4 vértices' },
  POLYGON: { command: 'POLYGON', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-POLYGON', description: 'Crea polígono regular cerrado inscrito/circunscrito' },
  ELLIPSE: { command: 'ELLIPSE', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-ELLIPSE', description: 'Crea elipse mediante centro y ejes' },
  SPLINE: { command: 'SPLINE', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-SPLINE', description: 'Crea spline continua pasando por puntos de control' },
  POINT: { command: 'POINT', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-POINT', description: 'Crea entidad de punto en coordenada' },
  RAY: { command: 'RAY', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-RAY', description: 'Crea semirrecta con origen y dirección' },
  XLINE: { command: 'XLINE', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-XLINE', description: 'Crea línea infinita auxiliar con dos puntos' },
  REVCLOUD: { command: 'REVCLOUD', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-REVCLOUD', description: 'Crea nube de revisión con arcos encadenados' },
  DONUT: { command: 'DONUT', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-DONUT', description: 'Crea arandela con radio interior y exterior' },
  WIPEOUT: { command: 'WIPEOUT', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-WIPEOUT', description: 'Crea cobertura poligonal' },
  MLINE: { command: 'MLINE', category: 'draw', nature: 'mutating', testId: 'BEH-DRAW-MLINE', description: 'Crea multilínea paralela continua' },

  // Modificar
  ERASE: { command: 'ERASE', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-ERASE', description: 'Borra entidades designadas con soporte de OOPS' },
  OOPS: { command: 'OOPS', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-OOPS', description: 'Restaura último conjunto de entidades borradas' },
  MOVE: { command: 'MOVE', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-MOVE', description: 'Desplaza entidades desde punto base a destino' },
  COPY: { command: 'COPY', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-COPY', description: 'Duplica entidades desde punto base a destino' },
  ROTATE: { command: 'ROTATE', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-ROTATE', description: 'Gira entidades alrededor de punto base con ángulo' },
  SCALE: { command: 'SCALE', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-SCALE', description: 'Escala entidades uniformemente con factor' },
  MIRROR: { command: 'MIRROR', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-MIRROR', description: 'Crea simetría respecto a un eje' },
  OFFSET: { command: 'OFFSET', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-OFFSET', description: 'Desfasa entidad por distancia y lado' },
  TRIM: { command: 'TRIM', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-TRIM', description: 'Recorta segmentos respecto a límites de corte' },
  EXTEND: { command: 'EXTEND', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-EXTEND', description: 'Alarga entidades hasta bordes límite' },
  FILLET: { command: 'FILLET', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-FILLET', description: 'Empalma esquinas mediante arco tangente con radio' },
  CHAMFER: { command: 'CHAMFER', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-CHAMFER', description: 'Achaflana esquinas con distancias' },
  EXPLODE: { command: 'EXPLODE', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-EXPLODE', description: 'Descompone polilíneas o bloques en entidades primitivas' },
  JOIN: { command: 'JOIN', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-JOIN', description: 'Une segmentos colineales o coincidentes en una polilínea' },
  BREAK: { command: 'BREAK', category: 'modify', nature: 'mutating', testId: 'BEH-MOD-BREAK', description: 'Parte una entidad entre dos puntos' },

  // Anotación
  TEXT: { command: 'TEXT', category: 'annotate', nature: 'mutating', testId: 'BEH-ANN-TEXT', description: 'Crea texto de una sola línea en coordenada' },
  MTEXT: { command: 'MTEXT', category: 'annotate', nature: 'mutating', testId: 'BEH-ANN-MTEXT', description: 'Crea texto multilínea con cuadro delimitador' },
  DIMLINEAR: { command: 'DIMLINEAR', category: 'annotate', nature: 'mutating', testId: 'BEH-ANN-DIMLIN', description: 'Crea cota lineal horizontal/vertical' },
  DIMALIGNED: { command: 'DIMALIGNED', category: 'annotate', nature: 'mutating', testId: 'BEH-ANN-DIMALIGN', description: 'Crea cota alineada entre dos puntos' },
  DIMRADIUS: { command: 'DIMRADIUS', category: 'annotate', nature: 'mutating', testId: 'BEH-ANN-DIMRAD', description: 'Crea cota de radio para círculos o arcos' },
  DIMDIAMETER: { command: 'DIMDIAMETER', category: 'annotate', nature: 'mutating', testId: 'BEH-ANN-DIMDIAM', description: 'Crea cota de diámetro' },
  LEADER: { command: 'LEADER', category: 'annotate', nature: 'mutating', testId: 'BEH-ANN-LEADER', description: 'Crea directriz con flecha y texto' },

  // Capas y Visibilidad
  LAYER: { command: 'LAYER', category: 'layers', nature: 'ui', testId: 'BEH-LAY-MGR', description: 'Abre el administrador de capas' },
  LAYON: { command: 'LAYON', category: 'layers', nature: 'state', testId: 'BEH-LAY-ON', description: 'Enciende todas las capas del dibujo' },
  LAYOFF: { command: 'LAYOFF', category: 'layers', nature: 'state', testId: 'BEH-LAY-OFF', description: 'Apaga la capa de la entidad designada' },
  LAYTHW: { command: 'LAYTHW', category: 'layers', nature: 'state', testId: 'BEH-LAY-THW', description: 'Reutiliza todas las capas inutilizadas' },
  LAYFRZ: { command: 'LAYFRZ', category: 'layers', nature: 'state', testId: 'BEH-LAY-FRZ', description: 'Inutiliza la capa de la entidad designada' },

  // Consulta y Utilidades
  DIST: { command: 'DIST', category: 'utility', nature: 'readOnly', testId: 'BEH-UTL-DIST', description: 'Mide e informa distancia euclídea y delta x/y' },
  AREA: { command: 'AREA', category: 'utility', nature: 'readOnly', testId: 'BEH-UTL-AREA', description: 'Calcula área y perímetro de polígono o entidad' },
  ID: { command: 'ID', category: 'utility', nature: 'readOnly', testId: 'BEH-UTL-ID', description: 'Muestra coordenadas precisas de un punto' },
  PURGE: { command: 'PURGE', category: 'utility', nature: 'mutating', testId: 'BEH-UTL-PURGE', description: 'Limpia bloques, capas y estilos no referenciados' },
  AUDIT: { command: 'AUDIT', category: 'utility', nature: 'readOnly', testId: 'BEH-UTL-AUDIT', description: 'Audita e informa integridad y consistencia del dibujo' },

  // Bloques y Referencias
  BLOCK: { command: 'BLOCK', category: 'blocks', nature: 'mutating', testId: 'BEH-BLK-BLOCK', description: 'Crea definición de bloque a partir de selección' },
  INSERT: { command: 'INSERT', category: 'blocks', nature: 'mutating', testId: 'BEH-BLK-INSERT', description: 'Inserta referencia de bloque con escala y rotación' },

  // Visualización
  ZOOM: { command: 'ZOOM', category: 'view', nature: 'state', testId: 'BEH-VIEW-ZOOM', description: 'Ajusta vista por ventana, extensión, previo o factor' },
  PAN: { command: 'PAN', category: 'view', nature: 'state', testId: 'BEH-VIEW-PAN', description: 'Encuadra la vista en tiempo real' },
};

export function getEvidenceForCommand(commandName: string): CommandEvidenceEntry | undefined {
  return COMMAND_EVIDENCE_REGISTRY[commandName.toUpperCase()];
}
