---
id: summarize-paper
title: Summarize Paper
description: Read a paper and produce a structured summary covering contribution, method, results, and citation-worthy points.
tags: [papers, reading, summary]
sections: [papers]
---

# Summarize Paper

Produce a structured reading note for a paper that makes it easy to cite and build on later.

## When to use
- You just imported a new paper and want to understand it quickly
- Preparing for a meeting where this paper is discussed
- Building a literature review and need consistent notes

## Input
Either:
- The paper's `[[paper_id]]` (to read its existing notes in `papers/`)
- Or the actual PDF content if provided

## Output format

Write the summary into the paper's note file (`papers/<paper_id>.md`), prepending an AI note header:

```markdown
> [AI summary — YYYY-MM-DD]: The following summary was auto-generated.

## TL;DR
One sentence: what this paper does and why it matters.

## Problem
What problem does it address? What gap in knowledge?

## Contribution
- Main contribution 1
- Main contribution 2

## Method
Brief description of study design / algorithm / system:
- Participants / dataset (if applicable)
- Key techniques used

## Key Results
- Finding 1 (with effect size or statistic if available)
- Finding 2

## Limitations
- Limitation 1
- Limitation 2

## Citation-worthy sentences
> "Direct quote 1 that is citable" (p. X)
> "Direct quote 2 that is citable" (p. X)

## Related to this project
How does this paper connect to our research? (fill in if context is known)

## BibTeX key
`@[[paper_id]]`
```

## Rules
- Preserve the paper's actual claims — do not editorialize
- Use the paper's terminology, not paraphrased jargon
- Mark every output section with the AI note header
- If you cannot access the full paper, say what you could and could not read
- Keep the summary concise: aim for under 500 words total
