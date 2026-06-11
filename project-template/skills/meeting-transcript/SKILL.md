---
id: meeting-transcript
title: Meeting Transcript Analysis
description: Turn a raw meeting transcript into a structured ResearchBuddy meeting note with correct frontmatter, tabs, and TODO items.
tags:
  - built-in
  - meetings
---

# Meeting Transcript Analysis

Turn a raw meeting transcript into a structured meeting note that the
ResearchBuddy frontend can display correctly.

## Critical: File Format

Meeting files live in `meetings/mygdocs/{mtg_id}.md`.  
**Every file MUST have YAML frontmatter.** Without it the frontend cannot
resolve the meeting `id` and will show "Meeting not found."

### Step 1 — Choose a meeting ID

```
mtg_id = YYMMDD-{slug}        e.g.  260609-alignment-meeting
```

The filename must be `{mtg_id}.md` and the `id:` field in frontmatter must
match exactly.

### Step 2 — Write the frontmatter

```yaml
---
id: "260609-alignment-meeting"   # matches filename
date: "2026-06-09"
title: "Alignment Meeting"
start_time: "10:00"              # HH:MM, optional
end_time:   "11:30"              # HH:MM, optional
location: ""
attendees:                       # @handles from project_info/contacts.json
  - handle1
document_type: meeting
links:
  google_drive: ""
  outlook: ""
  outlook_calendar: ""
  transcript: ""                 # relative path to raw transcript file if any
---
```

### Step 3 — Write the body in tabs

Tabs are **NOT** YAML. They are HTML comment markers in the Markdown body:

```
<!-- rb:tab id="pre-meeting" title="Pre-meeting" -->

(agenda / last week / this week content here)

<!-- rb:tab id="transcript-notes" title="Transcript / Notes" -->

(meeting discussion notes here)

<!-- rb:tab id="post-meeting" title="Post-meeting" -->

(conclusions and TODO here)
```

> ⚠️ Common mistake: do NOT put `tabs:` in the YAML frontmatter.
> Tabs in frontmatter are silently ignored by the backend.

### Step 4 — Add TODO items to Post-meeting tab

Format action items as a markdown checklist inside the post-meeting tab:

```markdown
## TODO

- [ ] Description of task @handle
- [ ] Another task @handle
```

After creating the file, also add the same items to
`.researchbuddy/todos.json` (see format below) so they appear in the
frontend TODO board.

---

## Complete Example

```markdown
---
id: "260609-alignment-meeting"
date: "2026-06-09"
title: "Alignment Meeting"
start_time: "10:00"
end_time: "11:30"
location: "Tencent Meeting"
attendees:
  - yuan.xu
document_type: meeting
links:
  google_drive: ""
  outlook: ""
  outlook_calendar: ""
  transcript: ""
---

<!-- rb:tab id="pre-meeting" title="Pre-meeting" -->

## Agenda

1. Research overview
2. Platform integration discussion

<!-- rb:tab id="transcript-notes" title="Transcript / Notes" -->

## Discussion

Key points from the meeting...

<!-- rb:tab id="post-meeting" title="Post-meeting" -->

## Conclusions

- Decision 1

## TODO

- [ ] Draft component spec v0.1 @yuan.xu
- [ ] Schedule follow-up meeting
```

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
      "title": "Meeting YYMMDD Action Items",
      "week_start": "YYYY-MM-DD",
      "meeting_id": "260609-alignment-meeting",
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
  Only items whose `week_start` matches the current week appear on the board.
- `id` fields: 10-character hex strings (e.g. `uuid.uuid4().hex[:10]`).
- `meeting_id` links the list back to the meeting file.

---

## Checklist Before Committing

- [ ] File is at `meetings/mygdocs/{mtg_id}.md`
- [ ] `id:` in frontmatter matches the filename (without `.md`)
- [ ] `date:` is present and in `YYYY-MM-DD` format
- [ ] `title:` is present
- [ ] Tabs use `<!-- rb:tab id="..." title="..." -->` markers in the body
- [ ] `todos.json` updated with matching `meeting_id`
- [ ] `project_info/TODO.md` updated with new action items
