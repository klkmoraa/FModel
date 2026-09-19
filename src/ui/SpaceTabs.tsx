import { Plus } from 'lucide-react';
import { useState } from 'react';
import { defaultPageSetup } from '../document/defaults';
import { newId } from '../document/ids';
import type { Editor } from '../editor/editor';
import { MODEL_SPACE_ID } from '../document/types';
import { useEditorEvents } from './hooks';
import { askConfirm, askText } from './ConfirmHost';

export function SpaceTabs({ editor, onUi }: { editor: Editor; onUi: (ui: string) => void }) {
  useEditorEvents(editor, ['space', 'doc']);
  const lang = editor.lang;
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const layouts = [...editor.doc.data.layouts.values()].sort((a, b) => a.tabOrder - b.tabOrder);
  const blockEdit = editor.blockEdit;

  const addLayout = () => {
    const n = layouts.length + 1;
    const id = newId('layout');
    editor.doc.transact('LAYOUT', (tx) => tx.add('layouts', { id, name: `${lang === 'es' ? 'Presentación' : 'Layout'}${n}`, tabOrder: Math.max(0, ...layouts.map((l) => l.tabOrder)) + 1, page: defaultPageSetup() }));
    editor.setSpace(id);
  };

  const rename = async (id: string) => {
    const l = editor.doc.data.layouts.get(id);
    if (!l) return;
    const name = (await askText(lang, lang === 'es' ? 'Nuevo nombre de la presentación' : 'New layout name', l.name, { confirmLabel: lang === 'es' ? 'Renombrar' : 'Rename' }))?.trim();
    if (!name || name === l.name) return;
    if (layouts.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== id)) {
      editor.runner.message('error', { es: `Ya existe una presentación «${name}».`, en: `Layout "${name}" already exists.` });
      return;
    }
    editor.doc.transact('LAYOUT RENAME', (tx) => tx.update('layouts', id, { name }));
  };

  return (
    <div className="space-tabs">
      <div className="space-tab-list" role="tablist" aria-label={lang === 'es' ? 'Espacios' : 'Spaces'}>
        {blockEdit ? (
          <button className="space-tab is-active" role="tab" aria-selected>
            {lang === 'es' ? 'Editor de bloques' : 'Block editor'}: {editor.doc.data.blocks.get(blockEdit.blockId)?.name}
          </button>
        ) : (
          <>
            <button role="tab" aria-selected={editor.space === MODEL_SPACE_ID} className={`space-tab${editor.space === MODEL_SPACE_ID ? ' is-active' : ''}`} onClick={() => editor.setSpace(MODEL_SPACE_ID)}>
              {lang === 'es' ? 'Modelo' : 'Model'}
            </button>
            {layouts.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={editor.space === l.id}
                className={`space-tab${editor.space === l.id ? ' is-active' : ''}`}
                onClick={() => editor.setSpace(l.id)}
                onDoubleClick={() => rename(l.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ id: l.id, x: e.clientX, y: e.clientY });
                }}
              >
                {l.name}
              </button>
            ))}
          </>
        )}
      </div>
      {!blockEdit && <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={addLayout} title={lang === 'es' ? 'Nueva presentación' : 'New layout'} aria-label={lang === 'es' ? 'Nueva presentación' : 'New layout'}>
        <Plus size={14} />
      </button>}
      {menu && (
        <div className="veil" style={{ background: 'transparent' }} onMouseDown={() => setMenu(null)}>
          <div className="popover" style={{ position: 'fixed', left: menu.x, top: menu.y - 170 }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="menu-item" onClick={() => (rename(menu.id), setMenu(null))}>
              {lang === 'es' ? 'Renombrar' : 'Rename'}
            </button>
            <button
              className="menu-item"
              onClick={() => {
                const src = editor.doc.data.layouts.get(menu.id)!;
                const id = newId('layout');
                editor.doc.transact('LAYOUT COPY', (tx) => {
                  tx.add('layouts', { ...structuredClone(src), id, name: `${src.name} (2)`, tabOrder: src.tabOrder + 0.5 });
                  for (const e of editor.doc.entitiesOf(src.id)) {
                    const { id: _i, order: _o, ...rest } = e;
                    tx.addEntity({ ...structuredClone(rest), owner: id } as never);
                  }
                });
                setMenu(null);
              }}
            >
              {lang === 'es' ? 'Copiar' : 'Copy'}
            </button>
            <button className="menu-item" onClick={() => (editor.setSpace(menu.id), onUi('page-setup'), setMenu(null))}>
              {lang === 'es' ? 'Configurar página…' : 'Page setup…'}
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item btn--danger"
              disabled={layouts.length <= 1}
              onClick={async () => {
                const id = menu.id;
                setMenu(null);
                if (!(await askConfirm(lang, lang === 'es' ? 'Eliminar presentación' : 'Delete layout', lang === 'es' ? 'Se eliminará la presentación y sus objetos de papel. Se puede deshacer.' : 'The layout and its paper objects will be deleted. This can be undone.', { confirmLabel: lang === 'es' ? 'Eliminar' : 'Delete', danger: true }))) return;
                if (editor.space === id) editor.setSpace(MODEL_SPACE_ID);
                editor.doc.transact('LAYOUT DELETE', (tx) => {
                  for (const e of editor.doc.entitiesOf(id)) tx.removeEntity(e.id);
                  tx.remove('layouts', id);
                });
              }}
            >
              {lang === 'es' ? 'Eliminar' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
