import type { AngleFormat, DimStyleProps, UnitFormat } from '../document/types';

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

export function formatDecimal(value: number, precision: number, sep: '.' | ',' = '.', suppressTrailing = false, suppressLeading = false): string {
  let s = Math.abs(value).toFixed(Math.max(0, Math.min(8, precision)));
  if (suppressTrailing && s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (suppressLeading && s.startsWith('0.')) s = s.slice(1);
  if (sep === ',') s = s.replace('.', ',');
  const neg = value < 0 && Number(s.replace(',', '.')) !== 0;
  return (neg ? '−' : '') + s;
}

function fraction(value: number, precision: number): string {
  const den = 2 ** Math.max(0, Math.min(8, precision));
  const whole = Math.floor(Math.abs(value));
  let num = Math.round((Math.abs(value) - whole) * den);
  let w = whole;
  if (num === den) {
    w += 1;
    num = 0;
  }
  const sign = value < 0 ? '−' : '';
  if (!num) return `${sign}${w}`;
  const g = gcd(num, den);
  return `${sign}${w ? `${w} ` : ''}${num / g}/${den / g}`;
}

/**
 * Formatea una longitud. Para 'architectural' y 'engineering' el valor se interpreta
 * en pulgadas (convención AutoCAD).
 */
export function formatLength(value: number, format: UnitFormat, precision: number, sep: '.' | ',' = '.', opts: { suppressTrailing?: boolean; suppressLeading?: boolean } = {}): string {
  switch (format) {
    case 'scientific':
      return value.toExponential(Math.max(0, precision)).replace('.', sep);
    case 'fractional':
      return fraction(value, precision);
    case 'engineering': {
      const sign = value < 0 ? '−' : '';
      const v = Math.abs(value);
      const ft = Math.floor(v / 12);
      const inches = v - ft * 12;
      return `${sign}${ft}'-${formatDecimal(inches, precision, sep, opts.suppressTrailing)}"`;
    }
    case 'architectural': {
      const sign = value < 0 ? '−' : '';
      const v = Math.abs(value);
      let ft = Math.floor(v / 12);
      let inches = v - ft * 12;
      const den = 2 ** Math.max(0, Math.min(8, precision));
      if (Math.round(inches * den) / den >= 12) {
        ft += 1;
        inches = 0;
      }
      return `${sign}${ft}'-${fraction(inches, precision)}"`;
    }
    default:
      return formatDecimal(value, precision, sep, opts.suppressTrailing, opts.suppressLeading);
  }
}

export function formatAngle(rad: number, format: AngleFormat, precision: number, sep: '.' | ',' = '.'): string {
  switch (format) {
    case 'radians':
      return `${formatDecimal(rad, precision, sep)}r`;
    case 'grads':
      return `${formatDecimal((rad * 200) / Math.PI, precision, sep)}g`;
    case 'dms': {
      const deg = (Math.abs(rad) * 180) / Math.PI;
      const d = Math.floor(deg);
      const mTotal = (deg - d) * 60;
      const m = Math.floor(mTotal);
      const s = (mTotal - m) * 60;
      const sign = rad < 0 ? '−' : '';
      if (precision <= 0) return `${sign}${Math.round(deg)}°`;
      if (precision <= 2) return `${sign}${d}°${Math.round(mTotal)}'`;
      return `${sign}${d}°${m}'${formatDecimal(s, Math.max(0, precision - 4), sep)}"`;
    }
    case 'surveyor': {
      const deg = (((rad * 180) / Math.PI) % 360 + 360) % 360;
      const ns = deg <= 180 ? 'N' : 'S';
      const base = ns === 'N' ? 90 : 270;
      const off = deg - base;
      const ew = (ns === 'N' ? off < 0 : off > 0) ? 'E' : 'W';
      return `${ns} ${formatDecimal(Math.abs(off), precision, sep)}° ${ew}`;
    }
    default:
      return `${formatDecimal((rad * 180) / Math.PI, precision, sep, true)}°`;
  }
}

function round(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

/** Texto medido de cota con prefijo/sufijo, tolerancias y unidades alternativas. */
export function formatDimValue(value: number, props: DimStyleProps, kind: 'linear' | 'angular', extraPrefix = ''): { main: string; tolUpper?: string; tolLower?: string; alt?: string } {
  if (kind === 'angular') {
    const main = `${extraPrefix}${props.prefix}${formatAngle(value, props.angleFormat, props.anglePrecision, props.decimalSeparator)}${props.suffix}`;
    return { main };
  }
  const v = round(value * props.linearFactor, props.roundOff);
  const opts = { suppressTrailing: props.suppressTrailingZeros, suppressLeading: props.suppressLeadingZeros };
  let main = formatLength(v, props.unitFormat, props.precision, props.decimalSeparator, opts);
  const out: { main: string; tolUpper?: string; tolLower?: string; alt?: string } = { main: '' };
  if (props.tolerance === 'symmetrical') {
    main += ` ±${formatDecimal(props.tolUpper, props.tolPrecision, props.decimalSeparator)}`;
  } else if (props.tolerance === 'deviation') {
    out.tolUpper = `+${formatDecimal(props.tolUpper, props.tolPrecision, props.decimalSeparator)}`;
    out.tolLower = `−${formatDecimal(Math.abs(props.tolLower), props.tolPrecision, props.decimalSeparator)}`;
  } else if (props.tolerance === 'limits') {
    const up = formatLength(v + props.tolUpper, props.unitFormat, props.precision, props.decimalSeparator, opts);
    const lo = formatLength(v - Math.abs(props.tolLower), props.unitFormat, props.precision, props.decimalSeparator, opts);
    main = `${up}/${lo}`;
  }
  out.main = `${extraPrefix}${props.prefix}${main}${props.suffix}`;
  if (props.tolerance === 'basic') out.main = `[${out.main}]`;
  if (props.altUnits) {
    out.alt = `[${props.altPrefix}${formatDecimal(value * props.linearFactor * props.altFactor, props.altPrecision, props.decimalSeparator, props.suppressTrailingZeros)}${props.altSuffix}]`;
  }
  return out;
}
