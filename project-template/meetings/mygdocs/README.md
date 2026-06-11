# meetings/mygdocs/

One Markdown file per meeting.  
**Filename = `{mtg_id}.md`** where `mtg_id` follows `YYMMDD-{slug}`
(e.g. `260609-weekly-sync.md`).

---

## Required File Format

Every meeting file **must** start with YAML frontmatter.
Without it the frontend cannot resolve `m.id` and will show "Meeting not found."

### Frontmatter

```yaml
---
id: "260609-weekly-sync"    # MUST match the filename (without .md)
date: "2026-06-09"          # YYYY-MM-DD
title: "Weekly Sync"
start_time: "10:00"         # optional, HH:MM
end_time:   "11:00"         # optional, HH:MM
location: ""
attendees:                  # @handles from project_info/contacts.json
  - handle1
document_type: meeting
links:
  google_drive: ""
  outlook: ""
  outlook_calendar: ""
  transcript: ""
---
```

### Body — tabbed content

Tabs are **HTML comment markers in the body**, never YAML:

```
<!-- rb:tab id="pre-meeting" title="Pre-meeting" -->

## Agenda
...

<!-- rb:tab id="transcript-notes" title="Transcript / Notes" -->

## Notes
...

<!-- rb:tab id="post-meeting" title="Post-meeting" -->

## Conclusions
...

## TODO
- [ ] Action item @handle
```

> ⚠️ **Common mistake:** Do NOT write `tabs:` inside the YAML frontmatter.
> The backend ignores frontmatter tabs entirely — only `<!-- rb:tab -->` markers work.

---

## Rules

| Rule | Detail |
|------|--------|
| `id` must match filename | `id: "260609-sync"` → file must be `260609-sync.md` |
| ID format | `YYMMDD-{slug}`, not UUID |
| Tabs go in the body | Use `<!-- rb:tab id="..." title="..." -->` markers |
| Don't edit `manifest.read_only.json` | System-managed |
| `@handle` mentions | Must match a handle in `project_info/contacts.json` |

---

## After Creating a Meeting File

1. Update `.researchbuddy/todos.json` with action items (see `skills/meeting-transcript/SKILL.md` for the JSON schema).
2. Update `project_info/TODO.md` with the same action items in Markdown.
3. Commit both files together with the meeting note.
