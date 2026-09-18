# Project skill catalog

These skills are project-local and intentionally loaded on demand. The root
`AGENTS.md` remains the authority for product rules and repository workflow.

| Skill | Use | Source | Version pin | License |
|---|---|---|---|---|
| `fmodel-cad-workflows` | CAD 2D commands, precision, canvas interaction, interchange and CAD UX | Project-specific | Repository | Project |
| `frontend-design` | Distinctive visual direction, typography and self-critique for new or substantially redesigned UI | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design/skills/frontend-design) | `ea0a38e1d671`; copied from the verified local official plugin on 2026-09-18 | Apache-2.0; bundled `LICENSE.txt` |
| `vercel-react-best-practices` | React rendering, bundle and browser performance | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | `063bee94c3f4df8453406c830b0a7df0f2860278` audited; installed from `main` on 2026-09-18 | MIT as declared upstream |
| `vercel-composition-patterns` | React 19 component APIs and scalable composition | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) | `063bee94c3f4df8453406c830b0a7df0f2860278` audited; installed from `main` on 2026-09-18 | MIT as declared upstream |
| `web-design-guidelines` | Explicit UI, UX and accessibility review | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | `063bee94c3f4df8453406c830b0a7df0f2860278` audited; installed from `main` on 2026-09-18 | MIT as declared upstream |

Host-provided skills may also be used when available. In particular, Superpowers
6.3.0 and additional Anthropic design skills are installed in the current Claude
and Codex environments. Superpowers is not copied here because both hosts already
load the same current version; `frontend-design` is included for project portability.
A missing optional host skill never blocks use of the project-local set.

## Selection rules

- Load the smallest set that materially changes the work.
- Read only relevant rule/reference files; do not load compiled catalogs wholesale.
- Existing FModel behavior, tests, docs and root instructions override generic
  third-party advice.
- Inspect any newly added third-party skill, scripts, network behavior and license
  before adopting it. Record its source and immutable revision here.
- Do not add a skill merely because its title is adjacent to the project. Exclude
  3D/STEP/BIM generation and remote drawing readers unless the product scope and
  privacy model are explicitly changed.

## Sources evaluated but not vendored

| Source | Decision |
|---|---|
| [OpenAI `frontend-app-builder`](https://github.com/openai/plugins/blob/main/plugins/build-web-apps/skills/frontend-app-builder/SKILL.md) | Keep as a research reference. Its mandatory image-first redesign workflow overlaps `frontend-design` and is not the default for incremental editor work. |
| [BuildSense `cad-reader-skill`](https://github.com/buildsense-ai/cad-reader-skill) | Do not integrate: its public workflow requires a remote BricsCAD reader, which conflicts with FModel's local-first drawing boundary. |
| [`text-to-cad` CAD skill](https://github.com/cedrickchee/text-to-cad/blob/main/.agents/skills/cad/SKILL.md) | Do not integrate: it is STEP-first parametric 3D, while FModel is strictly 2D. |

Revisit these decisions only if the product scope, privacy boundary or requested
workflow changes explicitly.
