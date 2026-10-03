import type { ComponentPrimitive } from '../../geometry/architecture/types';

/** Projection only: primitives already went through the native builder and rigid transform. */
export function ComponentMiniature({ primitives, label }: { primitives: ComponentPrimitive[]; label: string }) {
  const points = primitives.flatMap(p => p.type === 'line' ? [p.start, p.end] : p.type === 'lwpolyline' ? p.vertices : p.type === 'text' ? [p.position, { x: p.position.x + p.text.length * p.height, y: p.position.y + p.height }] : [{ x: p.center.x - p.radius, y: p.center.y - p.radius }, { x: p.center.x + p.radius, y: p.center.y + p.radius }]);
  if (!points.length) return null;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const span = Math.max(maxX - minX, maxY - minY), pad = span * 0.12;
  return <svg className="architecture-miniature" role="img" aria-label={label} viewBox={`${minX - pad} ${-maxY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`}>
    <g transform="scale(1,-1)" fill="none" stroke="currentColor" strokeWidth={1.5}>
      {primitives.map(p => {
        const props = { key: p.key, 'data-role': p.key, vectorEffect: 'non-scaling-stroke' as const };
        if (p.type === 'line') return <line {...props} x1={p.start.x} y1={p.start.y} x2={p.end.x} y2={p.end.y} />;
        if (p.type === 'lwpolyline') return p.closed ? <polygon {...props} points={p.vertices.map(v => `${v.x},${v.y}`).join(' ')} /> : <polyline {...props} points={p.vertices.map(v => `${v.x},${v.y}`).join(' ')} />;
        if (p.type === 'circle') return <circle {...props} cx={p.center.x} cy={p.center.y} r={p.radius} />;
        if (p.type === 'arc') {
          const at = (a: number) => `${p.center.x + p.radius * Math.cos(a)},${p.center.y + p.radius * Math.sin(a)}`;
          return <path {...props} d={`M${at(p.startAngle)} A${p.radius},${p.radius} 0 ${Number(p.endAngle - p.startAngle > Math.PI)} 1 ${at(p.endAngle)}`} />;
        }
        return <text key={p.key} data-role={p.key} transform={`translate(${p.position.x} ${p.position.y}) rotate(${p.rotation * 180 / Math.PI}) scale(1,-1)`} fill="currentColor" stroke="none" fontSize={p.height}>{p.text}</text>;
      })}
    </g>
  </svg>;
}
