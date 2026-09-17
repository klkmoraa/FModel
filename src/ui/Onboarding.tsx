import { useState } from 'react';
import type { Editor } from '../editor/editor';
import { tr } from './controls';
import { BrandMark } from './icons';

interface Step {
  title: [string, string];
  body: [string, string];
  keys?: string[];
  action?: { label: [string, string]; command: string };
}

const STEPS: Step[] = [
  {
    title: ['Bienvenido a FModel 2D CAD', 'Welcome to FModel 2D CAD'],
    body: ['CAD 2D de precisión en el navegador. Tus dibujos se guardan en este equipo: autoguardado, versiones y recuperación incluidos, sin enviar nada a servidores.', 'Precision 2D CAD in the browser. Your drawings stay on this device: autosave, versions and recovery included, nothing sent to servers.'],
  },
  {
    title: ['Escribe para dibujar', 'Type to draw'],
    body: ['Empieza a escribir en cualquier momento: L (línea), C (círculo), TR (recortar), O (desfase)… Intro repite el último comando y Esc cancela. Ctrl+K abre la paleta con búsqueda por tarea.', 'Start typing anytime: L (line), C (circle), TR (trim), O (offset)… Enter repeats the last command and Esc cancels. Ctrl+K opens the palette with task search.'],
    keys: ['L', 'C', 'TR', 'O', 'Ctrl+K', 'Esc'],
  },
  {
    title: ['Precisión', 'Precision'],
    body: ['Coordenadas @x,y y @distancia<ángulo, distancia directa, orto (F8), rastreo polar (F10), referencias a objetos (F3) con Tab para alternar candidatos y entrada dinámica junto al cursor.', 'Coordinates @x,y and @distance<angle, direct distance, ortho (F8), polar tracking (F10), object snaps (F3) with Tab to cycle candidates and dynamic input by the cursor.'],
    keys: ['@10,0', '@50<30', 'F3', 'F8', 'F10', 'Tab'],
  },
  {
    title: ['Bloques dinámicos y presentaciones', 'Dynamic blocks and layouts'],
    body: ['Inserta los ejemplos dinámicos y mueve sus pinzamientos; ábrelos en el Editor de bloques (BEDIT). En las pestañas de presentación crea viewports (MVIEW), un cajetín (TITLEBLOCK) y traza a PDF vectorial.', 'Insert the dynamic samples and drag their grips; open them in the Block Editor (BEDIT). In layout tabs create viewports (MVIEW), a title block (TITLEBLOCK) and plot to vector PDF.'],
    action: { label: ['Insertar ejemplos dinámicos', 'Insert dynamic samples'], command: 'DYNBLOCKSAMPLES' },
  },
  {
    title: ['Ayuda siempre a mano', 'Help at hand'],
    body: ['F1 abre la ayuda con todos los comandos y el estado real de cada función. DXF se importa y exporta con informe de conversión; DWG no se admite y no se simula.', 'F1 opens help with every command and the real status of each feature. DXF imports and exports with a conversion report; DWG is not supported and not simulated.'],
    keys: ['F1'],
  },
];

/** Guía breve de primer uso; se puede omitir y volver a mostrar desde Opciones. */
export function Onboarding({ editor }: { editor: Editor }) {
  const lang = editor.lang;
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const finish = () => editor.setPrefs({ onboardingDone: true });
  const last = i === STEPS.length - 1;
  return (
    <div className="veil" onKeyDown={(e) => (e.stopPropagation(), e.key === 'Escape' && finish())}>
      <div className="dialog onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="dialog__body">
          {i === 0 && (
            <div className="onboarding__mark">
              <BrandMark size={48} />
            </div>
          )}
          <div className="eyebrow">
            {i + 1} / {STEPS.length}
          </div>
          <h2 id="onboarding-title" className="onboarding__title">
            {tr(lang, ...step.title)}
          </h2>
          <p className="onboarding__body">{tr(lang, ...step.body)}</p>
          {step.keys && (
            <div className="report__chips">
              {step.keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </div>
          )}
          {step.action && (
            <button className="btn btn--sm" style={{ marginTop: 12 }} onClick={() => (finish(), editor.command(step.action!.command))}>
              {tr(lang, ...step.action.label)}
            </button>
          )}
          <div className="onboarding__dots" aria-hidden>
            {STEPS.map((_, j) => (
              <span key={j} className={j === i ? 'is-active' : ''} />
            ))}
          </div>
        </div>
        <div className="dialog__foot">
          <button className="btn" onClick={finish} style={{ marginRight: 'auto' }}>
            {tr(lang, 'Omitir', 'Skip')}
          </button>
          {i > 0 && (
            <button className="btn" onClick={() => setI(i - 1)}>
              {tr(lang, 'Atrás', 'Back')}
            </button>
          )}
          <button className="btn btn--primary" autoFocus onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? tr(lang, 'Empezar a dibujar', 'Start drawing') : tr(lang, 'Siguiente', 'Next')}
          </button>
        </div>
      </div>
    </div>
  );
}
