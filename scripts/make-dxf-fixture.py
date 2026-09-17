#!/usr/bin/env python3
"""Genera el DXF de referencia escrito por ezdxf (un escritor ajeno) que usa la prueba de
interoperabilidad del importador.

Uso:
  pip install ezdxf && python scripts/make-dxf-fixture.py
"""
import ezdxf
from ezdxf.enums import TextEntityAlignment

doc = ezdxf.new('R2010', setup=True)
doc.header['$INSUNITS'] = 4  # mm
msp = doc.modelspace()
doc.layers.add('MUROS', color=5)
doc.layers.add('COTAS', color=2)

msp.add_line((0, 0), (100, 0), dxfattribs={'layer': 'MUROS'})
msp.add_line((100, 0), (100, 60), dxfattribs={'layer': 'MUROS'})
msp.add_circle((50, 30), 12)
msp.add_arc((20, 20), 8, 0, 90)
msp.add_ellipse((70, 40), major_axis=(10, 0), ratio=0.5)
pl = msp.add_lwpolyline([(0, 0), (20, 0), (20, 20)], format='xy')
pl.dxf.flags = 1
msp.add_lwpolyline([(0, 40, 0.5), (30, 40, 0)], format='xyb')
msp.add_text('Cimentación Ñ', height=3.5, dxfattribs={'layer': 'COTAS'}).set_placement((5, 50), align=TextEntityAlignment.LEFT)
msp.add_mtext('Muro de\\Pcarga 30 cm', dxfattribs={'char_height': 2.5, 'width': 40}).set_location((5, 70))
msp.add_linear_dim(base=(0, -10), p1=(0, 0), p2=(100, 0), dimstyle='EZDXF').render()
msp.add_aligned_dim(distance=6, p1=(0, 0), p2=(100, 60)).render()
blk = doc.blocks.new(name='PUERTA')
blk.add_line((0, 0), (0, 8))
blk.add_arc((0, 0), 8, 0, 90)
msp.add_blockref('PUERTA', (40, 0), dxfattribs={'xscale': 1.5, 'rotation': 30})
hatch = msp.add_hatch(color=3)
hatch.paths.add_polyline_path([(60, 5), (90, 5), (90, 20), (60, 20)], is_closed=True)
msp.add_spline([(0, 80), (20, 95), (40, 75), (60, 90)])
msp.add_point((95, 55))
msp.add_solid([(10, 60), (14, 60), (10, 64), (14, 64)])
doc.saveas('src/io/dxf/fixtures/ezdxf-r2010.dxf')
print('escrito')
