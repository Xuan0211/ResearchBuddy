---
id: meeting-transcript
title: Meeting Transcript Analysis
description: Turn a raw meeting transcript into a structured ResearchBuddy meeting note with correct frontmatter, tabs, and TODO items.
tags:
  - built-in
  - meetings
sections:
  - meetings
---

# Meeting Transcript Analysis

Turn a raw meeting transcript into a structured meeting note that the
ResearchBuddy frontend can display correctly.

> **How to invoke**: Open a meeting, then ask the agent to run this skill.
> Provide the transcript text (or a path like `meetings/resources/YYYYMMDD-....txt`)
> and the target meeting ID.

---

## Critical: File Format

Meeting files live in `meetings/mygdocs/{mtg_id}.md`.  
**Every file MUST have YAML frontmatter.** Without it the frontend cannot
resolve the meeting `id` and will show "Meeting not found."

### Step 1 — Choose a meeting ID

Use the date as the ID:

```
mtg_id = YYYYMMDD          e.g.  20260609
```

The **filename must be `{mtg_id}.md`** and the **`id:` field in frontmatter must
match exactly**.

### Step 2 — Write the frontmatter

```yaml
---
id: "20260609"             # MUST match filename without .md
date: "2026-06-09"         # YYYY-MM-DD
title: "Meeting Title"
start_time: "10:00"        # HH:MM, optional
end_time:   "11:30"        # HH:MM, optional
location: ""
attendees:                 # @handles from project_info/contacts.json
  - yuan.xu
document_type: meeting
links:
  google_drive: ""
  outlook: ""
  outlook_calendar: ""
  transcript: ""           # relative path to raw transcript if any
---
```

### Step 3 — Write the body in tabs

Tabs are **HTML comment markers in the body** — NOT YAML fields:

```
<!-- rb:tab id="pre-meeting" title="Pre-meeting" -->

## Agenda

1. Topic 1
2. Topic 2

<!-- rb:tab id="transcript-notes" title="Transcript / Notes" -->

## Notes

Key discussion points...

<!-- rb:tab id="post-meeting" title="Post-meeting" -->

## Conclusions

- Decision 1

## TODO

- [ ] Task description @handle
```

> ⚠️ Do NOT put `tabs:` in the YAML frontmatter — it is silently ignored.

### Step 4 — Update todo files

After writing the meeting note, update both:
1. `project_info/TODO.md` — markdown checklist of new action items
2. `.researchbuddy/todos.json` — machine-readable board (see format below)

---

## todos.json Format

`.researchbuddy/todos.json` is read by the frontend TODO board.
Add a list entry under `"lists"`:

```json
{
  "schema": "researchbuddy.todos",
  "version": "2.0",
  "lists": [
    {
      "id": "unique10hex",
      "title": "Meeting YYYYMMDD Action Items",
      "week_start": "YYYY-MM-DD",
      "meeting_id": "20260609",
      "doc_ids": [],
      "due_at": "",
      "order": 0,
      "created_at": "2026-06-09T00:00:00.000000+00:00",
      "items": [
        {
          "id": "unique10hex",
          "text": "Task description @handle",
          "completed": false,
          "mentions": ["handle"],
          "doc_ids": [],
          "due_at": "YYYY-MM-DD",
          "order": 0,
          "created_at": "2026-06-09T00:00:00.000000+00:00"
        }
      ]
    }
  ]
}
```

Rules for `todos.json`:
- `week_start` must be the **Monday** of the current week (ISO date).
- `id` fields: 10-character hex strings (`uuid.uuid4().hex[:10]`).
- `meeting_id` links the list back to the meeting file.

---

## Checklist Before Committing

- [ ] File is at `meetings/mygdocs/{mtg_id}.md`
- [ ] `id:` in frontmatter exactly matches filename without `.md`
- [ ] `date:` present in `YYYY-MM-DD` format
- [ ] `title:` present
- [ ] `document_type: meeting` present
- [ ] Tabs use `<!-- rb:tab id="..." title="..." -->` in the body (not frontmatter)
- [ ] `todos.json` updated with matching `meeting_id` and correct `week_start`
- [ ] `project_info/TODO.md` updated with same action items
