# document/docs/

One Markdown file per document. Filename = the `id` value (e.g. `my-doc.md`).

## Required file format

Every document **must** start with YAML frontmatter. Without it the UI shows no title and may not open correctly.

```markdown
---
id: my-doc                    # MUST match the filename without .md
title: "Document Title"
document_type: doc
folder: "Background"          # optional, for grouping in the UI
tags: []
papers: []
mentions: []
---

<!-- rb:tab id="main" title="Main" -->

# Document content here

<!-- rb:tab id="methods" title="Methods" -->

# Methods section
```

## Rules

| Rule | Detail |
|------|--------|
| `id` must match filename | `id: my-doc` → file must be `my-doc.md` |
| Tabs go in **body** | Use `<!-- rb:tab id="..." title="..." -->` markers — NOT in frontmatter |
| `document_type: doc` | Always include this field |
| `[[paper_id]]` links | Cite papers — renders as a hoverable card in the UI, citation key from papers/bib|
| `@handle` mentions | Must match a handle in `project_info/contacts.json` |

> ⚠️ **Common Agent mistake:** Do NOT put `tabs:` inside the YAML frontmatter.
> The backend ignores frontmatter tabs — only `<!-- rb:tab -->` markers in the body work.
