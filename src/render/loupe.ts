import type { Vec2 } from '../geometry/vec';
import type { RenderTheme } from './theme';

export const LOUPE_RADIUS = 52;
export const LOUPE_ZOOM = 2.4;
const OFFSET = 86;

/** Sitio de la lupa: sobre el dedo, o debajo si no cabe arriba; siempre dentro del lienzo. */
export function loupeCenter(p: Vec2, width: number, height: number): Vec2 {
  const r = LOUPE_RADIUS + 6;
  const above = p.y - OFFSET;
  const y = above - r >= 0 ? above : Math.min(height - r, p.y + OFFSET);
  return { x: Math.max(r, Math.min(width - r, p.x)), y: Math.max(r, y) };
}

/**
 * Lupa táctil: amplía la zona bajo el dedo (escena y superposición ya dibujadas) y la
 * muestra desplazada, con una cruz en el punto exacto que se va a designar.
 * Coordenadas en píxeles CSS; el contexto debe venir escalado por dpr.
 */
export function drawTouchLoupe(g: CanvasRenderingContext2D, scene: CanvasImageSource, p: Vec2, width: number, height: number, theme: RenderTheme, dpr: number) {
  const c = loupeCenter(p, width, height);
  const src = LOUPE_RADIUS / LOUPE_ZOOM;
  g.save();
  g.beginPath();
  g.arc(c.x, c.y, LOUPE_RADIUS, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = theme.background;
  g.fill();
  g.imageSmoothingEnabled = false;
  // la escena y la superposición se copian de sus propios lienzos (en píxeles de dispositivo)
  g.drawImage(scene, (p.x - src) * dpr, (p.y - src) * dpr, src * 2 * dpr, src * 2 * dpr, c.x - LOUPE_RADIUS, c.y - LOUPE_RADIUS, LOUPE_RADIUS * 2, LOUPE_RADIUS * 2);
  g.drawImage(g.canvas, (p.x - src) * dpr, (p.y - src) * dpr, src * 2 * dpr, src * 2 * dpr, c.x - LOUPE_RADIUS, c.y - LOUPE_RADIUS, LOUPE_RADIUS * 2, LOUPE_RADIUS * 2);
  g.imageSmoothingEnabled = true;
  g.restore();
  g.save();
  g.strokeStyle = theme.accent;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(c.x, c.y, LOUPE_RADIUS, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = theme.cursor;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(c.x - 11, c.y);
  g.lineTo(c.x + 11, c.y);
  g.moveTo(c.x, c.y - 11);
  g.lineTo(c.x, c.y + 11);
  g.stroke();
  g.restore();
}
