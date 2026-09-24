import type { DocumentSettings, DynamicBlockDefinition, DynamicInstanceState, Entity } from '../document/types';
import { arrayExpansionWithinLimit, arrayInstanceCount } from '../document/arrayLimits';
import { INPUT_LIMITS } from './limits';

export const ENTITY_TYPES: ReadonlySet<string> = new Set([
  'point', 'line', 'ray', 'xline', 'circle', 'arc', 'ellipse', 'lwpolyline', 'polyline2d', 'spline', 'mline', 'region', 'hatch', 'text', 'mtext', 'leader', 'mleader', 'table', 'wipeout', 'image', 'pdfunderlay', 'insert', 'attdef', 'dimension', 'viewport', 'array',
]);

export class InputValidationError extends Error {
  constructor(readonly l10n: { es: string; en: string }) {
    super(`${l10n.es} / ${l10n.en}`);
  }
}

const fail = (es: string, en: string): never => {
  throw new InputValidationError({ es, en });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim();

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const isVec2 = (value: unknown): value is { x: number; y: number } =>
  isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);

const isVec2Array = (value: unknown): value is { x: number; y: number }[] =>
  Array.isArray(value) && value.every(isVec2);

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(isFiniteNumber);

const isPolyVertex = (value: unknown): boolean =>
  isRecord(value) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  (value.bulge === undefined || isFiniteNumber(value.bulge)) &&
  (value.startWidth === undefined || isFiniteNumber(value.startWidth)) &&
  (value.endWidth === undefined || isFiniteNumber(value.endWidth));

const isPolyVertexArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every(isPolyVertex);

const isIdArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every(isNonEmptyString);

const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isOptionalBoolean = (value: unknown): boolean => value === undefined || isBoolean(value);

const isOptionalVec2Array = (value: unknown): boolean => value === undefined || isVec2Array(value);

const isMat2D = (value: unknown): boolean => {
  if (!isRecord(value) || !isFiniteNumber(value.a) || !isFiniteNumber(value.b) || !isFiniteNumber(value.c) ||
    !isFiniteNumber(value.d) || !isFiniteNumber(value.e) || !isFiniteNumber(value.f)) return false;
  return Math.abs(value.a * value.d - value.b * value.c) > 1e-15;
};

function hasEntityBase(entity: Record<string, unknown>): boolean {
  const transparency = entity.transparency;
  return isNonEmptyString(entity.id) &&
    isNonEmptyString(entity.owner) &&
    isNonEmptyString(entity.layer) &&
    typeof entity.color === 'string' &&
    isNonEmptyString(entity.linetype) &&
    isFiniteNumber(entity.linetypeScale) &&
    isFiniteNumber(entity.lineweight) &&
    (isFiniteNumber(transparency) || transparency === 'ByLayer' || transparency === 'ByBlock') &&
    isBoolean(entity.visible) &&
    isFiniteNumber(entity.order) &&
    isOptionalBoolean(entity.locked) &&
    isOptionalBoolean(entity.construction) &&
    isOptionalBoolean(entity.annotative) &&
    (entity.meta === undefined || isRecord(entity.meta));
}

function validLoop(value: unknown): boolean {
  return isRecord(value) && value.closed === true && isPolyVertexArray(value.vertices);
}

function validHatchPattern(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['predefined', 'user', 'solid', 'gradient'].includes(String(value.type)) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.angle) &&
    isFiniteNumber(value.scale) &&
    isFiniteNumber(value.spacing) &&
    isBoolean(value.double);
}

function validMLeaderContent(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'none') return true;
  if (value.type === 'mtext') {
    return typeof value.text === 'string' &&
      isFiniteNumber(value.height) &&
      Number.isInteger(value.attachment) &&
      isFiniteNumber(value.width) &&
      isBoolean(value.frame);
  }
  if (value.type === 'block') {
    return isNonEmptyString(value.blockId) &&
      isFiniteNumber(value.scale) &&
      isFiniteNumber(value.rotation) &&
      isRecord(value.attributes) &&
      Object.values(value.attributes).every((entry) => typeof entry === 'string');
  }
  return false;
}

function validTableCells(value: unknown): boolean {
  return Array.isArray(value) && value.every((row) =>
    Array.isArray(row) && row.every((cell) => isRecord(cell) && typeof cell.text === 'string'));
}

function validAttributes(value: unknown): boolean {
  return Array.isArray(value) && value.every((attribute) =>
    isRecord(attribute) &&
    isNonEmptyString(attribute.tag) &&
    typeof attribute.value === 'string' &&
    (attribute.position === undefined || isVec2(attribute.position)) &&
    (attribute.height === undefined || isFiniteNumber(attribute.height)) &&
    (attribute.rotation === undefined || isFiniteNumber(attribute.rotation)) &&
    isOptionalBoolean(attribute.invisible));
}

function validDimensionAssociations(value: unknown): boolean {
  if (value === undefined) return true;
  const points = new Set(['p1', 'p2', 'p3', 'p4', 'center', 'chord']);
  const snaps = new Set(['endpoint-start', 'endpoint-end', 'midpoint', 'center', 'quadrant', 'vertex', 'nearest', 'insertion']);
  return Array.isArray(value) && value.every((association) =>
    isRecord(association) &&
    typeof association.point === 'string' && points.has(association.point) &&
    isNonEmptyString(association.entityId) &&
    typeof association.snap === 'string' && snaps.has(association.snap) &&
    (association.index === undefined || isFiniteNumber(association.index)));
}

function validArrayParams(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string' || arrayInstanceCount(value) === null) return false;
  if (value.kind === 'rect') {
    return Number.isInteger(value.columns) && Number.isInteger(value.rows) &&
      isFiniteNumber(value.columnSpacing) && isFiniteNumber(value.rowSpacing) && isFiniteNumber(value.angle);
  }
  if (value.kind === 'polar') {
    return isVec2(value.center) && Number.isInteger(value.count) && isFiniteNumber(value.fillAngle) &&
      isBoolean(value.rotateItems) && Number.isInteger(value.rows) && isFiniteNumber(value.rowSpacing);
  }
  if (value.kind === 'path') {
    return isRecord(value.path) && isPolyVertexArray(value.path.vertices) && isBoolean(value.path.closed) &&
      Number.isInteger(value.count) && isFiniteNumber(value.spacing) && isBoolean(value.alignItems) &&
      (value.method === 'divide' || value.method === 'measure') &&
      arrayExpansionWithinLimit(Number(value.count), 0, Math.max(1, (Array.isArray(value.path.vertices) ? value.path.vertices.length : 0) - (value.path.closed ? 0 : 1)));
  }
  return false;
}

/** Rechaza matrices cuya expansión supera el límite compartido del documento. */
export function assertArrayExpansionLimits(entities: readonly unknown[]): void {
  const ownerCounts = new Map<string, number>();
  for (const value of entities) {
    if (!isRecord(value) || typeof value.owner !== 'string') continue;
    ownerCounts.set(value.owner, (ownerCounts.get(value.owner) ?? 0) + 1);
  }
  for (const value of entities) {
    if (!isRecord(value) || value.type !== 'array' || !isRecord(value.params)) continue;
    const instances = arrayInstanceCount(value.params) ?? fail('Los parámetros de la matriz no son válidos.', 'Array parameters are invalid.');
    const sourceCount = typeof value.sourceBlockId === 'string' ? ownerCounts.get(value.sourceBlockId) ?? 0 : 0;
    const pathSegments = value.params.kind === 'path' && isRecord(value.params.path) && Array.isArray(value.params.path.vertices)
      ? Math.max(1, value.params.path.vertices.length - (value.params.path.closed === true ? 0 : 1))
      : 1;
    if (!arrayExpansionWithinLimit(instances, sourceCount, pathSegments)) {
      fail('La matriz supera el límite de expansión permitido.', 'Array exceeds the allowed expansion limit.');
    }
  }
}

const DRAWING_UNITS = new Set(['unitless', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi']);

function fieldsMatch(record: Record<string, unknown>, fields: readonly string[], predicate: (value: unknown) => boolean): boolean {
  return fields.every((field) => predicate(record[field]));
}

function validNamedRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.name);
}

function validPageSetup(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.margins)) return false;
  const margins = value.margins;
  const window = value.window;
  return typeof value.paper === 'string' && isFiniteNumber(value.width) && value.width > 0 &&
    isFiniteNumber(value.height) && value.height > 0 &&
    (value.orientation === 'portrait' || value.orientation === 'landscape') &&
    fieldsMatch(margins, ['top', 'right', 'bottom', 'left'], isFiniteNumber) &&
    ['layout', 'extents', 'window'].includes(String(value.plotArea)) &&
    (window === undefined || (isRecord(window) && isVec2(window.min) && isVec2(window.max))) &&
    isFiniteNumber(value.plotScale) && isBoolean(value.plotLineweights) &&
    ['color', 'monochrome', 'grayscale'].includes(String(value.plotStyle)) &&
    fieldsMatch(value, ['plotTransparency', 'plotPaperspaceLast', 'hidePaperspaceObjects', 'center'], isBoolean) &&
    isVec2(value.offset);
}

/** Valida los ajustes ya combinados con los valores predeterminados de la versión actual. */
export function assertDocumentSettings(value: unknown): asserts value is DocumentSettings {
  if (!isRecord(value)) return fail('Los ajustes del dibujo no son válidos.', 'Drawing settings are invalid.');
  const settings = value;
  const transparency = settings.currentTransparency;
  const annotationScales = settings.annotationScales;
  const pointDisplay = settings.pointDisplay;
  const chamfer = settings.chamferDistances;
  const customProperties = settings.customProperties;
  const valid = settings.id === 'settings' && typeof settings.title === 'string' &&
    typeof settings.units === 'string' && DRAWING_UNITS.has(settings.units) &&
    typeof settings.insUnits === 'string' && DRAWING_UNITS.has(settings.insUnits) &&
    ['decimal', 'engineering', 'architectural', 'fractional', 'scientific'].includes(String(settings.linearFormat)) &&
    ['degrees', 'dms', 'grads', 'radians', 'surveyor'].includes(String(settings.angleFormat)) &&
    fieldsMatch(settings, ['linearPrecision', 'anglePrecision', 'angleBase', 'ltscale', 'annotationScale', 'currentLineweight', 'filletRadius', 'offsetDistance', 'textHeight', 'createdAt', 'modifiedAt'], isFiniteNumber) &&
    isBoolean(settings.psltscale) &&
    Array.isArray(annotationScales) && annotationScales.every((scale) => isRecord(scale) && isNonEmptyString(scale.name) && isFiniteNumber(scale.paper) && scale.paper > 0 && isFiniteNumber(scale.drawing) && scale.drawing > 0) &&
    (settings.modelPage === undefined || validPageSetup(settings.modelPage)) &&
    fieldsMatch(settings, ['currentLayer', 'currentColor', 'currentLinetype', 'currentTextStyle', 'currentDimStyle', 'currentMLeaderStyle', 'currentTableStyle', 'currentMLineStyle'], isNonEmptyString) &&
    (isFiniteNumber(transparency) || transparency === 'ByLayer' || transparency === 'ByBlock') &&
    isRecord(pointDisplay) && isFiniteNumber(pointDisplay.mode) && isFiniteNumber(pointDisplay.size) &&
    Array.isArray(chamfer) && chamfer.length === 2 && chamfer.every(isFiniteNumber) &&
    typeof settings.author === 'string' && isRecord(customProperties) && Object.values(customProperties).every((entry) => typeof entry === 'string') &&
    (settings.path === undefined || typeof settings.path === 'string');
  if (!valid) fail('Los ajustes del dibujo no coinciden con la estructura actual.', 'Drawing settings do not match the current structure.');
}

function validDimStyle(value: unknown): boolean {
  if (!validNamedRecord(value)) return false;
  const numeric = ['arrowSize', 'centerMark', 'extLineOffset', 'extLineExtension', 'dimLineExtension', 'baselineSpacing', 'dimLineweight', 'extLineweight', 'textHeight', 'textGap', 'overallScale', 'linearFactor', 'precision', 'roundOff', 'anglePrecision', 'tolUpper', 'tolLower', 'tolPrecision', 'tolHeightFactor', 'altFactor', 'altPrecision'];
  const booleans = ['suppressExt1', 'suppressExt2', 'fitTextInside', 'suppressLeadingZeros', 'suppressTrailingZeros', 'altUnits', 'annotative'];
  const strings = ['arrow1', 'arrow2', 'leaderArrow', 'dimColor', 'extColor', 'textColor', 'textStyle', 'prefix', 'suffix', 'altPrefix', 'altSuffix'];
  return fieldsMatch(value, numeric, isFiniteNumber) && fieldsMatch(value, booleans, isBoolean) && fieldsMatch(value, strings, (entry) => typeof entry === 'string') &&
    ['centered', 'above', 'outside', 'below'].includes(String(value.textVertical)) &&
    ['horizontal', 'aligned', 'iso'].includes(String(value.textAlignment)) &&
    ['none', 'background'].includes(String(value.textFill)) &&
    ['decimal', 'engineering', 'architectural', 'fractional', 'scientific'].includes(String(value.unitFormat)) &&
    (value.decimalSeparator === '.' || value.decimalSeparator === ',') &&
    ['degrees', 'dms', 'grads', 'radians', 'surveyor'].includes(String(value.angleFormat)) &&
    ['none', 'symmetrical', 'deviation', 'limits', 'basic'].includes(String(value.tolerance));
}

function validMLeaderStyle(value: unknown): boolean {
  if (!validNamedRecord(value)) return false;
  return fieldsMatch(value, ['arrowSize', 'leaderLineweight', 'doglegLength', 'landingGap', 'textHeight', 'blockScale', 'maxLeaderPoints', 'overallScale'], isFiniteNumber) &&
    fieldsMatch(value, ['landing', 'textFrame', 'annotative'], isBoolean) &&
    fieldsMatch(value, ['arrow', 'leaderColor', 'textStyle', 'textColor'], (entry) => typeof entry === 'string') &&
    ['straight', 'spline', 'none'].includes(String(value.leaderType)) &&
    ['mtext', 'block', 'none'].includes(String(value.contentType)) &&
    (value.blockId === undefined || isNonEmptyString(value.blockId));
}

function validTableStyleSection(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.textHeight) && Number.isInteger(value.align) && Number(value.align) >= 1 && Number(value.align) <= 9 &&
    (value.fill === undefined || typeof value.fill === 'string');
}

function validTableStyle(value: unknown): boolean {
  return validNamedRecord(value) && isNonEmptyString(value.textStyle) && validTableStyleSection(value.title) &&
    validTableStyleSection(value.header) && validTableStyleSection(value.data) && isFiniteNumber(value.cellMargin) &&
    typeof value.gridColor === 'string' && isFiniteNumber(value.gridLineweight) && (value.flow === 'down' || value.flow === 'up');
}

function validMLineStyle(value: unknown): boolean {
  return validNamedRecord(value) && typeof value.description === 'string' && Array.isArray(value.elements) && value.elements.every((element) =>
    isRecord(element) && isFiniteNumber(element.offset) && typeof element.color === 'string' && isNonEmptyString(element.linetype)) &&
    ['none', 'line', 'outer-arc'].includes(String(value.startCap)) && ['none', 'line', 'outer-arc'].includes(String(value.endCap)) &&
    (value.fill === undefined || typeof value.fill === 'string');
}

function validValueSet(value: unknown): boolean {
  if (!isRecord(value) || !['none', 'increment', 'list'].includes(String(value.kind))) return false;
  if (!['min', 'max', 'increment'].every((field) => value[field] === undefined || isFiniteNumber(value[field]))) return false;
  if (value.list !== undefined && !isNumberArray(value.list)) return false;
  if (value.min !== undefined && value.max !== undefined && Number(value.min) > Number(value.max)) return false;
  return value.increment === undefined || (isFiniteNumber(value.increment) && value.increment > 0);
}

function validDynParamBase(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.name) && typeof value.label === 'string' &&
    (value.description === undefined || typeof value.description === 'string') && isBoolean(value.showInProperties) &&
    isBoolean(value.chainActions) && [0, 1, 2, 4].includes(Number(value.gripCount));
}

function validDynParam(value: unknown): boolean {
  if (!validDynParamBase(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'basepoint':
    case 'point':
      return isVec2(value.point);
    case 'linear':
      return isVec2(value.base) && isVec2(value.end) && ['start', 'middle'].includes(String(value.baseLocation)) &&
        validValueSet(value.valueSet) && (value.expression === undefined || typeof value.expression === 'string');
    case 'polar':
      return isVec2(value.base) && isVec2(value.end) && validValueSet(value.distanceSet) && validValueSet(value.angleSet);
    case 'xy':
      return isVec2(value.base) && isVec2(value.corner) && validValueSet(value.xSet) && validValueSet(value.ySet);
    case 'rotation':
      return isVec2(value.base) && isFiniteNumber(value.radius) && value.radius >= 0 && isFiniteNumber(value.angle) && validValueSet(value.valueSet);
    case 'alignment':
      return isVec2(value.base) && isVec2(value.direction) && (value.direction.x !== 0 || value.direction.y !== 0) &&
        ['perpendicular', 'tangent'].includes(String(value.alignType));
    case 'flip':
      return isVec2(value.base) && isVec2(value.end) && typeof value.labelNotFlipped === 'string' && typeof value.labelFlipped === 'string';
    case 'visibility':
      return isVec2(value.position) && Array.isArray(value.states) && value.states.every((state) =>
        isRecord(state) && isNonEmptyString(state.name) && isIdArray(state.visible)) && typeof value.defaultState === 'string';
    case 'lookup':
      return isVec2(value.position) && isNonEmptyString(value.tableId);
    default:
      return false;
  }
}

function validDynAction(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.name) || !isNonEmptyString(value.paramId) ||
    !isIdArray(value.selection) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'move':
      return ['base', 'end', 'corner'].includes(String(value.paramPoint)) && ['xy', 'x', 'y'].includes(String(value.axis)) &&
        isFiniteNumber(value.distanceMultiplier) && isFiniteNumber(value.angleOffset);
    case 'scale':
      return ['dependent', 'independent'].includes(String(value.baseType)) && (value.basePoint === undefined || isVec2(value.basePoint)) &&
        ['xy', 'x', 'y'].includes(String(value.axis));
    case 'stretch':
      return ['base', 'end', 'corner'].includes(String(value.paramPoint)) && isVec2Array(value.frame) &&
        ['xy', 'x', 'y'].includes(String(value.axis)) && isFiniteNumber(value.distanceMultiplier) && isFiniteNumber(value.angleOffset);
    case 'polarstretch':
      return ['base', 'end'].includes(String(value.paramPoint)) && isVec2Array(value.frame) && isIdArray(value.rotateOnly);
    case 'rotate':
      return ['dependent', 'independent'].includes(String(value.baseType)) && (value.basePoint === undefined || isVec2(value.basePoint));
    case 'flip':
      return true;
    case 'array':
      return isFiniteNumber(value.columnOffset) && isFiniteNumber(value.rowOffset) &&
        (value.polarCount === undefined || typeof value.polarCount === 'string') &&
        (value.fillAngle === undefined || isFiniteNumber(value.fillAngle));
    case 'lookup':
      return isNonEmptyString(value.tableId);
    default:
      return false;
  }
}

function validGeoRef(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.entityId) && isNonEmptyString(value.part);
}

function validDynConstraint(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !Array.isArray(value.refs) || !value.refs.every(validGeoRef)) return false;
  if (value.kind === 'geometric') {
    return ['horizontal', 'vertical', 'parallel', 'perpendicular', 'coincident', 'tangent', 'concentric', 'equal', 'symmetric', 'fixed', 'collinear'].includes(String(value.type)) &&
      isBoolean(value.enabled);
  }
  if (value.kind === 'dimensional') {
    return ['linear-h', 'linear-v', 'aligned', 'angular', 'radius', 'diameter'].includes(String(value.type)) &&
      isNonEmptyString(value.name) && typeof value.expression === 'string' && isBoolean(value.isParameter) &&
      validValueSet(value.valueSet) && (value.labelPosition === undefined || isVec2(value.labelPosition));
  }
  return false;
}

function validLookupTable(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.name) && isIdArray(value.inputs) &&
    typeof value.lookupName === 'string' && Array.isArray(value.rows) && value.rows.every((row) =>
      isRecord(row) && typeof row.label === 'string' && Array.isArray(row.inputs) && row.inputs.length === (value.inputs as unknown[]).length &&
      row.inputs.every((input) => typeof input === 'string' || isFiniteNumber(input))) && isBoolean(value.reverse);
}

function validUserVariable(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.name) && typeof value.expression === 'string' &&
    isBoolean(value.exposed) && isBoolean(value.readOnly) && (value.description === undefined || typeof value.description === 'string');
}

function validDynamicContainer(value: unknown): value is DynamicBlockDefinition {
  return isRecord(value) && Array.isArray(value.parameters) && value.parameters.every(validDynParam) &&
    Array.isArray(value.actions) && value.actions.every(validDynAction) &&
    Array.isArray(value.constraints) && value.constraints.every(validDynConstraint) &&
    Array.isArray(value.lookups) && value.lookups.every(validLookupTable) &&
    Array.isArray(value.variables) && value.variables.every(validUserVariable) && isIdArray(value.propertyOrder) &&
    (value.validation === undefined || (isRecord(value.validation) && isFiniteNumber(value.validation.at) && isStringArray(value.validation.warnings) && isStringArray(value.validation.errors)));
}

/** Valida la forma y, cuando se conocen, las referencias de una definición de bloque dinámico. */
export function assertDynamicBlockDefinition(value: unknown, entityIds?: ReadonlySet<string>): asserts value is DynamicBlockDefinition {
  if (!validDynamicContainer(value)) {
    return fail('La definición del bloque dinámico no es válida.', 'Dynamic block definition is invalid.');
  }
  const definition = value as DynamicBlockDefinition;
  const uniqueIds = (records: readonly { id: string }[]) => new Set(records.map((record) => record.id)).size === records.length;
  if (!uniqueIds(definition.parameters) || !uniqueIds(definition.actions) || !uniqueIds(definition.constraints) || !uniqueIds(definition.lookups)) {
    fail('La definición dinámica contiene identificadores duplicados.', 'Dynamic definition contains duplicate identifiers.');
  }
  const parameterIds = new Set(definition.parameters.map((parameter) => parameter.id));
  const lookupIds = new Set(definition.lookups.map((lookup) => lookup.id));
  const variableNames = new Set<string>();
  for (const variable of definition.variables) {
    const key = variable.name.toLocaleLowerCase();
    if (variableNames.has(key)) fail('La definición dinámica contiene variables duplicadas.', 'Dynamic definition contains duplicate variables.');
    variableNames.add(key);
  }
  for (const id of definition.propertyOrder) {
    if (!parameterIds.has(id)) fail('El orden de propiedades dinámicas contiene una referencia inexistente.', 'Dynamic property order contains a missing reference.');
  }
  for (const parameter of definition.parameters) {
    if (parameter.type === 'visibility') {
      const stateNames = new Set(parameter.states.map((state) => state.name));
      if (stateNames.size !== parameter.states.length || (parameter.states.length > 0 && !stateNames.has(parameter.defaultState))) {
        fail('El parámetro de visibilidad contiene estados inválidos.', 'Visibility parameter contains invalid states.');
      }
      if (entityIds && parameter.states.some((state) => state.visible.some((id) => !entityIds.has(id)))) {
        fail('El parámetro de visibilidad contiene una referencia inexistente.', 'Visibility parameter contains a missing reference.');
      }
    }
    if (parameter.type === 'lookup' && !lookupIds.has(parameter.tableId)) {
      fail('El parámetro de consulta apunta a una tabla inexistente.', 'Lookup parameter references a missing table.');
    }
  }
  for (const action of definition.actions) {
    if (!parameterIds.has(action.paramId)) fail('Una acción dinámica apunta a un parámetro inexistente.', 'Dynamic action references a missing parameter.');
    if (entityIds && action.selection.some((id) => !entityIds.has(id) && !parameterIds.has(id))) {
      fail('Una acción dinámica contiene una referencia inexistente.', 'Dynamic action contains a missing reference.');
    }
    if (action.type === 'polarstretch' && entityIds && action.rotateOnly.some((id) => !entityIds.has(id))) {
      fail('Una acción dinámica contiene una referencia inexistente.', 'Dynamic action contains a missing reference.');
    }
    if (action.type === 'lookup' && !lookupIds.has(action.tableId)) {
      fail('Una acción de consulta apunta a una tabla inexistente.', 'Lookup action references a missing table.');
    }
  }
  if (entityIds && definition.constraints.some((constraint) => constraint.refs.some((ref) => !entityIds.has(ref.entityId)))) {
    fail('Una restricción dinámica contiene una referencia inexistente.', 'Dynamic constraint contains a missing reference.');
  }
  for (const lookup of definition.lookups) {
    if (lookup.inputs.some((id) => !parameterIds.has(id))) {
      fail('Una tabla de consulta apunta a un parámetro inexistente.', 'Lookup table references a missing parameter.');
    }
  }
}

function validDynamicInstanceState(value: unknown): value is DynamicInstanceState {
  if (!isRecord(value) || !isRecord(value.values)) return false;
  const validValue = (entry: unknown) => isFiniteNumber(entry) || typeof entry === 'string' || isBoolean(entry) || isVec2(entry);
  return Object.values(value.values).every(validValue) &&
    (value.visibilityState === undefined || typeof value.visibilityState === 'string') &&
    (value.userValues === undefined || (isRecord(value.userValues) && Object.values(value.userValues).every(isFiniteNumber)));
}

/** Valida valores de instancia antes de entregarlos al evaluador de bloques dinámicos. */
export function assertDynamicInstanceState(value: unknown): asserts value is DynamicInstanceState {
  if (!validDynamicInstanceState(value)) {
    fail('El estado de la instancia dinámica no es válido.', 'Dynamic instance state is invalid.');
  }
}

function validXref(value: unknown): boolean {
  if (!isRecord(value) || typeof value.path !== 'string' || !['attach', 'overlay'].includes(String(value.mode)) ||
    !['loaded', 'unloaded', 'not-found', 'unresolved', 'circular'].includes(String(value.status)) || !isRecord(value.layerOverrides)) return false;
  const optionalIdArrays = ['ownedBlocks', 'ownedLayers', 'ownedLinetypes', 'ownedTextStyles', 'ownedDimStyles', 'ownedMLeaderStyles', 'ownedTableStyles', 'ownedMLineStyles', 'ownedAssets'];
  return optionalIdArrays.every((field) => value[field] === undefined || isIdArray(value[field])) &&
    (value.lastLoaded === undefined || isFiniteNumber(value.lastLoaded)) &&
    (value.documentId === undefined || isNonEmptyString(value.documentId)) &&
    (value.source === undefined || value.source === 'file' || value.source === 'library') &&
    (value.error === undefined || typeof value.error === 'string');
}

/** Valida tablas y objetos con nombre antes de que el lector acceda a sus campos. */
export function assertDocumentRecord(collection: string, value: unknown): void {
  let valid = false;
  switch (collection) {
    case 'layers':
      valid = validNamedRecord(value) && typeof value.color === 'string' && isNonEmptyString(value.linetype) &&
        fieldsMatch(value, ['lineweight', 'transparency', 'order'], isFiniteNumber) &&
        fieldsMatch(value, ['on', 'frozen', 'locked', 'plot'], isBoolean) && typeof value.description === 'string' && isOptionalBoolean(value.newViewportFrozen);
      break;
    case 'linetypes':
      valid = validNamedRecord(value) && typeof value.description === 'string' && isNumberArray(value.pattern);
      break;
    case 'textStyles':
      valid = validNamedRecord(value) && isNonEmptyString(value.font) && fieldsMatch(value, ['height', 'widthFactor', 'oblique'], isFiniteNumber) &&
        isBoolean(value.annotative) && isOptionalBoolean(value.bold) && isOptionalBoolean(value.italic);
      break;
    case 'dimStyles':
      valid = validDimStyle(value);
      break;
    case 'mleaderStyles':
      valid = validMLeaderStyle(value);
      break;
    case 'tableStyles':
      valid = validTableStyle(value);
      break;
    case 'mlineStyles':
      valid = validMLineStyle(value);
      break;
    case 'blocks':
      valid = validNamedRecord(value) && ['normal', 'anonymous', 'xref', 'array', 'dimension'].includes(String(value.kind)) &&
        isVec2(value.basePoint) && typeof value.description === 'string' && typeof value.units === 'string' && DRAWING_UNITS.has(value.units) &&
        fieldsMatch(value, ['explodable', 'scaleUniformly', 'annotative'], isBoolean) && Number.isInteger(value.revision) && Number(value.revision) >= 1 &&
        isOptionalBoolean(value.favorite) && (value.library === undefined || value.library === 'local' || value.library === 'shared') &&
        (value.category === undefined || typeof value.category === 'string') && (value.libraryItem === undefined || typeof value.libraryItem === 'string') &&
        (value.librarySavedAt === undefined || isFiniteNumber(value.librarySavedAt)) && (value.xref === undefined || validXref(value.xref)) &&
        (value.dynamic === undefined || validDynamicContainer(value.dynamic));
      break;
    case 'layouts':
      valid = validNamedRecord(value) && isFiniteNumber(value.tabOrder) && validPageSetup(value.page) &&
        (value.view === undefined || (isRecord(value.view) && isVec2(value.view.center) && isFiniteNumber(value.view.scale) && value.view.scale > 0));
      break;
    case 'groups':
      valid = validNamedRecord(value) && typeof value.description === 'string' && isIdArray(value.members) && isBoolean(value.selectable);
      break;
    case 'views':
      valid = validNamedRecord(value) && isNonEmptyString(value.space) && isVec2(value.center) && isFiniteNumber(value.height) && value.height > 0 &&
        isFiniteNumber(value.rotation) && (value.layerState === undefined || isNonEmptyString(value.layerState));
      break;
    case 'layerStates':
      valid = validNamedRecord(value) && typeof value.description === 'string' && isRecord(value.layers) && isNonEmptyString(value.currentLayer) &&
        Object.values(value.layers).every((layer) => isRecord(layer) && fieldsMatch(layer, ['on', 'frozen', 'locked', 'plot'], isBoolean) &&
          typeof layer.color === 'string' && isNonEmptyString(layer.linetype) && fieldsMatch(layer, ['lineweight', 'transparency'], isFiniteNumber));
      break;
    case 'layerFilters': {
      const rule = validNamedRecord(value) && isRecord(value.rule) ? value.rule : undefined;
      const layers = isRecord(value) ? value.layers : undefined;
      valid = !!rule &&
        (rule.name === undefined || typeof rule.name === 'string') && (rule.color === undefined || typeof rule.color === 'string') &&
        ['on', 'frozen', 'locked', 'used'].every((field) => rule[field] === undefined || isBoolean(rule[field])) &&
        (layers === undefined || isIdArray(layers));
      break;
    }
    default:
      valid = false;
  }
  if (!valid) {
    const id = isRecord(value) && typeof value.id === 'string' ? ` «${value.id}»` : '';
    fail(`Registro${id} inválido en ${collection}.`, `Invalid record${id ? ` "${id.slice(2, -1)}"` : ''} in ${collection}.`);
  }
  if (collection === 'blocks' && isRecord(value) && value.dynamic !== undefined) {
    assertDynamicBlockDefinition(value.dynamic);
  }
}

/** Valida que una entidad externa tenga todos los campos que exige su discriminante. */
export function assertEntityRecord(value: unknown): asserts value is Entity {
  if (!isRecord(value)) {
    return fail('El archivo contiene una entidad inválida.', 'The file contains an invalid entity.');
  }
  const entity = value;
  if (typeof entity.type !== 'string' || !ENTITY_TYPES.has(entity.type) || !hasEntityBase(entity)) {
    fail('El archivo contiene una entidad inválida.', 'The file contains an invalid entity.');
  }
  let valid = false;
  switch (entity.type) {
    case 'point':
      valid = isVec2(entity.position);
      break;
    case 'line':
      valid = isVec2(entity.start) && isVec2(entity.end);
      break;
    case 'ray':
    case 'xline':
      valid = isVec2(entity.origin) && isVec2(entity.direction) && (entity.direction.x !== 0 || entity.direction.y !== 0);
      break;
    case 'circle':
      valid = isVec2(entity.center) && isFiniteNumber(entity.radius) && entity.radius >= 0;
      break;
    case 'arc':
      valid = isVec2(entity.center) && isFiniteNumber(entity.radius) && entity.radius >= 0 &&
        isFiniteNumber(entity.startAngle) && isFiniteNumber(entity.endAngle);
      break;
    case 'ellipse':
      valid = isVec2(entity.center) && isVec2(entity.majorAxis) && (entity.majorAxis.x !== 0 || entity.majorAxis.y !== 0) &&
        isFiniteNumber(entity.ratio) && entity.ratio > 0 && entity.ratio <= 1 &&
        isFiniteNumber(entity.startParam) && isFiniteNumber(entity.endParam);
      break;
    case 'lwpolyline':
      valid = isPolyVertexArray(entity.vertices) && isBoolean(entity.closed) &&
        (entity.constantWidth === undefined || isFiniteNumber(entity.constantWidth));
      break;
    case 'polyline2d':
      valid = isPolyVertexArray(entity.vertices) && isBoolean(entity.closed) &&
        ['none', 'fit', 'quadratic', 'cubic'].includes(String(entity.smoothing));
      break;
    case 'spline': {
      const spline = entity.spline;
      valid = isRecord(spline) && Number.isInteger(spline.degree) && Number(spline.degree) >= 1 &&
        isVec2Array(spline.ctrl) && spline.ctrl.length > Number(spline.degree) &&
        isNumberArray(spline.knots) && spline.knots.length === spline.ctrl.length + Number(spline.degree) + 1 &&
        (spline.weights === undefined || (isNumberArray(spline.weights) && spline.weights.length === spline.ctrl.length)) &&
        (spline.fit === undefined || isVec2Array(spline.fit)) && isOptionalBoolean(spline.closed) &&
        (entity.method === 'fit' || entity.method === 'cv') && isFiniteNumber(entity.fitTolerance);
      break;
    }
    case 'mline':
      valid = isVec2Array(entity.vertices) && isBoolean(entity.closed) && isNonEmptyString(entity.style) &&
        isFiniteNumber(entity.scale) && ['top', 'zero', 'bottom'].includes(String(entity.justification));
      break;
    case 'region':
      valid = Array.isArray(entity.loops) && entity.loops.every(validLoop);
      break;
    case 'hatch':
      valid = Array.isArray(entity.loops) && entity.loops.every(validLoop) && validHatchPattern(entity.pattern) &&
        isVec2(entity.origin) && ['normal', 'outer', 'ignore'].includes(String(entity.islandStyle)) &&
        (entity.associative === undefined || isIdArray(entity.associative));
      break;
    case 'text':
      valid = isVec2(entity.position) && (entity.alignPoint === undefined || isVec2(entity.alignPoint)) &&
        typeof entity.text === 'string' && isFiniteNumber(entity.height) && isFiniteNumber(entity.rotation) &&
        isFiniteNumber(entity.widthFactor) && isFiniteNumber(entity.oblique) && isNonEmptyString(entity.style) &&
        ['left', 'center', 'right', 'aligned', 'middle', 'fit'].includes(String(entity.halign)) &&
        ['baseline', 'bottom', 'middle', 'top'].includes(String(entity.valign));
      break;
    case 'mtext':
      valid = isVec2(entity.position) && isFiniteNumber(entity.width) && isFiniteNumber(entity.height) &&
        isFiniteNumber(entity.rotation) && isNonEmptyString(entity.style) && Number.isInteger(entity.attachment) &&
        isFiniteNumber(entity.lineSpacing) && typeof entity.contents === 'string';
      break;
    case 'leader':
      valid = isVec2Array(entity.vertices) && isNonEmptyString(entity.style) && isNonEmptyString(entity.arrow) &&
        isBoolean(entity.splined) && isBoolean(entity.hookline) &&
        (entity.annotation === undefined || isNonEmptyString(entity.annotation));
      break;
    case 'mleader':
      valid = isNonEmptyString(entity.style) && Array.isArray(entity.leaders) && entity.leaders.every((leader) =>
        isRecord(leader) && isVec2Array(leader.vertices)) && isVec2(entity.landing) &&
        isFiniteNumber(entity.doglegLength) && (entity.direction === 1 || entity.direction === -1) &&
        validMLeaderContent(entity.content) && (entity.overrides === undefined || isRecord(entity.overrides));
      break;
    case 'table':
      valid = isVec2(entity.position) && isFiniteNumber(entity.rotation) && isNonEmptyString(entity.style) &&
        isNumberArray(entity.rowHeights) && isNumberArray(entity.columnWidths) && validTableCells(entity.cells) &&
        isBoolean(entity.titleRow) && isBoolean(entity.headerRow);
      break;
    case 'wipeout':
      valid = isVec2Array(entity.vertices) && isBoolean(entity.frame);
      break;
    case 'image':
      valid = isNonEmptyString(entity.assetId) && isVec2(entity.position) && isVec2(entity.u) && isVec2(entity.v) &&
        isOptionalVec2Array(entity.clip) && isBoolean(entity.clipEnabled) && isFiniteNumber(entity.opacity) &&
        isFiniteNumber(entity.fade) && isFiniteNumber(entity.brightness) && isFiniteNumber(entity.contrast) &&
        isOptionalBoolean(entity.monochrome);
      break;
    case 'pdfunderlay':
      valid = isNonEmptyString(entity.assetId) && Number.isInteger(entity.page) && Number(entity.page) >= 1 &&
        isVec2(entity.position) && isFiniteNumber(entity.scale) && isFiniteNumber(entity.rotation) &&
        isOptionalVec2Array(entity.clip) && isBoolean(entity.clipEnabled) && isFiniteNumber(entity.opacity) &&
        isFiniteNumber(entity.fade) && isBoolean(entity.monochrome);
      break;
    case 'insert':
      valid = isNonEmptyString(entity.blockId) && isVec2(entity.position) && isVec2(entity.scale) &&
        isFiniteNumber(entity.rotation) && validAttributes(entity.attributes) &&
        (entity.dynamic === undefined || validDynamicInstanceState(entity.dynamic)) &&
        (entity.grid === undefined || (isRecord(entity.grid) && Number.isInteger(entity.grid.columns) && Number.isInteger(entity.grid.rows) &&
          isFiniteNumber(entity.grid.columnSpacing) && isFiniteNumber(entity.grid.rowSpacing)));
      break;
    case 'attdef':
      valid = typeof entity.tag === 'string' && typeof entity.prompt === 'string' && typeof entity.defaultValue === 'string' &&
        isVec2(entity.position) && isFiniteNumber(entity.height) && isFiniteNumber(entity.rotation) && isNonEmptyString(entity.style) &&
        ['left', 'center', 'right', 'aligned', 'middle', 'fit'].includes(String(entity.halign)) &&
        ['baseline', 'bottom', 'middle', 'top'].includes(String(entity.valign)) &&
        isBoolean(entity.invisible) && isBoolean(entity.constant) && isBoolean(entity.verify) && isBoolean(entity.preset) &&
        isBoolean(entity.lockPosition) && isBoolean(entity.multiline);
      break;
    case 'dimension':
      valid = ['linear', 'aligned', 'angular', 'angular3p', 'radial', 'diametric', 'arclength', 'ordinate'].includes(String(entity.dimType)) &&
        isNonEmptyString(entity.style) && isRecord(entity.overrides) && isVec2(entity.p1) && isVec2(entity.p2) &&
        isVec2(entity.p3) && (entity.p4 === undefined || isVec2(entity.p4)) &&
        (entity.center === undefined || isVec2(entity.center)) && (entity.arcPoint === undefined || isVec2(entity.arcPoint)) &&
        isFiniteNumber(entity.rotation) && (entity.origin === undefined || isVec2(entity.origin)) &&
        (entity.radius === undefined || (isFiniteNumber(entity.radius) && entity.radius >= 0)) && validDimensionAssociations(entity.assoc);
      break;
    case 'viewport':
      valid = isVec2(entity.center) && isFiniteNumber(entity.width) && isFiniteNumber(entity.height) &&
        isVec2(entity.viewCenter) && isFiniteNumber(entity.scale) && entity.scale > 0 && isFiniteNumber(entity.viewTwist) &&
        isBoolean(entity.displayLocked) && isBoolean(entity.on) && isIdArray(entity.frozenLayers) &&
        isRecord(entity.layerOverrides) && isOptionalVec2Array(entity.clipBoundary);
      break;
    case 'array':
      valid = isNonEmptyString(entity.sourceBlockId) && isVec2(entity.basePoint) && validArrayParams(entity.params) &&
        (entity.sourceMatrix === undefined || isMat2D(entity.sourceMatrix));
      break;
  }
  if (!valid) {
    fail(`La entidad «${String(entity.id)}» no coincide con la estructura de ${String(entity.type)}.`, `Entity "${String(entity.id)}" does not match the ${String(entity.type)} structure.`);
  }
}

/** Rechaza números que el formato JSON no puede representar con seguridad. */
export function assertFiniteValues(value: unknown): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('El archivo contiene un número no finito.', 'The file contains a non-finite number.');
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertFiniteValues(entry);
    return;
  }
  if (value && typeof value === 'object') for (const entry of Object.values(value)) assertFiniteValues(entry);
}

const POINT_LISTS = new Set(['vertices', 'points', 'controlPoints', 'fitPoints', 'ctrl', 'fit']);

export function assertPointLimits(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertPointLimits(entry);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (POINT_LISTS.has(key) && Array.isArray(entry) && entry.length > INPUT_LIMITS.maxPointsPerEntity) {
      fail('Una entidad contiene demasiados puntos.', 'An entity contains too many points.');
    }
    assertPointLimits(entry);
  }
}
