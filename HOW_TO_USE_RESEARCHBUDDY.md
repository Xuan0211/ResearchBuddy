# How To Use ResearchBuddy

ResearchBuddy projects are normal git workspaces with a UI on top. The local
files should remain useful to humans and agents even when Zotero, Drive, or cloud
sync is offline.

## Project Workspace

Open the `Workspace` tab in a project and click `Ensure` once for older projects.
This creates the shared folder contract:

```text
papers/          Paper metadata and reading notes
docs/            Drafts, plans, and shared notes
meetings/        Meeting notes and calendar metadata
prototypes/      Prototype code and experiments
writing/         LaTeX papers and writing projects
assets/          Images, PDFs, data, media
team/            Contacts and @ handles
skills/          Team or Agent workflows
.researchbuddy/  Generated indexes and sync state
```

Agents and teammates should edit the normal folders. ResearchBuddy owns
`.researchbuddy/`.

## Papers And Zotero

Each project has its own Zotero settings. A project can point to a personal
library or a different Zotero Group library by setting `Library Type = Group
library` and entering that group ID.

The Papers page loads local Markdown files first. Zotero sync is a separate
action: it updates or creates files in `papers/` without hiding the existing local
library while sync is running.

## Contacts And Mentions

Use the Meetings page to add contacts, or edit `team/contacts.json` directly:

```json
{
  "contacts": [
    {
      "handle": "alice",
      "name": "Alice Chen",
      "email": "alice@example.edu",
      "role": "PhD"
    }
  ]
}
```

Documents can mention people with `@alice`. ResearchBuddy stores detected
mentions in document frontmatter so agents and future notification tools can use
them.

## Meetings, Outlook, And Drive

Meetings are Markdown files under `meetings/`. They behave like special docs:
creation starts from a meeting template and adds calendar fields, but the tabbed
meeting body is editable in the same editor as normal docs.

When creating a meeting, add date, time, location, and attendees. Attendees can
be `@handle` values from the contact book or raw email addresses.

Use `.ics` to download a calendar invite that local Outlook can import. Use the
`Outlook` link to open Outlook Web's event composer. Use `Drive` to mirror the
meeting Markdown to Google Drive as a Google Docs document.

## Google Docs Sync

ResearchBuddy stores docs and meetings locally as Markdown, but syncs to Drive as
Google Docs.

Open `Workspace -> Google Drive Workspace` to choose the project Drive folder:

- `Use existing folder`: paste an existing Drive folder URL.
- `Create new folder`: create a folder in Drive, optionally under another Drive
  folder.
- `Use ResearchBuddy default`: create or reuse `ResearchBuddy/<project name>`.

ResearchBuddy writes this choice to `.researchbuddy/drive-settings.json`. Synced
docs go under the Drive subfolder `Docs/`; synced meetings go under
`Meetings/`. Use `Batch sync` from the Workspace page to manually sync all docs,
all meetings, or both. `Update linked files` updates existing mappings and
creates missing files; `Create new files` creates fresh Google Docs and rebinds
the local items.

The same Drive control appears on doc and meeting lists. When syncing a single
item, choose one of:

- `linked/new`: update the already linked Google Doc, or create one if missing.
- `new doc`: always create a fresh Google Doc and bind ResearchBuddy to it.
- `existing link`: paste an existing Google Docs/Drive URL and overwrite/bind it.

Drive sync includes a warning at the top of the Google Doc. Prose can be edited
freely in Google Docs, but avoid changing parser-sensitive tokens like
`[[paper_id]]` citations and `@handles` unless you intend to update local
ResearchBuddy parsing.

All ResearchBuddy docs are tabbed documents. Locally, tabs are stored as
agent-readable Markdown sections separated by `<!-- rb:tab ... -->` markers.
The app renders one tab at a time, so these markers stay out of the editor.
Meeting docs start with three tabs in order: `Pre-meeting`,
`Transcript / Notes`, and `Post-meeting`.

Use `Pull` on a linked document or meeting to import the Google Doc back into
the local Markdown file. ResearchBuddy reads Google Docs tabs and stores them
as local tabs. Syncing to Drive creates or updates Google Docs tabs and writes
each local tab into its matching Google Docs tab. Complex Google Docs formatting
may still be flattened during this round trip.

Deleting a local doc or meeting also attempts to move the linked Drive file to
trash. If Drive is disconnected or deletion fails, ResearchBuddy stops and shows
an error instead of silently leaving an unexpected Drive copy behind.

## Agent Workflow

An agent can clone or open the project repo, edit files, then push changes. After
a successful push, ResearchBuddy invalidates paper caches and reads the updated
workspace from git. For old projects, run `Workspace -> Reindex` to refresh
`.researchbuddy/index.json`.
