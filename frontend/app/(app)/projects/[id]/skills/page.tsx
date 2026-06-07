"use client"
import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Archive, Download, Edit2, FileUp, FolderOpen, Plus, Save, Tag, Trash2, Upload, X } from "lucide-react"
import { api } from "@/lib/api"
import type { ProjectSkill } from "@/lib/types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const MAX_MB = 10

// ── Skill templates ───────────────────────────────────────────────────────────

const TEMPLATES: { label: string; tags: string[]; content: string }[] = [
  {
    label: "AI Task",
    tags: ["ai", "workflow"],
    content: `# Skill Title

## When to use
Describe when an AI agent should invoke this skill.

## Inputs
- Input 1: description
- Input 2: description

## Steps
1. Step one
2. Step two
3. Step three

## Output format
Describe what the output should look like.

## Rules
- Rule 1
- Rule 2
`,
  },
  {
    label: "Research Workflow",
    tags: ["research", "workflow"],
    content: `# Research Workflow

## Goal
What research task does this automate?

## Prerequisites
- Access to project papers
- Context from docs/

## Workflow

### Step 1 — Gather context
Read relevant papers and docs.

### Step 2 — Analyse
Apply the research methodology.

### Step 3 — Output
Produce the result and add an AI note to the relevant doc.

## Output format
\`\`\`
Result structure here
\`\`\`
`,
  },
  {
    label: "Analysis Checklist",
    tags: ["analysis"],
    content: `# Analysis Checklist

## Purpose
Systematic checklist for a recurring analysis task.

## Checklist

### Preparation
- [ ] Item 1
- [ ] Item 2

### Execution
- [ ] Item 3
- [ ] Item 4

### Review
- [ ] Item 5
- [ ] Item 6

## Notes
Any caveats or special cases.
`,
  },
  {
    label: "Blank",
    tags: [],
    content: `# Skill Title

Describe this skill here.
`,
  },
]

// ── Section labels ────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  papers: "Papers",
  meetings: "Meetings",
  docs: "Docs",
  writing: "Writing",
  coding: "Coding",
  workspace: "Workspace",
  images: "Images",
  prototype: "Prototype",
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [skills, setSkills] = useState<ProjectSkill[]>([])
  const [selected, setSelected] = useState<ProjectSkill | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newTags, setNewTags] = useState("")
  const [newFolder, setNewFolder] = useState("")
  const [templateIdx, setTemplateIdx] = useState(3) // default: Blank
  const [filter, setFilter] = useState<string>("all")
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try { setSkills(await api.get<ProjectSkill[]>(`/api/projects/${projectId}/skills`)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [projectId])

  async function viewSkill(skill: ProjectSkill) {
    const full = await api.get<ProjectSkill>(`/api/projects/${projectId}/skills/${skill.id}`)
    setSelected(full)
    setEditing(false)
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    try {
      await api.patch(`/api/projects/${projectId}/skills/${selected.id}`, {
        title: editTitle, content: editContent,
      })
      const updated = await api.get<ProjectSkill>(`/api/projects/${projectId}/skills/${selected.id}`)
      setSelected(updated)
      setEditing(false)
      await load()
    } finally { setSaving(false) }
  }

  async function deleteSkill(skill: ProjectSkill) {
    if (!confirm(`Delete "${skill.title}"?`)) return
    await api.delete(`/api/projects/${projectId}/skills/${skill.id}`)
    if (selected?.id === skill.id) setSelected(null)
    await load()
  }

  async function createSkill(e: React.FormEvent) {
    e.preventDefault()
    const content = TEMPLATES[templateIdx].content.replace("Skill Title", newTitle || "New Skill")
    const tags = [
      ...TEMPLATES[templateIdx].tags,
      ...newTags.split(",").map(t => t.trim()).filter(Boolean),
    ]
    await api.post(`/api/projects/${projectId}/skills`, {
      title: newTitle || "New Skill",
      content,
      tags,
      folder: newFolder,
    })
    setCreating(false); setNewTitle(""); setNewTags(""); setNewFolder(""); setTemplateIdx(3)
    await load()
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_MB * 1024 * 1024) { alert(`File exceeds ${MAX_MB} MB`); return }
    if (!file.name.endsWith(".md")) { alert("Only .md files supported"); return }
    const form = new FormData()
    form.append("file", file)
    const token = localStorage.getItem("rb_token") ?? ""
    const res = await fetch(`${BASE}/api/projects/${projectId}/skills/upload`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    if (!res.ok) { alert("Upload failed: " + (await res.text())); return }
    e.target.value = ""
    await load()
  }

  function downloadSkill(skill: ProjectSkill) {
    const token = localStorage.getItem("rb_token") ?? ""
    const a = document.createElement("a")
    a.href = `${BASE}/api/projects/${projectId}/skills/${skill.id}/download`
    // Attach token via query param won't work for bearer auth — open in same tab
    // Instead, fetch and create blob
    fetch(a.href, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        a.href = URL.createObjectURL(blob)
        a.download = `${skill.id}.md`
        a.click()
      })
  }

  function downloadAll() {
    const token = localStorage.getItem("rb_token") ?? ""
    fetch(`${BASE}/api/projects/${projectId}/skills/export/zip`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.blob()).then(blob => {
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `skills.zip`
      a.click()
    })
  }

  // Group skills by section tag
  const grouped: Record<string, ProjectSkill[]> = { all: skills }
  const sectionKeys = new Set<string>()
  skills.forEach(s => {
    const sections: string[] = (s as any).sections || []
    sections.forEach(sec => {
      sectionKeys.add(sec)
      grouped[sec] = grouped[sec] || []
      grouped[sec].push(s)
    })
  })

  const displayed = filter === "all"
    ? skills.filter(s => !((s as any).sections?.length))   // ungrouped in "all"
    : (grouped[filter] ?? [])

  const allInFilter = filter === "all" ? skills : (grouped[filter] ?? [])

  return (
    <div className="flex h-full overflow-hidden bg-white">

      {/* ── Left column: list ── */}
      <aside className="w-72 border-r flex flex-col flex-shrink-0 overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b space-y-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Skills</h3>
            <div className="flex gap-1">
              <button onClick={() => fileRef.current?.click()} title="Upload .md"
                className="p-1.5 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100">
                <FileUp size={14} />
              </button>
              <button onClick={downloadAll} title="Download all as zip"
                className="p-1.5 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100">
                <Download size={14} />
              </button>
              <button onClick={() => setCreating(true)} title="New skill"
                className="p-1.5 rounded-lg bg-black text-white hover:bg-gray-800">
                <Plus size={14} />
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".md" className="hidden" onChange={uploadFile} />

          {/* Section filter tabs */}
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setFilter("all")}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${filter === "all" ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              All
            </button>
            {[...sectionKeys].map(sec => (
              <button key={sec} onClick={() => setFilter(sec)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${filter === sec ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {SECTION_LABELS[sec] ?? sec}
              </button>
            ))}
          </div>
        </div>

        {/* Skills list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loading ? (
            <p className="text-xs text-gray-400 p-3">Loading…</p>
          ) : allInFilter.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Archive size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">No skills{filter !== "all" ? ` in ${filter}` : ""}</p>
            </div>
          ) : (
            allInFilter.map(skill => (
              <button key={skill.id}
                onClick={() => viewSkill(skill)}
                className={`w-full text-left rounded-lg px-3 py-2.5 group transition-colors ${
                  selected?.id === skill.id ? "bg-black text-white" : "hover:bg-gray-50"
                }`}>
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${selected?.id === skill.id ? "text-white" : "text-gray-800"}`}>
                      {skill.title}
                    </p>
                    {skill.description && (
                      <p className={`text-[11px] mt-0.5 line-clamp-2 ${selected?.id === skill.id ? "text-gray-300" : "text-gray-500"}`}>
                        {skill.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteSkill(skill) }}
                    className={`p-0.5 opacity-0 group-hover:opacity-100 rounded ${selected?.id === skill.id ? "text-gray-300 hover:text-red-300" : "text-gray-400 hover:text-red-500"}`}>
                    <Trash2 size={11} />
                  </button>
                </div>
                {/* Tags */}
                {skill.tags?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.tags.map(tag => (
                      <span key={tag}
                        className={`px-1.5 py-0 rounded text-[10px] ${selected?.id === skill.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Attached sections */}
                {((skill as any).attached_sections?.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {((skill as any).attached_sections as string[]).map(sec => (
                      <span key={sec}
                        className={`px-1.5 py-0 rounded-full text-[10px] font-medium ${selected?.id === skill.id ? "bg-white/30 text-white" : "bg-blue-50 text-blue-600"}`}>
                        {SECTION_LABELS[sec] ?? sec}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Right panel: detail / create ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {creating ? (
          <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-sm">New Skill</h3>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-black"><X size={16} /></button>
            </div>
            <form onSubmit={createSkill} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="E.g. Summarise paper" required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tags (comma-separated)</label>
                <input value={newTags} onChange={e => setNewTags(e.target.value)}
                  placeholder="research, ai, summary"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Folder (optional)</label>
                <input value={newFolder} onChange={e => setNewFolder(e.target.value)}
                  placeholder="Leave blank for root skills/"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Template</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((t, i) => (
                    <button key={i} type="button" onClick={() => setTemplateIdx(i)}
                      className={`text-left rounded-lg border p-3 transition-colors ${templateIdx === i ? "border-black bg-black text-white" : "border-gray-200 hover:border-gray-400"}`}>
                      <p className={`text-xs font-medium ${templateIdx === i ? "text-white" : "text-gray-700"}`}>{t.label}</p>
                      {t.tags.length > 0 && (
                        <p className={`text-[10px] mt-0.5 ${templateIdx === i ? "text-gray-300" : "text-gray-400"}`}>{t.tags.join(", ")}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" className="bg-black text-white text-sm px-4 py-2 rounded-lg">Create skill</button>
                <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 px-4">Cancel</button>
              </div>
            </form>
          </div>
        ) : selected ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Skill header */}
            <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-shrink-0">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full text-base font-semibold focus:outline-none border-b border-black pb-0.5" />
                ) : (
                  <h2 className="text-base font-semibold">{selected.title}</h2>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{selected.path}</p>
                {selected.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selected.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-0.5 bg-gray-100 px-2 py-0.5 rounded-full text-[10px] text-gray-600">
                        <Tag size={9} />{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {editing ? (
                  <>
                    <button onClick={saveEdit} disabled={saving}
                      className="inline-flex items-center gap-1.5 bg-black text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
                      <Save size={12} />{saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditing(false)} className="text-xs text-gray-500 px-2">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditing(true); setEditTitle(selected.title); setEditContent(selected.content ?? "") }}
                      className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                      <Edit2 size={12} /> Edit
                    </button>
                    <button onClick={() => downloadSkill(selected)}
                      className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                      <Download size={12} /> Download
                    </button>
                    <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-black"><X size={16} /></button>
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full h-full p-6 font-mono text-sm resize-none focus:outline-none leading-relaxed"
                  spellCheck={false}
                />
              ) : (
                <div className="px-8 py-6 prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content ?? ""}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <FolderOpen size={32} className="opacity-30" />
            <p className="text-sm">Select a skill or create a new one</p>
            <div className="flex gap-2">
              <button onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 text-xs bg-black text-white px-3 py-2 rounded-lg">
                <Plus size={12} /> New skill
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50">
                <Upload size={12} /> Upload .md
              </button>
            </div>
            <p className="text-[11px] text-gray-300 mt-1">Max {MAX_MB} MB per skill</p>
          </div>
        )}
      </main>
    </div>
  )
}
