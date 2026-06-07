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
1. Read all papers in `papers/` that have relevant tags
2. Check paper notes for mentions of the claim
3. Use `[[paper_id]]` references already present in `docs/`

**Pattern for finding relevant notes:**
```
Read papers/ where tags contain [topic keywords]
Look for: methodology, findings, conclusions relevant to the claim
```

### Step 3 — Search externally if needed
If no project paper supports the claim:
1. Search ArXiv / Google Scholar for the claim + keywords
2. Add promising papers to the project (via ArXiv import)
3. For AI-suggested papers, add to `ai-generated.bib` using `\aicite{key}`

### Step 4 — Output format

For each citation candidate:
```
Claim: "..."

Supporting papers:
1. **[Paper title]** (@bibtex_key)
   - How it supports the claim: ...
   - Strength of evidence: strong / moderate / weak
   - In project: yes / no (ArXiv: ...)

Recommended citation: \cite{key1, key2}
```

## Rules
- Only cite papers you have actually read or have in the project
- Mark AI-suggested citations with `\aicite{}` — never `\cite{}`
- If you cannot find a good citation, say so explicitly — do not fabricate
- One strong citation is better than three weak ones
