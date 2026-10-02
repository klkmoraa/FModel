import type { Vec2 } from '../vec';
export type ComponentKind = 'column' | 'axisgrid' | 'stairplan' | 'stairsection' | 'escalator' | 'liftplan' | 'doorelevation' | 'doorsection' | 'windowelevation' | 'windowsection' | 'baywindowsection' | 'curtainwall' | 'glasspartition' | 'banister';
export type ComponentParameters = Record<string, number | string | boolean>;
export type ComponentPrimitive = { key: string } & (
  | { type: 'line'; start: Vec2; end: Vec2 }
  | { type: 'arc'; center: Vec2; radius: number; startAngle: number; endAngle: number }
  | { type: 'circle'; center: Vec2; radius: number }
  | { type: 'lwpolyline'; vertices: Vec2[]; closed: boolean }
  | { type: 'text'; position: Vec2; text: string; height: number; rotation: number }
);
export type ComponentLabel = { es: string; en: string };
export interface ComponentField { key: string; label: ComponentLabel; type: 'number' | 'integer' | 'enum' | 'boolean'; min?: number; max?: number; choices?: { value: string; label: ComponentLabel }[]; unit: 'length' | 'angle' | 'count' | 'none' }
export interface ComponentDefinition { kind: ComponentKind; command: string; label: ComponentLabel; category: ComponentLabel; fields: ComponentField[]; physicalDefaults: ComponentParameters }
