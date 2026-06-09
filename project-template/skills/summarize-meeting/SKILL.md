---
id: summarize-meeting
title: Summarize Meeting
description: Read a meeting transcript or notes and produce a structured summary with decisions, action items, and open questions.
tags: [meetings, summary, notes]
sections: [meetings]
---

# Summarize Meeting

Convert raw meeting notes or a transcript into a clean, actionable summary.

## When to use
- After a meeting — turn raw transcript into structured notes
- Before a follow-up meeting — quickly recall what was decided
- Sending a recap to attendees

## Input
Provide one of:
- The meeting ID: `[[meeting_id]]` to read from `meetings/mygdocs/`
- Or paste the raw transcript directly

## Output

Write the summary into the meeting's **Post-meeting** tab.

```markdown
> [AI summary — YYYY-MM-DD]: Auto-generated from transcript/notes.

## Summary
2–3 sentences capturing the main theme.

## Decisions Made
- Decision 1

## Action Items
| Item | Owner | Due |
|---|---|---|
| Task description | @handle | Date or "TBD" |

## Open Questions
- Question 1
```

## Rules
- Only include items explicitly mentioned — do not infer or fabricate
- Action item owners must match a @handle from team contacts if possible
