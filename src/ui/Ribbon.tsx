import { useState } from 'react';
import { findCommand } from '../commands/registry';
import type { Editor } from '../editor/editor';
import { useEditorEvents } from './hooks';
import { CadIcon } from './icons';
import { RIBBON } from './ribbonConfig';

export function Ribbon({ editor, onUi }: { editor: Editor; onUi: (ui: string, cmd: string) => void }) {
  useEditorEvents(editor, ['command', 'prefs']);
  const [tab, setTab] = useState('home');
  const [collapsed, setCollapsed] = useState(false);
  const lang = editor.lang;
  const current = RIBBON.find((r) => r.id === tab) ?? RIBBON[0];
  const activeName = editor.runner.active?.def.name;
  const run = (cmd: string, args?: string[]) => {
    const def = findCommand(cmd);
    if (def?.ui) onUi(def.ui, def.name);
    editor.command(cmd, args);
  };
  return (
    <nav className={`ribbon${collapsed ? ' ribbon--collapsed' : ''}`} aria-label={lang === 'es' ? 'Cinta de herramientas' : 'Tool ribbon'}>
      <div className="ribbon__tabs" role="tablist">
        {RIBBON.map((r) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={r.id === tab}
            className={`ribbon__tab${r.id === tab ? ' is-active' : ''}`}
            onClick={() => {
              if (r.id === tab) setCollapsed((c) => !c);
              else {
                setTab(r.id);
                setCollapsed(false);
              }
            }}
          >
            {r.label[lang]}
          </button>
        ))}
      </div>
      <div className="ribbon__body" role="tabpanel">
        {current.groups.map((g) => {
          const large = g.tools.filter((x) => x.size === 'lg');
          const small = g.tools.filter((x) => x.size !== 'lg');
          return (
            <div className="ribbon-group" key={g.label.en}>
              <div className="ribbon-group__items">
                {large.map((tool) => {
                  const def = findCommand(tool.cmd);
                  return (
                    <button key={tool.cmd + (tool.args?.join() ?? '')} className={`tool-lg${activeName === def?.name ? ' is-active' : ''}`} onClick={() => run(tool.cmd, tool.args)} title={`${def?.description[lang] ?? ''} (${tool.cmd})`}>
                      <CadIcon name={tool.icon} size={22} />
                      <span>{tool.label[lang]}</span>
                    </button>
                  );
                })}
                {small.length > 0 && (
                  <div className="ribbon-group__grid">
                    {small.map((tool) => {
                      const def = findCommand(tool.cmd);
                      return (
                        <button key={tool.cmd + (tool.args?.join() ?? '')} className={`tool-sm${activeName === def?.name ? ' is-active' : ''}`} onClick={() => run(tool.cmd, tool.args)} title={`${def?.description[lang] ?? ''} (${tool.cmd})`}>
                          <CadIcon name={tool.icon} size={16} />
                          <span>{tool.label[lang]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="ribbon-group__label">{g.label[lang]}</div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
