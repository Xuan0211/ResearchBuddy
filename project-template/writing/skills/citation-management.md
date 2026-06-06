---
id: citation-management
title: Citation Management
tags: [citations, bib, zotero]
---

# Citation Management

## Overview

References flow through two bib files with clear ownership:

```
Zotero ──sync──▶ reference.bib   (trusted, human-managed)
AI agents ──▶ ai-generated.bib   (pending confirmation)
                      │
                      ▼ (human confirms in ResearchBuddy UI)
                Zotero Group Library
```

## Adding an AI-suggested reference

1. Find the paper details (title, authors, year, DOI/URL).
2. Write a valid BibTeX entry.
3. Append it to `ai-generated.bib`.
4. In the .tex file, use `\aicite{key}` — this renders in Dandelion color.
5. Add a note in the relevant doc: `> [AI note]: Added citation candidate: @key`

Example entry:
```bibtex
@inproceedings{smith2024example,
  title     = {An Example Paper Title},
  author    = {Smith, John and Doe, Jane},
  booktitle = {Proceedings of the ACM Conference on Human Factors},
  year      = {2024},
  doi       = {10.1145/xxxxxxx.xxxxxxx},
}
```

## Checking citation consistency

```bash
# List all citations in .tex files
grep -oh 'cite{[^}]*}' sections/*.tex | sort | uniq

# Check keys in ai-generated.bib
grep '^@' ai-generated.bib

# Check keys in reference.bib
grep '^@' reference.bib
```

## Confirming an AI reference (human action only)

Go to ResearchBuddy Papers → "AI Generated" section → click **Confirm** on the entry.

This:
1. Moves the BibTeX entry from `ai-generated.bib` → `reference.bib`
2. Marks the reference as confirmed in the local repo

After confirmation, change `\aicite{key}` to `\cite{key}` in the .tex file.
