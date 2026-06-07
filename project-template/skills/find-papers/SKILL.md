---
id: find-papers
title: Find Relevant Papers
description: Search for academic papers on a topic, filtered by venue, year, and relevance to the project.
tags: [research, literature, search]
sections: [papers]
---

# Find Relevant Papers

Use this skill to systematically search for academic papers on a given topic.

## When to use
- Starting a new research direction and need to survey the literature
- Looking for related work before writing an introduction
- Checking if a specific idea has been explored before

## Workflow

### Step 1 — Clarify the search scope
Ask the user (or infer from context):
- **Topic / keywords**: what is the paper about?
- **Time range**: e.g., last 5 years, or all time
- **Venues**: CHI, UIST, CSCW, NeurIPS, etc. (check project area)
- **Max papers to find**: suggest 10–20 for a focused survey

### Step 2 — Search strategies (pick one or combine)
1. **ArXiv search** — use `arxiv.org/search/` with keyword + date range
2. **Google Scholar** — keyword + `site:dl.acm.org` or `site:arxiv.org`
3. **Semantic Scholar** — good for citation graph traversal
4. **ACM DL** — for HCI, CSCW, CHI papers specifically
5. **Snowballing** — start from 2–3 known papers, follow their references

### Step 3 — Add papers to this project
For each paper found:
1. Get the ArXiv ID if available (e.g., `2401.12345`)
2. Add via ResearchBuddy: Papers → import by ArXiv ID
3. Or add to `ai-generated.bib` in a writing project and confirm later

### Step 4 — Write a brief search summary
Create a doc in `docs/` summarising:
- Query used
- Number of results
- 3–5 most relevant with one-line explanation
- Gaps or follow-up searches needed

## Output format (for each paper found)

```
**[Title]** (Year)
Authors: ...
Venue: ...
Why relevant: ...
ArXiv: ... / DOI: ...
```

## Notes
- Do NOT invent papers. If unsure, say "I could not find a direct match."
- Prefer peer-reviewed sources over preprints when both are available.
- If you find a highly relevant paper not in this project, flag it clearly.
