import { Compass, FileCode2, Layers, ShieldCheck } from 'lucide-react';
import { tr } from '../controls';

interface CapabilitiesProps {
  lang: 'es' | 'en';
}

/**
 * 4 pilares fundamentales de diseño y capacidades de FModel 2D CAD.
 */
export function Capabilities({ lang }: CapabilitiesProps) {
  const pillars = [
    {
      icon: Compass,
      title: tr(lang, 'Geometría y Precisión 2D', '2D Geometry & Precision'),
      desc: tr(
        lang,
        'Motor vectorial con snaps a puntos clave, ortogonalidad, rastreo polar y tolerancias métricas.',
        'Vector drafting engine with object snaps, orthogonal modes, polar tracking, and metric tolerances.',
      ),
    },
    {
      icon: Layers,
      title: tr(lang, 'Capas, Bloques y Cotas', 'Layers, Blocks & Dimensions'),
      desc: tr(
        lang,
        'Organización técnica estándar CAD, bloques paramétricos y acotación lineal, alineada y angular.',
        'Standard technical CAD layers, parametric blocks, and associative linear, aligned, and angular dimensions.',
      ),
    },
    {
      icon: FileCode2,
      title: tr(lang, 'Interoperabilidad DXF y PDF', 'DXF & PDF Interoperability'),
      desc: tr(
        lang,
        'Importa dibujos AutoCAD DXF R12–R2018 y exporta planos vectoriales limpios listos para imprimir.',
        'Import AutoCAD DXF R12–R2018 drawings and export clean vector blueprints ready for printing.',
      ),
    },
    {
      icon: ShieldCheck,
      title: tr(lang, '100% Local-First y Privado', '100% Local-First & Private'),
      desc: tr(
        lang,
        'Tus planos se procesan y almacenan en tu propio navegador. Sin registro ni servidores externos.',
        'Your drawings process and store entirely in your browser. No accounts or remote servers required.',
      ),
    },
  ];

  return (
    <section className="fmodel-section fmodel-section--capabilities" aria-labelledby="fmodel-cap-title">
      <header className="fmodel-section__head">
        <div>
          <h2 id="fmodel-cap-title">{tr(lang, 'Capacidades de FModel', 'FModel Capabilities')}</h2>
          <p>
            {tr(
              lang,
              'Dibujo técnico en dos dimensiones con arquitectura modular y precisión verificada.',
              'Two-dimensional technical drafting built on a modular engine with verified precision.',
            )}
          </p>
        </div>
      </header>

      <div className="fmodel-cap-pillars">
        {pillars.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={i} className="fmodel-cap-pillar">
              <div className="fmodel-cap-pillar__icon" aria-hidden="true">
                <Icon size={18} />
              </div>
              <strong className="fmodel-cap-pillar__title">{p.title}</strong>
              <p className="fmodel-cap-pillar__desc">{p.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
