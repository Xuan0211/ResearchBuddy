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
- The meeting ID: `[[meeting_id]]` to read from `meetings/`
- Or paste the raw transcript directly

## Output

Write the summary into the meeting's **Post-meeting** tab. Prepend an AI note:

```markdown
> [AI summary — YYYY-MM-DD]: The following summary was auto-generated from the transcript/notes.

## Summary
2–3 sentences capturing the main theme of the meeting.

## Decisions Made
- Decision 1 — (who decided, any caveats)
- Decision 2

## Action Items
| Item | Owner | Due |
|---|---|---|
| Description of task | @handle | Date or "TBD" |

## Open Questions
- Question 1 (who needs to answer?)
- Question 2

## Key Discussion Points
- Topic 1: brief summary
- Topic 2: brief summary

## Next Meeting
- Proposed date: ...
- Agenda items to carry forward: ...
```

## Also update Pre-meeting tab for the NEXT meeting

If a next meeting is referenced, add to its `Pre-meeting` tab under **Last Week**:
```markdown
## Last Week
- Summary of this meeting's outcomes
- Key decisions that affect next week's agenda
```

## Rules
- Only include items explicitly mentioned — do not infer or fabricate
- If the transcript is unclear, mark as `[unclear]` rather than guessing
- Action item owners must match a @handle from `team/contacts.json` if possible
- Keep each section brief — the summary should be scannable in 2 minutes
