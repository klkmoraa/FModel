"""Plano 2D editable del patio de ejemplo de FModel.

Basado en ejemplos/patio-4.85x4.35.py.
Ejecutar desde la raiz del repo: python ejemplos/plano-patio-fmodel.py
Dependencia: pip install ezdxf
El DXF usa centimetros y no inventa accesos ni acabados.
"""
from pathlib import Path
import ezdxf
from ezdxf.enums import TextEntityAlignment

ANCHO_CM = 485
FONDO_CM = 435
BARDA_CM = 15
SALIDA = Path(__file__).with_name('plano_patio_fmodel.dxf')


def generar_plano(salida=SALIDA):
    w, h, t = ANCHO_CM, FONDO_CM, BARDA_CM
    doc = ezdxf.new('R2010', setup=True)
    doc.header['$INSUNITS'] = 5  # centimetros
    doc.header['$MEASUREMENT'] = 1
    doc.header['$LUNITS'] = 2
    doc.header['$LUPREC'] = 2
    for nombre, color, grosor in (
        ('BARDA', 7, 50),
        ('LIMITE_ABIERTO', 8, 18),
        ('COTAS', 2, 18),
        ('ROTULOS', 7, 25),
        ('HACHURAS', 8, 13),
    ):
        doc.layers.add(nombre, color=color, lineweight=grosor)
    msp = doc.modelspace()

    # Bardas originales en L, lados inferior e izquierdo abiertos.
    contorno_barda = [(0, h), (w, h), (w, 0),
                      (w+t, 0), (w+t, h+t), (0, h+t)]
    hatch = msp.add_hatch(dxfattribs={'layer': 'HACHURAS'})
    hatch.set_pattern_fill('ANSI31', color=8, scale=6)
    hatch.paths.add_polyline_path(contorno_barda, is_closed=True)
    msp.add_lwpolyline(contorno_barda, close=True,
                       dxfattribs={'layer': 'BARDA'})
    for p, q in [((0, 0), (0, h)), ((0, 0), (w, 0))]:
        msp.add_line(p, q, dxfattribs={
            'layer': 'LIMITE_ABIERTO', 'linetype': 'DASHED'})

    def linea(p, q, capa='COTAS'):
        msp.add_line(p, q, dxfattribs={'layer': capa})

    def texto(valor, punto, alto=10, giro=0, capa='ROTULOS'):
        return msp.add_text(
            valor, dxfattribs={'layer': capa, 'height': alto, 'rotation': giro}
        ).set_placement(punto, align=TextEntityAlignment.MIDDLE_CENTER)

    # Cotas externas en centimetros, rotuladas en metros.
    for x in (0, w):
        linea((x, -7), (x, -67))
        linea((x-4, -59), (x+4, -51))
    linea((0, -55), (w, -55))
    texto('4.85 m', (w/2, -42), 11, capa='COTAS')

    for y in (0, h):
        linea((-7, y), (-67, y))
        linea((-59, y-4), (-51, y+4))
    linea((-55, 0), (-55, h))
    texto('4.35 m', (-72, h/2), 11, 90, capa='COTAS')

    linea((w+9, h+5), (w+36, h+29), 'COTAS')
    texto('BARDA 15 cm', (w+24, h+37), 8, capa='COTAS')
    texto('PATIO', (w/2, h/2+18), 22)
    texto('AREA LIBRE', (w/2, h/2-8), 11)
    texto('4.85 x 4.35 m', (w/2, h/2-28), 10)
    texto('BARDA DE COLINDANCIA', (w/2, h+t+17), 9)
    texto('BARDA DE COLINDANCIA', (w+t+24, h/2), 9, 90)
    doc.saveas(salida)
    return salida


if __name__ == '__main__':
    print(f'Plano DXF generado: {generar_plano()}')
