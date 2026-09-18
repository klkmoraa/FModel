import type { CommandDef, Lang } from './types';

const commands = new Map<string, CommandDef>();
const aliasMap = new Map<string, string>();
let userAliases: Record<string, string> = {};

export function registerCommand(def: CommandDef) {
  const name = def.name.toUpperCase();
  commands.set(name, { ...def, name });
  for (const a of def.aliases) aliasMap.set(a.toUpperCase(), name);
}

export function registerCommands(defs: CommandDef[]) {
  defs.forEach(registerCommand);
}

export function setUserAliases(aliases: Record<string, string>) {
  userAliases = Object.fromEntries(Object.entries(aliases).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
}

export function getUserAliases(): Record<string, string> {
  return { ...userAliases };
}

export function findCommand(input: string): CommandDef | undefined {
  // Los comandos internos se registran con «_» delante: se buscan tal cual antes de quitar el
  // prefijo (que en AutoCAD solo indica «nombre sin traducir»); si no, nunca se encontrarían.
  const exact = input.trim().toUpperCase();
  if (exact.startsWith('_') && commands.has(exact)) return commands.get(exact);
  const key = input.trim().replace(/^[_.'-]+/, '').toUpperCase();
  if (!key) return undefined;
  const target = userAliases[key] ?? (commands.has(key) ? key : aliasMap.get(key));
  return target ? commands.get(target) : undefined;
}

export function allCommands(): CommandDef[] {
  return [...commands.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function aliasesFor(name: string): string[] {
  const n = name.toUpperCase();
  const def = commands.get(n);
  const user = Object.entries(userAliases)
    .filter(([, v]) => v === n)
    .map(([k]) => k);
  return [...(def?.aliases ?? []), ...user];
}

/** Búsqueda inteligente: nombre, alias, etiqueta y descripción localizada, con coincidencia difusa. */
export function searchCommands(query: string, lang: Lang, limit = 30): CommandDef[] {
  const q = normalize(query);
  if (!q) return allCommands().slice(0, limit);
  const scored: { def: CommandDef; score: number }[] = [];
  for (const def of commands.values()) {
    const fields = [def.name, ...aliasesFor(def.name), def.label[lang], def.label[lang === 'es' ? 'en' : 'es'], def.description[lang]];
    let best = 0;
    fields.forEach((f, i) => {
      const n = normalize(f);
      if (!n) return;
      let s = 0;
      if (n === q) s = 100;
      else if (n.startsWith(q)) s = 80 - n.length * 0.1;
      else if (n.includes(q)) s = 55;
      else if (fuzzy(n, q)) s = 30;
      if (i >= 4) s *= 0.6; // la descripción pesa menos
      if (i === 1 || (i > 0 && i < fields.length - 3)) s *= 0.97;
      best = Math.max(best, s);
    });
    if (best > 0) scored.push({ def, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.def);
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function fuzzy(text: string, q: string): boolean {
  let i = 0;
  for (const ch of text) if (ch === q[i]) i++;
  return i === q.length;
}
