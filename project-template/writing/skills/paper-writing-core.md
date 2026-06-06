---
id: paper-writing-core
title: Paper Writing Core
description: Core paper writing workflow for ResearchBuddy LaTeX projects
tags: [writing, latex, research]
---

# Paper Writing Core Skill

## CRITICAL RULES — read before doing anything

- `reference.bib` is **TRUSTED and READ-ONLY**. Never add, remove, or edit entries. It is managed by Zotero.
- `ai-generated.bib` is for **AI-suggested references only**. Add entries here freely, never to reference.bib.
- Never modify the `main.tex` document class, packages, or author info unless explicitly asked.
- When modifying docs in `docs/`, always prepend a note: `> [AI note — YYYY-MM-DD]: <what you did>`
- Never commit changes described as "by the author" — be honest that it's AI-generated.

## Two-tier citation system

| File | Who writes | LaTeX command |
|---|---|---|
| `reference.bib` | Zotero sync only | `\cite{key}` |
| `ai-generated.bib` | AI agents | `\aicite{key}` (renders in color) |

`\aicite{}` entries show in **Dandelion color** in the PDF. To disable coloring, comment out the `\newcommand{\aicite}` line in main.tex. To confirm an AI reference, use ResearchBuddy Papers → AI Generated → Confirm.

## Finding papers and notes

1. Papers are in `papers/` as Markdown files with frontmatter including `bibtex:` field.
2. Cross-references in docs use `[[paper_id]]` patterns.
3. The workspace index is at `.researchbuddy/index.json`.
4. To find notes about a paper: `grep -r "[[paper_id]]" docs/`

## Writing workflow

1. Read `papers/` and `docs/` to understand the context.
2. Identify relevant bib keys from `reference.bib`.
3. Write section in `sections/<section>.tex`.
4. For AI-suggested references: add to `ai-generated.bib`, use `\aicite{key}`.
5. Append AI note to any `docs/` file modified.
6. Commit: `git commit -m "AI: <what was done> [YYYY-MM-DD]"`

## What AI can and cannot do

| ✅ CAN | ❌ CANNOT |
|---|---|
| Write/edit .tex sections | Edit reference.bib |
| Add to ai-generated.bib | Confirm AI refs (human only) |
| Add notes to docs/ | Claim AI notes are human-written |
| Read all paper notes | Delete existing human text |
