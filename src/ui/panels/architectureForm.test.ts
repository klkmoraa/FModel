import { describe, expect, it, vi } from 'vitest';
import { ComponentError, componentDefaults, parseComponentArguments, visibleComponentFields } from '../../app/componentCatalog';
import { buildComponent } from '../../geometry/architecture/components';
import { createDocument } from '../../document/defaults';
import { Editor } from '../../editor/editor';
import { componentFormValues, refreshComponentForm, newComponentForm, validateComponentForm, startComponentPlacement } from './architectureForm';

describe('architecture form uses the native component boundary', () => {
  it('converts metre defaults, physical literals and command degrees without changing counts', () => {
    const fields = componentFormValues('column', 'm');
    expect(fields.width).toBe('0.4');
    const result = validateComponentForm('column', 'm', { ...fields, width: '600mm' }, '90');
    expect(parseComponentArguments('column', 'm', result.args).parameters.width).toBe(0.6);
    expect(result.rotation).toBeCloseTo(Math.PI / 2);
    expect(result.parameters).toEqual(parseComponentArguments('column', 'm', result.args).parameters);
    expect(componentFormValues('escalator', 'm').angle).toBe('30');
    expect(componentFormValues('stairplan', 'm').steps).toBe('16');
  });
  it.each(['Infinity', 'NaN', '1+2', '', '0'])('refuses invalid width %s with its domain field key', width => {
    try { validateComponentForm('column', 'm', { ...componentFormValues('column', 'm'), width }, '0'); throw Error('accepted'); }
    catch (error) { expect(error).toBeInstanceOf(ComponentError); expect((error as ComponentError).fieldKeys).toContain('width'); }
  });
  it('uses enum/count/rotation validation and affected layout keys from the domain', () => {
    expect(() => validateComponentForm('column', 'mm', { ...componentFormValues('column', 'mm'), variant: 'sphere' }, '0')).toThrow();
    expect(() => validateComponentForm('stairplan', 'mm', { ...componentFormValues('stairplan', 'mm'), steps: '2.5' }, '0')).toThrow();
    expect(() => validateComponentForm('column', 'mm', componentFormValues('column', 'mm'), 'Infinity')).toThrow();
    try { validateComponentForm('windowelevation', 'mm', { ...componentFormValues('windowelevation', 'mm'), frame: '700' }, '0'); throw Error('accepted'); }
    catch (error) { expect((error as ComponentError).fieldKeys).toEqual(expect.arrayContaining(['width', 'height', 'frame'])); }
  });
  it('preserves chosen values across placement and resets once for document, units or family', () => {
    const initial = newComponentForm('column', 'mm', 'doc-a');
    const chosen = { ...initial, values: { ...initial.values, width: '800' }, rotationText: '45' };
    expect(refreshComponentForm(chosen, 'column', 'mm', 'doc-a')).toBe(chosen);
    const metres = refreshComponentForm(chosen, 'column', 'm', 'doc-a');
    expect(metres.values.width).toBe('0.4');
    expect(refreshComponentForm(metres, 'column', 'm', 'doc-a')).toBe(metres);
    expect(refreshComponentForm(chosen, 'column', 'mm', 'doc-b').values.width).toBe('400');
    expect(refreshComponentForm(chosen, 'stairplan', 'mm', 'doc-a').values.steps).toBe('16');
  });
  it('never invokes a command for invalid fields or stale document/units context', () => {
    const editor = new Editor(createDocument({ units: 'm' }));
    const command = vi.spyOn(editor, 'command').mockResolvedValue(undefined);
    const state = newComponentForm('column', 'm', editor.doc.id);
    expect(() => startComponentPlacement(editor, { ...state, values: { ...state.values, width: 'Infinity' } })).toThrow();
    expect(() => startComponentPlacement(editor, { ...state, docId: 'old-doc' })).toThrow();
    editor.doc.transact('units', tx => tx.setSettings({ units: 'mm' }));
    expect(() => startComponentPlacement(editor, state)).toThrow();
    expect(command).not.toHaveBeenCalled();
  });
  it('places with the same validated canonical args and retains hidden parameters', () => {
    const editor = new Editor(createDocument({ units: 'm' }));
    const command = vi.spyOn(editor, 'command').mockResolvedValue(undefined);
    const state = newComponentForm('column', 'm', editor.doc.id);
    state.values.variant = 'circular'; state.values.width = '0.8';
    const result = startComponentPlacement(editor, state);
    expect(command).toHaveBeenCalledWith('COLUMN', result.args);
    expect(result.parameters.width).toBe(0.8);
    expect(buildComponent('column', result.parameters)).toEqual(buildComponent('column', { ...componentDefaults('column', 'm'), variant: 'circular', width: 0.8 }));
  });
  it('shares declarative variant visibility with command parameter pickers', () => {
    const keys = (kind: 'column' | 'stairplan' | 'banister', values: Record<string, string>) => visibleComponentFields(kind, values).map(f => f.key);
    expect(keys('column', { variant: 'circular' })).toEqual(['variant', 'diameter']);
    expect(keys('column', { variant: 'rectangular' })).toEqual(['variant', 'width', 'depth']);
    expect(keys('column', { variant: 'l' })).toEqual(['variant', 'width', 'depth', 'arm']);
    expect(keys('stairplan', { variant: 'curved' })).toEqual(['variant', 'width', 'steps', 'innerRadius', 'turn']);
    expect(keys('stairplan', { variant: 'u' })).toEqual(['variant', 'width', 'tread', 'steps', 'landing']);
    expect(keys('banister', { view: 'plan' })).not.toContain('height');
    expect(keys('banister', { view: 'elevation' })).toContain('height');
  });
});
