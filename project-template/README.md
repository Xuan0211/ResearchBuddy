# ResearchBuddy Project

This repository is the shared source of truth for the project. Humans, agents,
ResearchBuddy, Zotero, Drive sync, and cloud workers should all coordinate
through these files.

## Agent Contract

- Edit normal content in `papers/`, `docs/`, `meetings/`, `prototypes/`,
  `writing/`, `assets/`, `team/`, `skills/`, and `section-resources/`.
- Treat `.researchbuddy/` as system-owned. It stores manifests, indexes, sync
  maps, locks, and adapter state.
- Use Markdown with YAML frontmatter for notes and records.
- Use `[[paper_id]]` for paper/document references.
- Put LaTeX projects under `writing/`.
- Put runnable prototypes and experiments under `prototypes/`.
- Put shared contacts in `team/contacts.json`.
- Put reusable team/agent playbooks or Codex skills under `skills/`.
- Put section-specific docs and skill attachment manifests under
  `section-resources/<section>/`.
