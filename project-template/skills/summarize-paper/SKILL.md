---
id: summarize-paper
title: Summarize Paper
description: Read a paper and produce a structured summary covering contribution, method, results, and citation-worthy points.
tags: [papers, reading, summary]
sections: [papers]
---

# Summarize Paper

Produce a structured reading note for a paper.

## When to use
- You just imported a new paper and want to understand it quickly
- Preparing for a meeting where this paper is discussed
- Building a literature review and need consistent notes

## Input
Either:
- The paper's `[[paper_id]]` (to read its existing notes in `papers/notes/`)
- Or the actual PDF content if provided

## Output format

Write the summary into `papers/notes/<paper_id>.md`, prepending an AI note header:

```markdown
> [AI summary — YYYY-MM-DD]: Auto-generated.

## TL;DR
One sentence: what this paper does and why it matters.

## Problem
What problem does it address?

## Contribution
- Main contribution 1
- Main contribution 2

## Key Results
- Finding 1

## Limitations
- Limitation 1
```

## Rules
- Preserve the paper's actual claims — do not editorialize
- Mark every output section with the AI note header
