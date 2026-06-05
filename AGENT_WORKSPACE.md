# Agent Workspace Design

ResearchBuddy projects are git workspaces first. The app, agents, cloud workers,
Zotero, and Drive sync all coordinate through the same repository.

## Source of Truth

The project repository is authoritative. ResearchBuddy should avoid hidden DB-only
content for papers, docs, meetings, writing, prototypes, or shared skills. The DB
can store credentials, membership, and service state, but project knowledge should
remain readable from the repo.

## Directory Contract

```text
papers/          Paper metadata, notes, bib fields, preview links
docs/            Shared notes, literature reviews, planning docs
meetings/        Meeting notes and agendas
prototypes/      Prototype apps, experiments, notebooks, scripts
writing/         Paper-writing workspace, including LaTeX projects
assets/          Images, PDFs, datasets, and media
team/            Shared contacts and @ handles
skills/          Team/agent playbooks and reusable local skills
.researchbuddy/  System-owned manifests, indexes, sync maps, locks
```

Agents and teammates can edit every top-level content directory. ResearchBuddy
owns `.researchbuddy/` and may regenerate files there.

## File Format

Markdown with YAML frontmatter is the default interchange format:

```markdown
---
id: smith2024
title: Example Paper
tags:
  - hci
links:
  arxiv: https://arxiv.org/abs/0000.00000
---

Notes can cite [[other-paper-id]].
```

Extensions can add their own schema under the relevant folder, but should keep a
plain README and avoid requiring ResearchBuddy-specific APIs for basic reading.

## Extension Points

- Paper writing: `writing/<paper-name>/`, including LaTeX, figures, tables, and
  submission notes.
- Prototype development: `prototypes/<prototype-name>/`, with each prototype
  carrying its own README and run instructions.
- Team contacts: `team/contacts.json`, merged with app project members.
- Team ideas and skills: `skills/<skill-name>/`, for reusable prompts,
  workflows, coding conventions, or Codex-compatible skills.
- Sync adapters: `.researchbuddy/*-map.json`, one adapter per integration.

## Sync Model

ResearchBuddy indexes workspace files into `.researchbuddy/index.json`. External
adapters should merge, not overwrite:

- Zotero can update paper metadata and tags, while preserving local notes.
- Drive can mirror docs, meetings, and writing outputs.
- Outlook/Calendar imports are generated from meeting Markdown metadata.
- Cloud workers can pull/push the repo and run `ensure` or `reindex`.
- Team collaboration should happen through git commits and merges.
