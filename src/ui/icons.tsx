import type { JSX } from 'react';

/**
 * Iconografía CAD de FModel: caja 24×24, trazo 1.6, nudos marcados con el acento
 * de familia (el glifo se entiende sin color; el acento solo refuerza).
 */
const N = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={1.7} className="ico-node" fill="var(--fm-accent)" stroke="none" />;

const paths: Record<string, JSX.Element> = {
  line: (
    <>
      <path d="M5 19 19 5" />
      <N x={5} y={19} />
      <N x={19} y={5} />
    </>
  ),
  pline: (
    <>
      <path d="M4 18 9 8h7a4 4 0 0 1 0 8h-2" />
      <N x={4} y={18} />
      <N x={9} y={8} />
    </>
  ),
  circle: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <N x={12} y={12} />
    </>
  ),
  arc: (
    <>
      <path d="M4.5 17A8 8 0 0 1 19.5 17" />
      <N x={4.5} y={17} />
      <N x={12} y={9} />
      <N x={19.5} y={17} />
    </>
  ),
  rect: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="0.5" />
      <N x={4} y={18} />
      <N x={20} y={6} />
    </>
  ),
  polygon: (
    <>
      <path d="M12 4 19 8v8l-7 4-7-4V8z" />
      <N x={12} y={12} />
    </>
  ),
  ellipse: (
    <>
      <ellipse cx="12" cy="12" rx="8.5" ry="5" />
      <N x={12} y={12} />
    </>
  ),
  spline: (
    <>
      <path d="M3 16c3-9 6-9 9-4s6 5 9-4" />
      <N x={3} y={16} />
      <N x={21} y={8} />
    </>
  ),
  point: (
    <>
      <path d="M12 7v10M7 12h10" />
      <N x={12} y={12} />
    </>
  ),
  ray: (
    <>
      <path d="M6 18 21 3" strokeDasharray="0" />
      <N x={6} y={18} />
    </>
  ),
  xline: <path d="M2 20 22 4" />,
  revcloud: <path d="M6 16a2.5 2.5 0 0 1-.5-4.9A3 3 0 0 1 9.8 7a3 3 0 0 1 5.4.3 2.5 2.5 0 0 1 3.6 2.6A2.5 2.5 0 0 1 18 16z" />,
  hatch: (
    <>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M4 12 12 4M4 20 20 4M12 20l8-8" />
    </>
  ),
  boundary: (
    <>
      <path d="M4 4h16v16H4z" strokeDasharray="3 2" />
      <path d="M8 8h8v8H8z" />
    </>
  ),
  region: (
    <>
      <path d="M5 6h14v12H5z" fill="var(--fm-accent-soft)" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  text: <path d="M6 6h12M12 6v13M9 19h6" />,
  mtext: <path d="M4 6h16M4 10h16M4 14h12M4 18h9" />,
  mleader: (
    <>
      <path d="M4 20 11 11h9" />
      <path d="M4 20l1.2-3.6L7.6 18z" fill="currentColor" />
      <path d="M13 6h7" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="5" width="17" height="14" />
      <path d="M3.5 9.5h17M3.5 14h17M9.5 9.5V19M15 9.5V19" />
    </>
  ),
  mline: <path d="M3 9h12l4 4M3 14h10l4 4" />,
  wipeout: <path d="M5 5h14v14H5z" fill="var(--paper)" strokeDasharray="2 2" />,
  divide: (
    <>
      <path d="M3 17 21 7" />
      <N x={9} y={13.7} />
      <N x={15} y={10.3} />
    </>
  ),
  measure: (
    <>
      <path d="M3 17h18M3 14v6M9 15v4M15 15v4M21 14v6" />
    </>
  ),
  donut: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  // modificar
  move: (
    <>
      <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5" />
    </>
  ),
  copy: (
    <>
      <rect x="4" y="8" width="11" height="11" />
      <path d="M9 8V5h11v11h-5" />
    </>
  ),
  rotate: (
    <>
      <path d="M19 12a7 7 0 1 1-2-4.9" />
      <path d="M17.5 3v4.5H13" />
      <N x={12} y={12} />
    </>
  ),
  scale: (
    <>
      <rect x="3" y="11" width="10" height="10" />
      <path d="M11 3h10v10M13 11l8-8" />
    </>
  ),
  mirror: (
    <>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <path d="M9 6 4 18h5zM15 6l5 12h-5z" />
    </>
  ),
  offset: <path d="M4 18V8a3 3 0 0 1 3-3h13M8 18v-8a1 1 0 0 1 1-1h11" />,
  trim: (
    <>
      <path d="M3 12h7M14 12h7" />
      <path d="M12 4v16" />
      <path d="M8 9l2 3-2 3" strokeDasharray="1.5 1.5" />
    </>
  ),
  extend: (
    <>
      <path d="M3 12h13" />
      <path d="M20 4v16" />
      <path d="m13 9 3 3-3 3" />
    </>
  ),
  fillet: <path d="M5 20V11a6 6 0 0 1 6-6h9" />,
  chamfer: <path d="M5 20v-9l6-6h9" />,
  stretch: (
    <>
      <path d="M3 8h8v8H3" />
      <path d="M11 8h10v8H11" strokeDasharray="2 2" />
      <path d="m17 10 2 2-2 2" />
    </>
  ),
  array: (
    <>
      <rect x="3" y="3" width="5" height="5" />
      <rect x="10" y="3" width="5" height="5" />
      <rect x="17" y="3" width="4" height="5" />
      <rect x="3" y="10" width="5" height="5" />
      <rect x="10" y="10" width="5" height="5" />
      <rect x="3" y="17" width="5" height="4" />
    </>
  ),
  polararray: (
    <>
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="4.5" r="1.8" />
      <circle cx="19.5" cy="12" r="1.8" />
      <circle cx="12" cy="19.5" r="1.8" />
      <circle cx="4.5" cy="12" r="1.8" />
    </>
  ),
  join: <path d="M3 16h7l4-8h7" />,
  break: <path d="M3 12h6M15 12h6M10 9l4 6" />,
  explode: <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />,
  erase: <path d="M8 20h12M5.5 14.5l7-7 5 5-5.5 5.5h-4z" />,
  lengthen: <path d="M3 12h12M15 9v6M18 12h3" strokeDasharray="0" />,
  align: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16 17 6" strokeDasharray="2 2" />
      <path d="M7 16h10" />
    </>
  ),
  matchprop: (
    <>
      <path d="M4 20 14 10M14 10l3-6 3 3-6 3" />
    </>
  ),
  overkill: (
    <>
      <path d="M3 9h18M3 15h18" />
      <path d="M8 6l8 12" />
    </>
  ),
  pedit: (
    <>
      <path d="M4 18 9 8h7" />
      <path d="M14 20l6-6-2-2-6 6v2z" />
    </>
  ),
  group: (
    <>
      <rect x="3" y="3" width="18" height="18" strokeDasharray="3 2" />
      <rect x="6" y="6" width="5" height="5" />
      <circle cx="15.5" cy="15.5" r="2.5" />
    </>
  ),
  draworder: (
    <>
      <rect x="3" y="9" width="11" height="11" />
      <rect x="9" y="4" width="11" height="11" fill="var(--surface)" />
    </>
  ),
  // anotación
  dimlinear: (
    <>
      <path d="M4 5v14M20 5v14M4 9h16" />
      <path d="M4 9l2.5-1.5v3zM20 9l-2.5-1.5v3z" fill="currentColor" />
    </>
  ),
  dimaligned: (
    <>
      <path d="M4 16 16 4M8 20 20 8" />
      <path d="M6 18l12-12" />
    </>
  ),
  dimangular: (
    <>
      <path d="M4 20h16M4 20 16 6" />
      <path d="M12 20a8 8 0 0 0-2.7-6" />
    </>
  ),
  dimradius: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12l5.5-5.5" />
      <N x={12} y={12} />
    </>
  ),
  dimdiameter: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.3 17.7 17.7 6.3" />
    </>
  ),
  dimarc: (
    <>
      <path d="M5 18a9 9 0 0 1 14 0" />
      <path d="M3 13a12 12 0 0 1 18 0" strokeDasharray="2 2" />
    </>
  ),
  dimordinate: (
    <>
      <path d="M4 4v16h16" />
      <path d="M10 20v-6h6" />
    </>
  ),
  dimbaseline: <path d="M4 4v16M4 16h8M4 12h12M4 8h16M12 14v4M16 10v8M20 6v12" />,
  dimcontinue: <path d="M3 6v12M10 6v12M17 6v12M3 10h14" />,
  leader: <path d="M4 20 12 12h8" />,
  // bloques
  block: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 16 16 8M8 8h8v8" />
      <N x={8} y={16} />
    </>
  ),
  insert: (
    <>
      <rect x="9" y="3" width="12" height="12" rx="2" />
      <path d="M3 21l8-8M3 21h5M3 21v-5" />
    </>
  ),
  bedit: (
    <>
      <rect x="3" y="3" width="13" height="13" rx="2" />
      <path d="M12 21l8-8-3-3-8 8v3z" />
    </>
  ),
  attdef: <path d="M4 7h16M4 12h10M4 17h7M17 14l3 3-3 3" />,
  dynblock: (
    <>
      <rect x="4" y="7" width="12" height="10" rx="1.5" />
      <path d="M19 12h3M16 12h3" />
      <path d="m20 10 2 2-2 2" fill="currentColor" />
      <N x={4} y={17} />
    </>
  ),
  // gestión
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  properties: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  palettes: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <rect x="6" y="7" width="8" height="7" />
      <path d="M15 17h3" />
    </>
  ),
  viewport: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M7 15 10 11l3 3 4-5" />
    </>
  ),
  xref: (
    <>
      <rect x="3" y="7" width="10" height="13" rx="1" />
      <path d="M14 4h7v7M21 4l-8 8" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </>
  ),
  pdf: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4M9 13h6M9 17h4" />
    </>
  ),
  audit: (
    <>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  purge: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  compare: (
    <>
      <rect x="3" y="4" width="8" height="16" rx="1" />
      <rect x="13" y="4" width="8" height="16" rx="1" />
      <path d="M6 9h2M16 9h2M6 13h2M16 13h2" />
    </>
  ),
  export: (
    <>
      <path d="M12 15V3M7 8l5-5 5 5" />
      <path d="M4 14v6h16v-6" />
    </>
  ),
  import: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 14v6h16v-6" />
    </>
  ),
  publish: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="1.5" />
      <path d="M8 14h9v7H8z" />
      <path d="M5 21h2" />
    </>
  ),
  pagesetup: (
    <>
      <path d="M5 3h9l5 5v13H5z" />
      <path d="M14 3v5h5" />
      <path d="M8 12h4M8 16h7" />
      <circle cx="17" cy="16" r="2" />
    </>
  ),
  svg: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M8.5 17c2.5 0 2.5-5 5-5s2.5 3 2.5 3" />
    </>
  ),
  clip: (
    <>
      <path d="M7 3v13a3 3 0 0 0 6 0V6a1.5 1.5 0 0 0-3 0v10" />
      <path d="M3 8h4M17 3v6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2" />
    </>
  ),
  plot: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="1.5" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  zoom: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5M8 10.5h5M10.5 8v5" />
    </>
  ),
  zoomextents: (
    <>
      <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
      <rect x="8" y="8" width="8" height="8" />
    </>
  ),
  pan: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 13.6a1.5 1.5 0 0 1 2.5-1.6L8 15" />,
  undo: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />,
  isolate: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h3M18 12h3M12 3v3M12 18v3" strokeDasharray="1.5 1.5" />
    </>
  ),
  constraint: (
    <>
      <path d="M5 19 19 5" />
      <rect x="9" y="9" width="6" height="6" transform="rotate(45 12 12)" />
    </>
  ),
  gccoincident: (
    <>
      <path d="M4 18 12 12l8 6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  gchorizontal: (
    <>
      <path d="M5 12h14" />
      <rect x="3" y="10" width="4" height="4" />
      <rect x="17" y="10" width="4" height="4" />
    </>
  ),
  gcvertical: (
    <>
      <path d="M12 5v14" />
      <rect x="10" y="3" width="4" height="4" />
      <rect x="10" y="17" width="4" height="4" />
    </>
  ),
  gcparallel: <path d="M4 16 14 6M10 20 20 10" />,
  gcperpendicular: <path d="M5 19h14M12 19V5M12 15h4v4" />,
  gctangent: (
    <>
      <circle cx="12" cy="13" r="5" />
      <path d="M3 8h18" />
    </>
  ),
  gcconcentric: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  gcequal: <path d="M4 8h7M13 16h7M6 5v6M9 5v6M15 13v6M18 13v6" />,
  gcsymmetric: (
    <>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </>
  ),
  gccollinear: <path d="M3 17 9 13M13 10.5 21 5" />,
  gcfix: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M12 11v6M6 20h12M8 17h8" />
    </>
  ),
  autoconstrain: (
    <>
      <rect x="5" y="7" width="14" height="10" />
      <rect x="3.5" y="5.5" width="3" height="3" />
      <rect x="17.5" y="15.5" width="3" height="3" />
      <path d="M19 3v4M17 5h4" />
    </>
  ),
  delconstraint: (
    <>
      <path d="M5 19 19 5" />
      <rect x="9" y="9" width="6" height="6" transform="rotate(45 12 12)" />
      <path d="m15 15 5 5M20 15l-5 5" />
    </>
  ),
  parameters: <path d="M4 7h16M4 12h16M4 17h16M9 5v4M15 10v4M7 15v4" />,
  constraintbar: (
    <>
      <rect x="3" y="9" width="7" height="6" rx="1.5" />
      <rect x="14" y="9" width="7" height="6" rx="1.5" />
      <path d="M10 12h4" />
    </>
  ),
  constraintinfer: (
    <>
      <path d="M4 18 12 12h8" />
      <circle cx="12" cy="12" r="2" />
      <path d="M17 3l-2 4h4l-2 4" />
    </>
  ),
  qdim: <path d="M4 20V9M10 20v-9M16 20V9M20 20V9M4 11h16M4 11l2-1M4 11l2 1M20 11l-2-1M20 11l-2 1" />,
  dimspace: <path d="M4 7h16M4 12h16M4 17h16M4 5v4M20 5v4M4 10v4M20 10v4M4 15v4M20 15v4" />,
  dimbreak: <path d="M4 6v12M20 6v12M4 10h5M15 10h5M12 3v18" />,
  centermark: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5M10 12h4M12 10v4" />
    </>
  ),
  centerline: (
    <>
      <path d="M4 6h16M4 18h16" />
      <path d="M2 12h20" strokeDasharray="4 2 1 2" />
    </>
  ),
  blend: <path d="M2 18h6M16 6h6M8 18c5 0 3-12 8-12" />,
  copytolayer: (
    <>
      <path d="m12 4-9 5 9 5 9-5z" />
      <path d="m3 14 9 5 4-2.2" />
      <path d="M19 14v7M15.5 17.5h7" />
    </>
  ),
  laywalk: (
    <>
      <path d="m10 4-7 4 7 4 7-4z" />
      <path d="m3 12 7 4 7-4" />
      <path d="m16 17 4 3-4 3" />
    </>
  ),
  txt2mtxt: <path d="M3 5h7M6.5 5v8M13 7h8M13 11h8M3 16h18M3 20h12" />,
  textalign: <path d="M5 3v18M8 6h11M8 11h7M8 16h10" />,
  massprop: (
    <>
      <path d="M4 18 7 5l12 3-2 11z" />
      <path d="M11.5 9.5v5M9 12h5" />
    </>
  ),
  copybase: (
    <>
      <rect x="4" y="4" width="11" height="11" rx="1" />
      <path d="M9 19h11V9" />
      <circle cx="4" cy="4" r="1.6" />
    </>
  ),
  pasteorig: (
    <>
      <path d="M9 3h6v3H9zM7 5H5v16h14V5h-2" />
      <path d="M12 10v8M8 14h8" />
    </>
  ),
  pasteblock: (
    <>
      <path d="M9 3h6v3H9zM7 5H5v16h14V5h-2" />
      <rect x="8.5" y="10" width="7" height="7" />
    </>
  ),
  qselect: (
    <>
      <path d="M4 4h6M4 4v6M20 20h-6M20 20v-6" />
      <path d="M9 12h6M12 9v6" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
};

/** Glifos de dominio: master 48u; la geometría 24u se escala 2× y 1.3×2 produce trazo visual 2.6u. */
export function CadIcon({ name, size = 20, title }: { name: string; size?: number; title?: string }) {
  const body = paths[name] ?? paths.line;
  return (
    <svg className="cad-icon" width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <g transform="scale(2)">{body}</g>
    </svg>
  );
}

export const hasCadIcon = (name: string) => name in paths;

/** Ménsula de FModel (Familia Modelo, FS-M01): brazo en morado de modelo (#7657D5 / #A990FF). */
export function BrandMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg className={`brand__mark${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path className="mark__body" fill="var(--ink, #14171a)" d="M8 5h9v38H8z M17 5h24v5.5L17 14z" />
      <path className="mark__arm" fill="var(--fm-accent, #7657d5)" d="M17 21h17v5L17 30z" />
    </svg>
  );
}
