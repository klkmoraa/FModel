"""Genera miniaturas SVG para la colección CC0. Requiere ezdxf (solo desarrollo)."""

import base64
import io
import json
import sys
import zipfile

import ezdxf
from ezdxf.addons.drawing import Frontend, RenderContext, layout
from ezdxf.addons.drawing.config import BackgroundPolicy, ColorPolicy, Configuration
from ezdxf.addons.drawing.svg import SVGBackend


def main(source: str, output: str) -> None:
    thumbs: dict[str, str] = {}
    config = Configuration(
        color_policy=ColorPolicy.CUSTOM,
        custom_fg_color="#8f94a1",
        background_policy=BackgroundPolicy.OFF,
    )
    with zipfile.ZipFile(source) as archive:
        paths = sorted(p for p in archive.namelist() if p.endswith(".dxf"))
        if len(paths) != 398:
            raise ValueError(f"Se esperaban 398 DXF; se encontraron {len(paths)}")
        for path in paths:
            drawing = ezdxf.read(io.StringIO(archive.read(path).decode("utf-8")))
            backend = SVGBackend()
            Frontend(RenderContext(drawing), backend, config=config).draw_layout(drawing.modelspace())
            svg = backend.get_string(
                layout.Page(64, 64),
                settings=layout.Settings(output_layers=False, fixed_stroke_width=0.5),
                xml_declaration=False,
            )
            thumbs[path] = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode("ascii")
    with open(output, "w", encoding="utf-8") as stream:
        json.dump(thumbs, stream)
    print(f"Generadas {len(thumbs)} miniaturas.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: python scripts/build-cc0-thumbnails.py fuente.zip miniaturas.json")
    main(sys.argv[1], sys.argv[2])
