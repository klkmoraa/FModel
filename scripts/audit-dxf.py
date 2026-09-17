#!/usr/bin/env python3
"""Audita un DXF exportado por FModel con ezdxf (lectura estricta, recuperación y audit).

Uso:
  FMODEL_DXF_OUT=/tmp/fmodel.dxf pnpm vitest run src/io/dxf   # genera el archivo de prueba
  pip install ezdxf && python scripts/audit-dxf.py /tmp/fmodel.dxf

Sale con código 1 si hay errores o correcciones.
"""
import sys
from collections import Counter

import ezdxf
from ezdxf import recover

path = sys.argv[1]
doc = ezdxf.readfile(path)
print(f"lectura estricta: {doc.dxfversion}")
doc, auditor = recover.readfile(path)
audit = doc.audit()
problems = len(auditor.errors) + len(auditor.fixes) + len(audit.errors) + len(audit.fixes)
for item in [*auditor.errors, *auditor.fixes, *audit.errors, *audit.fixes]:
    print(f"  {item.code}: {item.message}")
print("modelo:", dict(Counter(e.dxftype() for e in doc.modelspace())))
for layout in doc.layouts:
    if layout.name != "Model":
        print(f"presentación {layout.name}:", dict(Counter(e.dxftype() for e in layout)))
print("sin errores ni correcciones" if problems == 0 else f"{problems} problema(s)")
sys.exit(1 if problems else 0)
