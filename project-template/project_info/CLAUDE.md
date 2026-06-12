# Project Agent Context

This file is the **primary entry point for AI agents** working on this project.
Read this before touching any other file.

## Project Overview

<!-- Fill in: 1–3 sentences on what this research project is about. -->

## Current Phase & Priorities

<!-- Fill in: What stage is the project in? What are the top 3 priorities right now? -->

## Key People

See `project_info/contacts.json` for `@handle` definitions.

## Module Map

| Directory | What lives here | When to edit |
|-----------|----------------|--------------|
| `papers/notes/` | Per-paper reading notes | After reading a paper |
| `document/docs/` | Shared docs, literature reviews | General writing |
| `meetings/mygdocs/` | Meeting notes (frontmatter required — see README) | After each meeting |
| `writing/` | LaTeX paper workspace | When writing the paper |
| `prototype/` | Code experiments | When building prototypes |
| `project_info/TODO.md` | **Current action items** (human-readable) | After every meeting |
| `project_info/GANTT.md` | **Research timeline** | When milestones change |
| `.researchbuddy/todos.json` | Machine-readable TODO board (keep in sync with TODO.md) | After every meeting |
| `.researchbuddy/gantt.json` | Machine-readable Gantt (keep in sync with GANTT.md) | When milestones change |

## Important Rules for Agents

### Every Markdown file MUST start with YAML frontmatter

A file without `---` frontmatter will appear "Untitled" or fail to open in the UI.
If you are generating any `.md` file in this workspace, the very first line must be `---`.

### Meeting files (`meetings/mygdocs/*.md`)
1. **Required fields:** `id`, `date`, `title`, `document_type: meeting`. See `meetings/mygdocs/README.md`.
2. `id:` **must match the filename exactly** (without `.md`).
3. Tabs go in the **body** using `<!-- rb:tab id="..." title="..." -->` markers — NOT in frontmatter.

### Document files (`document/docs/*.md`)
4. **Required fields:** `id`, `title`, `document_type: doc`. See `document/docs/README.md`.
5. `id:` **must match the filename exactly** (without `.md`).
6. Tabs go in the body — same rule as meetings. No `tabs:` in frontmatter.

### Paper notes (`papers/notes/*.md`)
7. **Required fields:** `id`, `title`. See `papers/notes/README.md`.
8. A paper note without `title:` is **silently dropped** from the papers list in the UI.

### Other rules
9. **TODO updates**: Update BOTH `project_info/TODO.md` AND `.researchbuddy/todos.json` together.
10. **Gantt updates**: Update BOTH `project_info/GANTT.md` AND `.researchbuddy/gantt.json` together.
11. **Do not edit** any `*.read_only.*` file — they are system-managed.
12. **Commit message**: Use a descriptive message. The server reads the bare repo HEAD directly; changes are live immediately after push.

## Active TODOs

See `project_info/TODO.md`.

## Timeline

See `project_info/GANTT.md`.
