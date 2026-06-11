# ResearchBuddy Project

This repository is the shared source of truth for the project. Humans, agents,
ResearchBuddy, Zotero, Drive sync, and cloud workers should all coordinate
through these files.

## Agent Contract

- **Start here:** Read `project_info/CLAUDE.md` for project context, current
  priorities, TODOs, and timeline before doing any work.
- Edit normal content in `papers/`, `document/`, `meetings/`, `prototype/`,
  `writing/`, `images/`, `coding/`, `skills/`, and `project_info/`.
- `.researchbuddy/` is **mostly system-owned** — do not edit `*.read_only.*`
  files. The two exceptions agents may update directly:
  - `.researchbuddy/todos.json` — TODO board data (keep in sync with `project_info/TODO.md`)
  - `.researchbuddy/gantt.json` — Gantt data (keep in sync with `project_info/GANTT.md`)
- Use Markdown with YAML frontmatter for notes and records.
- **Meeting files require frontmatter** — see `meetings/mygdocs/README.md` for
  the exact format. A missing or wrong `id:` field breaks the frontend.
- Use `[[paper_id]]` for paper/document cross-references.
- Put LaTeX projects under `writing/`.
- Put runnable prototypes and experiments under `prototype/`.
- Put shared contacts in `project_info/contacts.json`.
- Put reusable agent playbooks or skills under top-level `skills/`.
