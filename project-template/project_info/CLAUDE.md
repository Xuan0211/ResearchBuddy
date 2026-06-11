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

1. **Meeting files**: Always include YAML frontmatter. See `meetings/mygdocs/README.md` for the exact format. Mistakes here break the frontend.
2. **TODO updates**: Update BOTH `project_info/TODO.md` (Markdown) AND `.researchbuddy/todos.json` (JSON) together.
3. **Gantt updates**: Update BOTH `project_info/GANTT.md` AND `.researchbuddy/gantt.json` together.
4. **Do not edit** any `*.read_only.*` file — they are system-managed.
5. **Commit message**: Use a descriptive message. The server reads the bare repo HEAD directly; changes are live immediately after push.

## Active TODOs

See `project_info/TODO.md`.

## Timeline

See `project_info/GANTT.md`.
