/**
 * Evaluador de expresiones seguro (sin eval) para fórmulas de bloques dinámicos,
 * restricciones dimensionales, campos y entrada numérica.
 *
 * Gramática: + - * / ^ %, paréntesis, comparaciones (< <= > >= == !=), condicional
 * `cond ? a : b`, funciones (sin cos tan asin acos atan atan2 sqrt abs min max
 * round floor ceil pow ln log exp rad deg if) y constantes pi, e.
 * Los ángulos de sin/cos/tan están en grados (convención de parámetros CAD).
 */

export type ExprNode =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'unary'; op: '-' | '+' | '!'; arg: ExprNode }
  | { t: 'bin'; op: string; a: ExprNode; b: ExprNode }
  | { t: 'call'; name: string; args: ExprNode[] }
  | { t: 'cond'; test: ExprNode; a: ExprNode; b: ExprNode };

export class ExprError extends Error {}

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(`Número inválido en posición ${i}`);
      out.push({ k: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_À-ɏ]/.test(ch)) {
      const m = /^[A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||', '**'].includes(two)) {
      out.push({ k: 'op', v: two === '**' ? '^' : two });
      i += 2;
      continue;
    }
    if ('+-*/^%()<>,?:!'.includes(ch)) {
      out.push({ k: 'op', v: ch });
      i++;
      continue;
    }
    throw new ExprError(`Carácter inesperado «${ch}»`);
  }
  return out;
}

export function parseExpr(src: string): ExprNode {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.k === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Se esperaba «${v}»`);
    pos++;
  };

  const primary = (): ExprNode => {
    const t = peek();
    if (!t) throw new ExprError('Expresión incompleta');
    if (t.k === 'num') {
      pos++;
      return { t: 'num', v: t.v };
    }
    if (t.k === 'id') {
      pos++;
      if (isOp('(')) {
        pos++;
        const args: ExprNode[] = [];
        if (!isOp(')')) {
          args.push(conditional());
          while (isOp(',')) {
            pos++;
            args.push(conditional());
          }
        }
        expect(')');
        return { t: 'call', name: t.v.toLowerCase(), args };
      }
      return { t: 'var', name: t.v };
    }
    if (isOp('(')) {
      pos++;
      const e = conditional();
      expect(')');
      return e;
    }
    throw new ExprError(`Símbolo inesperado «${t.v}»`);
  };
  const unary = (): ExprNode => {
    if (isOp('-') || isOp('+') || isOp('!')) {
      const op = peek().v as '-' | '+' | '!';
      pos++;
      return { t: 'unary', op, arg: unary() };
    }
    return power();
  };
  const power = (): ExprNode => {
    const base = primary();
    if (isOp('^')) {
      pos++;
      return { t: 'bin', op: '^', a: base, b: unary() };
    }
    return base;
  };
  const binary = (next: () => ExprNode, ops: string[]) => (): ExprNode => {
    let left = next();
    while (peek()?.k === 'op' && ops.includes(String(peek().v))) {
      const op = String(peek().v);
      pos++;
      left = { t: 'bin', op, a: left, b: next() };
    }
    return left;
  };
  const mul = binary(unary, ['*', '/', '%']);
  const add = binary(mul, ['+', '-']);
  const cmp = binary(add, ['<', '<=', '>', '>=', '==', '!=']);
  const and = binary(cmp, ['&&']);
  const or = binary(and, ['||']);
  const conditional = (): ExprNode => {
    const test = or();
    if (isOp('?')) {
      pos++;
      const a = conditional();
      expect(':');
      const b = conditional();
      return { t: 'cond', test, a, b };
    }
    return test;
  };
  const root = conditional();
  if (pos < toks.length) throw new ExprError(`Símbolo sobrante «${toks[pos].v}»`);
  return root;
}

const D = Math.PI / 180;
const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: (x) => Math.sin(x * D),
  cos: (x) => Math.cos(x * D),
  tan: (x) => Math.tan(x * D),
  asin: (x) => Math.asin(x) / D,
  acos: (x) => Math.acos(x) / D,
  atan: (x) => Math.atan(x) / D,
  atan2: (y, x) => Math.atan2(y, x) / D,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: Math.floor,
  ceil: Math.ceil,
  pow: Math.pow,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  rad: (x) => x * D,
  deg: (x) => x / D,
  if: (c, a, b) => (c ? a : b),
  trunc: Math.trunc,
  sign: Math.sign,
};

export type Scope = Record<string, number> | ((name: string) => number | undefined);

export function evalExpr(node: ExprNode, scope: Scope = {}): number {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'var': {
      const lower = node.name.toLowerCase();
      if (lower === 'pi') return Math.PI;
      if (lower === 'e') return Math.E;
      const v = typeof scope === 'function' ? scope(node.name) : (scope[node.name] ?? scope[lower]);
      if (v === undefined || Number.isNaN(v)) throw new ExprError(`Variable desconocida «${node.name}»`);
      return v;
    }
    case 'unary': {
      const x = evalExpr(node.arg, scope);
      return node.op === '-' ? -x : node.op === '!' ? (x ? 0 : 1) : x;
    }
    case 'bin': {
      const a = evalExpr(node.a, scope);
      const b = evalExpr(node.b, scope);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new ExprError('División por cero');
          return a / b;
        case '%':
          return a % b;
        case '^':
          return a ** b;
        case '<':
          return a < b ? 1 : 0;
        case '<=':
          return a <= b ? 1 : 0;
        case '>':
          return a > b ? 1 : 0;
        case '>=':
          return a >= b ? 1 : 0;
        case '==':
          return Math.abs(a - b) < 1e-12 ? 1 : 0;
        case '!=':
          return Math.abs(a - b) >= 1e-12 ? 1 : 0;
        case '&&':
          return a && b ? 1 : 0;
        case '||':
          return a || b ? 1 : 0;
      }
      throw new ExprError(`Operador desconocido ${node.op}`);
    }
    case 'call': {
      const f = FUNCS[node.name];
      if (!f) throw new ExprError(`Función desconocida «${node.name}»`);
      return f(...node.args.map((a) => evalExpr(a, scope)));
    }
    case 'cond':
      return evalExpr(node.test, scope) ? evalExpr(node.a, scope) : evalExpr(node.b, scope);
  }
}

export function evaluate(src: string, scope: Scope = {}): number {
  return evalExpr(parseExpr(src), scope);
}

export function tryEvaluate(src: string, scope: Scope = {}): { ok: true; value: number } | { ok: false; error: string } {
  try {
    return { ok: true, value: evaluate(src, scope) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Variables referenciadas por una expresión (para grafos de dependencia y ciclos). */
export function dependencies(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: ExprNode) => {
    switch (n.t) {
      case 'var':
        if (!['pi', 'e'].includes(n.name.toLowerCase())) out.add(n.name);
        break;
      case 'unary':
        walk(n.arg);
        break;
      case 'bin':
        walk(n.a);
        walk(n.b);
        break;
      case 'call':
        n.args.forEach(walk);
        break;
      case 'cond':
        walk(n.test);
        walk(n.a);
        walk(n.b);
        break;
    }
  };
  try {
    walk(parseExpr(src));
  } catch {
    /* expresión inválida: sin dependencias */
  }
  return [...out];
}

/** Ordena variables por dependencias; lanza si hay ciclo. */
export function topoSortExpressions(exprs: Record<string, string>): string[] {
  const order: string[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (name: string, path: string[]) => {
    const s = state.get(name);
    if (s === 2) return;
    if (s === 1) throw new ExprError(`Dependencia circular: ${[...path, name].join(' → ')}`);
    state.set(name, 1);
    for (const d of dependencies(exprs[name] ?? '')) if (d in exprs) visit(d, [...path, name]);
    state.set(name, 2);
    order.push(name);
  };
  for (const k of Object.keys(exprs)) visit(k, []);
  return order;
}
