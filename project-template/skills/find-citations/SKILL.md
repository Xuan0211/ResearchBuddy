---
id: find-citations
title: Find Citations for a Claim
description: Given a sentence or claim in a paper draft, find appropriate academic citations to support it.
tags: [citations, writing, references]
sections: [papers, writing]
---

# Find Citations for a Claim

Given a claim or sentence from a draft, find the best supporting papers already in this project or suggest new ones.

## When to use
- You are writing a section and need to cite a specific statement
- You want to verify that a claim is well-supported in the literature
- You are reviewing a draft and see an unsupported assertion

## Workflow

### Step 1 — Read the claim carefully
Identify:
- The **core assertion** (what is being claimed?)
- The **type of evidence** needed (empirical study, user study, theoretical, survey?)
- **Domain** (HCI, ML, systems, social science, etc.)

### Step 2 — Search project papers first
1. Read all papers in `papers/notes/` that have relevant tags
2. Check paper notes for mentions of the claim
3. For **Markdown (MD) documents**, use the existing `[[paper_id]]` cross-reference format in `document/docs/`.

### Step 3 — Search externally if needed
If no project paper supports the claim:
1. Search ArXiv / Google Scholar for the claim + keywords
2. Add promising papers to the project (via ArXiv import)
3. Add AI-recommended papers to `bibs/ai_generated.bib`. For **LaTeX (TeX) documents**:
   - Use `\aicite{key}` for citations of AI-suggested papers
   - Use standard `\cite{key}` for regular manually collected literature

### Step 4 — Output format

For each citation candidate:

Claim: "..."

Supporting papers:
1. **[Paper title]** (@bibtex_key)
   - How it supports the claim: ...
   - Strength of evidence: strong / moderate / weak
   - In project: yes / no (ArXiv: ...)

# Follow the rules below for final citation syntax
Recommended citation (Markdown): [[paper_id1]], [[paper_id2]]
Recommended citation (LaTeX): \cite{key1, key2} / \aicite{key1, key2}


## Rules
- Only cite papers you have actually read or have in the project
- Follow format-specific citation rules strictly:
  1. **Markdown (MD)**: Uniformly use `[[paper_id]]` for all in-project citations
  2. **LaTeX (TeX)**: Use `\cite{key}` for standard references; use `\aicite{key}` for AI-suggested citations (do not use `\cite{}` for AI-generated citations)
- If you cannot find a good citation, say so explicitly — do not fabricate
- One strong citation is better than three weak ones

