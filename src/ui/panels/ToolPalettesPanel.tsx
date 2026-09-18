import { Plus, Star, Trash2 } from 'lucide-react';
import { isInsertableBlock } from '../../blocks/blockOps';
import { useMemo, useState } from 'react';
import { hatchDefaults } from '../../commands/draw';
import type { Editor } from '../../editor/editor';
import { HATCH_PATTERNS } from '../../model/hatchPatterns';
import { blockThumbnail } from '../../render/thumbnail';
import { useEditorEvents } from '../hooks';
import { CadIcon } from '../icons';
import { tr } from '../controls';
import { DND_MIME } from '../dnd';

export type PaletteItem =
  | { kind: 'block'; name: string; scale?: number; rotation?: number }
  | { kind: 'hatch'; pattern: string; scale: number; angle: number }
  | { kind: 'command'; cmd: string; args?: string[]; label: { es: string; en: string }; icon: string }
  | { kind: 'preset'; name: string; layer?: string; color?: string; linetype?: string; lineweight?: number }
  | { kind: 'dimstyle'; style: string; cmd: string };

interface Palette {
  id: string;
  name: { es: string; en: string };
  custom?: boolean;
  items: PaletteItem[];
}

const KEY = 'fmodel.cad.palettes.v1';

export function isDarkTheme(editor: Editor): boolean {
  if (editor.prefs.theme === 'noche') return true;
  if (editor.prefs.theme === 'dia') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function loadCustom(): Palette[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Palette[];
  } catch {
    return [];
  }
}
function saveCustom(p: Palette[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento */
  }
}

/** Ejecuta un elemento de paleta en un punto (arrastrar y soltar) o con clic. */
export async function runPaletteItem(editor: Editor, item: PaletteItem, at?: { x: number; y: number }) {
  switch (item.kind) {
    case 'block': {
      const inputs: (string | { x: number; y: number })[] = [];
      if (at) inputs.push(at, String(item.scale ?? 1), String(((item.rotation ?? 0) * 180) / Math.PI));
      await editor.runner.script('INSERT', inputs, [item.name]);
      break;
    }
    case 'hatch':
      hatchDefaults.pattern = item.pattern;
      hatchDefaults.type = item.pattern === 'SOLID' ? 'solid' : 'predefined';
      hatchDefaults.scale = item.scale;
      hatchDefaults.angle = item.angle;
      await editor.runner.script('HATCH', at ? ['', at, ''] : ['']);
      break;
    case 'command':
      await editor.runner.script(item.cmd, [], item.args);
      break;
    case 'dimstyle': {
      const st = editor.doc.findByName('dimStyles', item.style);
      if (st) editor.doc.transact('DIMSTYLE CURRENT', (tx) => tx.setSettings({ currentDimStyle: st.id }));
      await editor.runner.script(item.cmd, []);
      break;
    }
    case 'preset': {
      const doc = editor.doc;
      const layer = item.layer ? doc.findByName('layers', item.layer) : undefined;
      const lt = item.linetype ? doc.findByName('linetypes', item.linetype) : undefined;
      const patch = { ...(layer ? { layer: layer.id } : {}), ...(item.color ? { color: item.color } : {}), ...(lt ? { linetype: lt.id } : {}), ...(item.lineweight !== undefined ? { lineweight: item.lineweight } : {}) };
      if (editor.selection.size) {
        doc.transact('PRESET', (tx) => {
          for (const id of editor.selection.list) tx.updateEntity(id, patch);
        });
      } else {
        doc.transact('PRESET CURRENT', (tx) =>
          tx.setSettings({
            ...(layer ? { currentLayer: layer.id } : {}),
            ...(item.color ? { currentColor: item.color } : {}),
            ...(lt ? { currentLinetype: lt.id } : {}),
            ...(item.lineweight !== undefined ? { currentLineweight: item.lineweight } : {}),
          }),
        );
      }
      break;
    }
  }
}

export function ToolPalettesPanel({ editor }: { editor: Editor }) {
  useEditorEvents(editor, ['doc', 'prefs']);
  const lang = editor.lang;
  const doc = editor.doc;
  const [custom, setCustom] = useState<Palette[]>(() => loadCustom());
  const [active, setActive] = useState('symbols');
  const [q, setQ] = useState('');

  const builtIn: Palette[] = useMemo(() => {
    const blocks = [...doc.data.blocks.values()].filter(isInsertableBlock);
    const byCat = new Map<string, typeof blocks>();
    for (const b of blocks) {
      const c = b.category ?? tr(lang, 'Bloques', 'Blocks');
      byCat.set(c, [...(byCat.get(c) ?? []), b]);
    }
    return [
      {
        id: 'symbols',
        name: { es: 'Símbolos', en: 'Symbols' },
        items: blocks.map((b) => ({ kind: 'block' as const, name: b.name })),
      },
      ...[...byCat.entries()].map(([cat, bs]) => ({ id: `cat:${cat}`, name: { es: cat, en: cat }, items: bs.map((b) => ({ kind: 'block' as const, name: b.name })) })),
      {
        id: 'hatches',
        name: { es: 'Sombreados', en: 'Hatches' },
        items: [{ kind: 'hatch', pattern: 'SOLID', scale: 1, angle: 0 }, ...HATCH_PATTERNS.map((p) => ({ kind: 'hatch' as const, pattern: p.name, scale: 1, angle: 0 }))],
      },
      {
        id: 'dims',
        name: { es: 'Cotas', en: 'Dimensions' },
        items: [...doc.data.dimStyles.values()].flatMap((s) => [
          { kind: 'dimstyle' as const, style: s.name, cmd: 'DIMLINEAR' },
          { kind: 'dimstyle' as const, style: s.name, cmd: 'DIMALIGNED' },
          { kind: 'dimstyle' as const, style: s.name, cmd: 'DIMRADIUS' },
        ]),
      },
      {
        id: 'text',
        name: { es: 'Textos', en: 'Text' },
        items: [
          { kind: 'command', cmd: 'MTEXT', label: { es: 'Texto múltiple', en: 'MText' }, icon: 'mtext' },
          { kind: 'command', cmd: 'TEXT', label: { es: 'Texto de una línea', en: 'Single-line text' }, icon: 'text' },
          { kind: 'command', cmd: 'MLEADER', label: { es: 'Directriz múltiple', en: 'Multileader' }, icon: 'mleader' },
          { kind: 'command', cmd: 'TABLE', label: { es: 'Tabla', en: 'Table' }, icon: 'table' },
          { kind: 'command', cmd: 'REVCLOUD', label: { es: 'Nube de revisión', en: 'Revision cloud' }, icon: 'revcloud' },
        ],
      },
      {
        id: 'presets',
        name: { es: 'Presets', en: 'Presets' },
        items: [
          ...[...doc.data.layers.values()].slice(0, 30).map((l) => ({ kind: 'preset' as const, name: `${tr(lang, 'Capa', 'Layer')} ${l.name}`, layer: l.name })),
          { kind: 'preset', name: tr(lang, 'Oculta roja 0.25', 'Hidden red 0.25'), color: 'aci:1', linetype: 'HIDDEN', lineweight: 25 },
          { kind: 'preset', name: tr(lang, 'Ejes (CENTER)', 'Axes (CENTER)'), color: 'aci:4', linetype: 'CENTER', lineweight: 18 },
          { kind: 'preset', name: tr(lang, 'Contorno grueso 0.50', 'Heavy outline 0.50'), color: 'ByLayer', linetype: 'Continuous', lineweight: 50 },
        ],
      },
    ];
  }, [doc, doc.version, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const palettes = [...builtIn, ...custom];
  const current = palettes.find((p) => p.id === active) ?? palettes[0];
  const items = current.items.filter((it) => !q || JSON.stringify(it).toLowerCase().includes(q.toLowerCase()));
  const favs = new Set(editor.prefs.favorites);

  const addToCustom = (item: PaletteItem) => {
    let pal = custom[0];
    const next = [...custom];
    if (!pal) {
      pal = { id: 'custom:mine', name: { es: 'Mis herramientas', en: 'My tools' }, custom: true, items: [] };
      next.push(pal);
    }
    pal.items = [...pal.items, item];
    saveCustom(next);
    setCustom([...next]);
  };

  const labelOf = (it: PaletteItem) => (it.kind === 'block' ? it.name : it.kind === 'hatch' ? it.pattern : it.kind === 'command' ? it.label[lang] : it.kind === 'dimstyle' ? `${it.style} · ${it.cmd.replace('DIM', '')}` : it.name);
  const iconOf = (it: PaletteItem) => (it.kind === 'hatch' ? 'hatch' : it.kind === 'command' ? it.icon : it.kind === 'dimstyle' ? (it.cmd === 'DIMRADIUS' ? 'dimradius' : it.cmd === 'DIMALIGNED' ? 'dimaligned' : 'dimlinear') : 'properties');

  return (
    <div className="panel">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="tablist">
        {palettes.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === current.id} className={`btn btn--sm${p.id === current.id ? ' btn--accent' : ''}`} onClick={() => setActive(p.id)}>
            {p.name[lang]}
          </button>
        ))}
      </div>
      <input className="input" placeholder={tr(lang, 'Buscar en la paleta…', 'Search palette…')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <p className="eyebrow" style={{ margin: 0 }}>
        {tr(lang, 'Clic para usar · arrastra al lienzo para colocar con referencia a objetos', 'Click to use · drag onto the canvas to place with object snaps')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
        {items.map((it, i) => (
          <div
            key={`${current.id}-${i}`}
            className="section"
            style={{ padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab' }}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND_MIME, JSON.stringify(it))}
            onClick={() => void runPaletteItem(editor, it)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && void runPaletteItem(editor, it)}
            title={labelOf(it)}
          >
            {it.kind === 'block' ? (
              (() => {
                const b = doc.findByName('blocks', it.name);
                const t = b ? blockThumbnail(editor, b.id, 64, isDarkTheme(editor)) : null;
                return t ? <img src={t} width={48} height={48} alt="" draggable={false} /> : <CadIcon name="block" size={28} />;
              })()
            ) : it.kind === 'preset' ? (
              <span className="swatch" style={{ width: 28, height: 28, background: it.color?.startsWith('#') ? it.color : 'var(--fm-accent-soft)' }} />
            ) : (
              <CadIcon name={iconOf(it)} size={28} />
            )}
            <span style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>{labelOf(it)}</span>
            {!current.custom ? (
              <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={(e) => (e.stopPropagation(), addToCustom(it))} title={tr(lang, 'Añadir a Mis herramientas', 'Add to My tools')}>
                <Plus size={11} />
              </button>
            ) : (
              <button
                className="icon-btn"
                style={{ width: 20, height: 20 }}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = custom.map((p) => (p.id === current.id ? { ...p, items: p.items.filter((_, j) => j !== i) } : p));
                  saveCustom(next);
                  setCustom(next);
                }}
                title={tr(lang, 'Quitar', 'Remove')}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
        {!items.length && <div className="empty">{tr(lang, 'Sin elementos.', 'No items.')}</div>}
      </div>
      <div className="section" style={{ padding: 8 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          <Star size={10} /> {tr(lang, 'Comandos favoritos', 'Favorite commands')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {[...favs].map((f) => (
            <button key={f} className="btn btn--sm" onClick={() => editor.command(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
