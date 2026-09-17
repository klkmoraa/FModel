import type { TextMeasurer } from './registry';

/**
 * Medición de texto. En el navegador usa un canvas fuera de pantalla a 100 px y
 * escala; en pruebas/Node usa anchos medios por carácter. El resultado se expresa
 * en unidades de dibujo para una altura dada.
 */
let canvasCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

function getCtx() {
  if (canvasCtx !== undefined) return canvasCtx;
  try {
    if (typeof OffscreenCanvas !== 'undefined') canvasCtx = new OffscreenCanvas(8, 8).getContext('2d');
    else if (typeof document !== 'undefined') canvasCtx = document.createElement('canvas').getContext('2d');
    else canvasCtx = null;
  } catch {
    canvasCtx = null;
  }
  return canvasCtx;
}

const NARROW = new Set('iIl.,:;|!\'`ftrj ()[]'.split(''));
const WIDE = new Set('mwMWOQGDH@%&'.split(''));

export function heuristicWidth(text: string, height: number): number {
  let w = 0;
  for (const ch of text) w += NARROW.has(ch) ? 0.32 : WIDE.has(ch) ? 0.86 : ch === ch.toUpperCase() && /[A-Z0-9]/.test(ch) ? 0.66 : 0.56;
  return w * height;
}

export const measureText: TextMeasurer = (text, font, height, opts) => {
  if (!text) return 0;
  const key = `${font}|${opts?.bold ? 1 : 0}${opts?.italic ? 1 : 0}|${text}`;
  let unit = cache.get(key);
  if (unit === undefined) {
    const ctx = getCtx();
    if (ctx) {
      ctx.font = `${opts?.italic ? 'italic ' : ''}${opts?.bold ? '700 ' : '400 '}100px ${cssFontFamily(font)}`;
      unit = ctx.measureText(text).width / 100;
    } else {
      unit = heuristicWidth(text, 1);
    }
    if (cache.size > 20000) cache.clear();
    cache.set(key, unit);
  }
  // `height` es la altura CAD (altura de mayúsculas); el tamaño de fuente es mayor.
  return (unit * height) / CAP_HEIGHT_RATIO;
};

export function cssFontFamily(font: string): string {
  const f = font.trim();
  const generic = /mono/i.test(f) ? 'ui-monospace, monospace' : 'ui-sans-serif, system-ui, sans-serif';
  if (!f || /^(txt|simplex|romans|isocp|arial)(\.shx|\.ttf)?$/i.test(f)) return `Inter, ${generic}`;
  return `"${f.replace(/\.(shx|ttf|otf)$/i, '')}", ${generic}`;
}

/** Relación entre altura de mayúscula (altura CAD) y tamaño de fuente CSS. */
export const CAP_HEIGHT_RATIO = 0.727;

export interface MTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  heightFactor?: number;
  color?: string;
}

export interface MTextLine {
  runs: MTextRun[];
  width: number;
  paragraphStart: boolean;
}

/**
 * Interpreta el marcado MTEXT mínimo: \P (párrafo), \~ (espacio duro), {\b1…} / {\i1…}
 * y los códigos DXF %%c %%d %%p. Otros códigos se ignoran pero se conserva el texto.
 */
export function parseMText(contents: string): MTextRun[][] {
  const paragraphs: MTextRun[][] = [[]];
  let bold = false;
  let italic = false;
  let underline = false;
  const stack: { bold: boolean; italic: boolean; underline: boolean }[] = [];
  let buf = '';
  const flush = () => {
    if (buf) paragraphs[paragraphs.length - 1].push({ text: buf, bold, italic, underline });
    buf = '';
  };
  const s = contents.replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\n') {
      flush();
      paragraphs.push([]);
      continue;
    }
    if (ch === '{') {
      flush();
      stack.push({ bold, italic, underline });
      continue;
    }
    if (ch === '}') {
      flush();
      const st = stack.pop();
      if (st) ({ bold, italic, underline } = st);
      continue;
    }
    if (ch === '\\' && i + 1 < s.length) {
      const code = s[i + 1];
      if (code === 'P') {
        flush();
        paragraphs.push([]);
        i++;
        continue;
      }
      if (code === '~') {
        buf += ' ';
        i++;
        continue;
      }
      if (code === '\\' || code === '{' || code === '}') {
        buf += code;
        i++;
        continue;
      }
      if (code === 'L' || code === 'l') {
        flush();
        underline = code === 'L';
        i++;
        continue;
      }
      if (code === 'b' || code === 'i') {
        flush();
        const on = s[i + 2] === '1';
        if (code === 'b') bold = on;
        else italic = on;
        i += 2;
        continue;
      }
      if ('fFHhCcTtQqWwAap'.includes(code)) {
        // código con argumento terminado en ';'
        const end = s.indexOf(';', i);
        if (end > 0) {
          flush();
          const arg = s.slice(i + 2, end);
          if (code === 'f' || code === 'F') {
            if (/\|b1/.test(arg)) bold = true;
            if (/\|i1/.test(arg)) italic = true;
          }
          i = end;
          continue;
        }
      }
    }
    buf += ch;
  }
  flush();
  return paragraphs;
}

/** Ajusta párrafos a un ancho (0 = sin ajuste) usando el medidor. */
export function layoutMText(contents: string, width: number, height: number, font: string, measure: TextMeasurer): MTextLine[] {
  const paragraphs = parseMText(contents);
  const lines: MTextLine[] = [];
  for (const para of paragraphs) {
    if (!para.length) {
      lines.push({ runs: [], width: 0, paragraphStart: true });
      continue;
    }
    if (width <= 0) {
      const w = para.reduce((s, r) => s + measure(r.text, font, height, r), 0);
      lines.push({ runs: para, width: w, paragraphStart: true });
      continue;
    }
    let line: MTextRun[] = [];
    let lineW = 0;
    let first = true;
    for (const run of para) {
      const words = run.text.split(/(\s+)/);
      for (const word of words) {
        if (!word) continue;
        const ww = measure(word, font, height, run);
        if (lineW + ww > width && lineW > 0 && !/^\s+$/.test(word)) {
          lines.push({ runs: trimRuns(line), width: lineW, paragraphStart: first });
          first = false;
          line = [];
          lineW = 0;
        }
        if (!line.length && /^\s+$/.test(word)) continue;
        const last = line[line.length - 1];
        if (last && last.bold === run.bold && last.italic === run.italic && last.underline === run.underline) last.text += word;
        else line.push({ ...run, text: word });
        lineW += ww;
      }
    }
    lines.push({ runs: trimRuns(line), width: lineW, paragraphStart: first });
  }
  return lines;
}

function trimRuns(runs: MTextRun[]): MTextRun[] {
  if (runs.length) runs[runs.length - 1] = { ...runs[runs.length - 1], text: runs[runs.length - 1].text.replace(/\s+$/, '') };
  return runs;
}

export function plainMText(contents: string): string {
  return parseMText(contents)
    .map((p) => p.map((r) => r.text).join(''))
    .join('\n');
}
