import ezdxf
from ezdxf.enums import TextEntityAlignment
W, L, T = 485, 435, 15   # ancho, largo (interior libre) y espesor de barda, en centímetros
doc = ezdxf.new('R2010', setup=True)
doc.header['$INSUNITS'] = 5  # centímetros
doc.layers.add('BARDA', color=7)
doc.layers.add('PATIO', color=3)
doc.layers.add('COTAS', color=2)
doc.layers.add('TEXTO', color=7)
msp = doc.modelspace()
# Bardas de colindancia: lado superior (4.85 m) y lado derecho (4.35 m); izquierdo e inferior quedan abiertos
barda = [(0, L), (W, L), (W, 0), (W + T, 0), (W + T, L + T), (0, L + T)]
msp.add_lwpolyline(barda, close=True, dxfattribs={'layer': 'BARDA'})
h = msp.add_hatch(color=8, dxfattribs={'layer': 'BARDA'})
h.set_pattern_fill('ANSI31', scale=5)
h.paths.add_polyline_path(barda, is_closed=True)
msp.add_lwpolyline([(0, 0), (W, 0), (W, L), (0, L)], close=True, dxfattribs={'layer': 'PATIO', 'linetype': 'DASHED'})
def txt(s, pos, h, rot=0):
    msp.add_text(s, height=h, dxfattribs={'layer': 'TEXTO', 'rotation': rot}).set_placement(pos, align=TextEntityAlignment.MIDDLE_CENTER)
txt('PATIO', (W/2, L/2 + 15), 25)
txt('4.85 x 4.35 m', (W/2, L/2 - 20), 15)
txt('BARDA DE COLINDANCIA', (W/2, L + T + 14), 10)
txt('BARDA DE COLINDANCIA', (W + T + 14, L/2), 10, 90)
def cota(a, b, off, label, vertical=False):
    dx = -off if vertical else 0
    dy = 0 if vertical else -off
    A = (a[0] + dx, a[1] + dy); B = (b[0] + dx, b[1] + dy)
    at = {'layer': 'COTAS'}
    msp.add_line(A, B, dxfattribs=at)
    msp.add_line((a[0] + (dx * 0.1 if vertical else 0), a[1] + (0 if vertical else dy * 0.1)), (A[0] - (5 if vertical else 0), A[1] - (0 if vertical else 5)), dxfattribs=at)
    msp.add_line((b[0] + (dx * 0.1 if vertical else 0), b[1] + (0 if vertical else dy * 0.1)), (B[0] - (5 if vertical else 0), B[1] - (0 if vertical else 5)), dxfattribs=at)
    for P in (A, B):
        msp.add_line((P[0] - 5, P[1] - 5), (P[0] + 5, P[1] + 5), dxfattribs=at)
    m = ((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)
    msp.add_text(label, height=12, dxfattribs={'layer': 'COTAS', 'rotation': 90 if vertical else 0}).set_placement((m[0] - (10 if vertical else 0), m[1] + (0 if vertical else 10)), align=TextEntityAlignment.MIDDLE_CENTER)
cota((0, 0), (W, 0), 40, '485')
cota((0, 0), (0, L), 40, '435', vertical=True)
doc.saveas('ejemplos/patio-4.85x4.35.dxf')
