"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronLeft, Download, FileUp, Plus, RefreshCw, Save, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Project, ProjectSkill } from "@/lib/types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const MAX_MB = 10

type GlobalSkill = ProjectSkill & { recommended_docs?: string[]; content?: string }
type CurrentProject = { id: string; name?: string }
type ProjectStatus = { project_id: string; project_name: string; role: string; is_imported: boolean }

const SECTION_LABELS: Record<string, string> = {
  papers: "Papers",
  meetings: "Meetings",
  docs: "Docs",
  document: "Docs",
  writing: "Writing",
  coding: "Coding",
  workspace: "Workspace",
  images: "Images",
  prototype: "Prototype",
  skills: "Skills",
}

// ── Upload dialog ──────────────────────────────────────────────────────────────

function UploadDialog({ onClose, onUpload }: { onClose: () => void; onUpload: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Upload Global Skill</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black"><X size={16} /></button>
        </div>
        <div className="space-y-3 text-sm text-gray-600">
          <p>Upload a skill to the shared global library:</p>
          <ul className="space-y-2 text-xs">
            <li className="rounded-md border bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-800">.md file</span>
              <p className="mt-0.5 text-gray-500">A single Markdown file with optional frontmatter (<code className="bg-gray-100 px-1 rounded">title</code>, <code className="bg-gray-100 px-1 rounded">tags</code>).</p>
            </li>
            <li className="rounded-md border bg-gray-50 px-3 py-2">
              <span className="font-medium text-gray-800">.zip archive</span>
              <p className="mt-0.5 text-gray-500">Must contain <code className="bg-gray-100 px-1 rounded">SKILL.md</code> at the root or inside a single top-level folder (e.g. <code className="bg-gray-100 px-1 rounded">my-skill/SKILL.md</code>).</p>
            </li>
          </ul>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={() => ref.current?.click()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
            <FileUp size={14} /> Choose file
          </button>
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
        <input ref={ref} type="file" accept=".md,.zip" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); onClose() } }} />
      </div>
    </div>
  )
}

// ── Import dialog (multi-project) ──────────────────────────────────────────────

function ImportDialog({
  skill,
  statuses,
  currentProjectId,
  onImport,
  onSync,
  onClose,
}: {
  skill: GlobalSkill
  statuses: ProjectStatus[]
  currentProjectId: string | null
  onImport: (projectIds: string[]) => Promise<void>
  onSync: (projectId: string) => Promise<void>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Auto-select source project if not already imported
    const set = new Set<string>()
    if (currentProjectId) {
      const s = statuses.find(s => s.project_id === currentProjectId)
      if (s && !s.is_imported) set.add(currentProjectId)
    }
    return set
  })
  const [busy, setBusy] = useState<string | null>(null) // project_id being synced, or "import"

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleImport() {
    if (selected.size === 0) return
    setBusy("import")
    try { await onImport([...selected]) }
    finally { setBusy(null) }
  }

  async function handleSync(projectId: string) {
    setBusy(projectId)
    try { await onSync(projectId) }
    finally { setBusy(null) }
  }

  const importable = statuses.filter(s => !s.is_imported)
  const imported = statuses.filter(s => s.is_imported)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold">Import &ldquo;{skill.title}&rdquo;</h3>
            <p className="text-xs text-gray-500 mt-0.5">Select projects to import into</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
          {importable.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Not yet imported</p>
              {importable.map(s => (
                <label key={s.project_id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${selected.has(s.project_id) ? "border-black bg-gray-50" : "hover:bg-gray-50"}`}>
                  <input type="checkbox" checked={selected.has(s.project_id)} onChange={() => toggle(s.project_id)}
                    className="accent-black" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{s.project_name}</p>
                    <p className="text-[10px] text-gray-400">{s.role}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {imported.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Already imported</p>
              {imported.map(s => (
                <div key={s.project_id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-500 truncate">{s.project_name}</p>
                    <p className="text-[10px] text-gray-400">{s.role}</p>
                  </div>
                  <button
                    onClick={() => handleSync(s.project_id)}
                    disabled={busy === s.project_id}
                    title="Overwrite project copy with the latest global version"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50">
                    <RefreshCw size={10} className={busy === s.project_id ? "animate-spin" : ""} />
                    {busy === s.project_id ? "Syncing…" : "Sync"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {statuses.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No editable projects found.</p>
          )}
        </div>

        {importable.length > 0 && (
          <div className="border-t px-5 py-4 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">{selected.size} project{selected.size !== 1 ? "s" : ""} selected</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleImport} disabled={selected.size === 0 || busy === "import"}
                className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {busy === "import" ? "Importing…" : `Import to ${selected.size || ""} project${selected.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* Sync-only footer when everything is already imported */}
        {importable.length === 0 && imported.length > 0 && (
          <div className="border-t px-5 py-3 flex justify-end">
            <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sync warning dialog ────────────────────────────────────────────────────────

function SyncWarningDialog({
  projectName,
  onConfirm,
  onCancel,
}: {
  projectName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">Sync will overwrite local changes</h3>
            <p className="mt-1 text-xs text-gray-600">
              Any edits made to this skill inside <strong>{projectName}</strong> will be replaced by the global version. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">Sync anyway</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function GlobalSkillsPage() {
  const [skills, setSkills] = useState<GlobalSkill[]>([])
  const [editing, setEditing] = useState<GlobalSkill | null>(null)
  const [form, setForm] = useState({ title: "", tags: "", sections: [] as string[], recommended_docs: "", content: "" })
  const [currentProject, setCurrentProject] = useState<CurrentProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUploadDialog, setShowUploadDialog] = useState(false)

  // Import dialog state
  const [importSkill, setImportSkill] = useState<GlobalSkill | null>(null)
  const [importStatuses, setImportStatuses] = useState<ProjectStatus[]>([])
  const [loadingStatuses, setLoadingStatuses] = useState(false)

  // Sync warning
  const [syncPending, setSyncPending] = useState<{ projectId: string; projectName: string } | null>(null)
  const [syncSkillId, setSyncSkillId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try { setSkills(await api.get<GlobalSkill[]>("/api/global-skills")) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const raw = localStorage.getItem("rb_current_project")
    if (raw) {
      try { setCurrentProject(JSON.parse(raw)) } catch { setCurrentProject(null) }
    }
    load()
  }, [])

  async function saveSkill(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      title: form.title,
      content: form.content,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      sections: form.sections,
      recommended_docs: form.recommended_docs.split(",").map(t => t.trim()).filter(Boolean),
    }
    if (editing) {
      await api.patch(`/api/global-skills/${editing.id}`, payload)
    } else {
      await api.post("/api/global-skills", payload)
    }
    setEditing(null)
    setForm({ title: "", tags: "", sections: [], recommended_docs: "", content: "" })
    await load()
  }

  async function editSkill(skill: GlobalSkill) {
    const full = await api.get<GlobalSkill>(`/api/global-skills/${skill.id}`)
    setEditing(full)
    setForm({
      title: full.title,
      tags: (full.tags || []).join(", "),
      sections: full.sections || [],
      recommended_docs: (full.recommended_docs || []).join(", "),
      content: full.content || "",
    })
  }

  async function deleteSkill(skill: GlobalSkill) {
    const typed = prompt(`Type the skill name to confirm deletion:\n\n${skill.title}`)
    if (typed !== skill.title) return
    const token = localStorage.getItem("rb_token") ?? ""
    const res = await fetch(`${BASE}/api/global-skills/${skill.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirm_title: typed }),
    })
    if (!res.ok) { alert("Delete failed: " + (await res.text())); return }
    await load()
  }

  async function openImportDialog(skill: GlobalSkill) {
    setImportSkill(skill)
    setImportStatuses([])
    setLoadingStatuses(true)
    try {
      const statuses = await api.get<ProjectStatus[]>(`/api/global-skills/${skill.id}/project-status`)
      setImportStatuses(statuses)
    } catch {
      setImportStatuses([])
    } finally {
      setLoadingStatuses(false)
    }
  }

  async function handleImport(projectIds: string[]) {
    if (!importSkill) return
    const res = await api.post<{ results: { project_id: string; ok: boolean; error?: string }[] }>(
      `/api/global-skills/${importSkill.id}/import-multi`,
      { project_ids: projectIds }
    )
    const failed = res.results.filter(r => !r.ok)
    if (failed.length) {
      alert(`Import failed for some projects:\n${failed.map(f => `${f.project_id}: ${f.error}`).join("\n")}`)
    } else {
      setImportSkill(null)
    }
    await load()
    // Refresh statuses
    if (importSkill) {
      try {
        const statuses = await api.get<ProjectStatus[]>(`/api/global-skills/${importSkill.id}/project-status`)
        setImportStatuses(statuses)
      } catch {}
    }
  }

  function requestSync(skillId: string, projectId: string, projectName: string) {
    setSyncSkillId(skillId)
    setSyncPending({ projectId, projectName })
  }

  async function confirmSync() {
    if (!syncPending || !syncSkillId) return
    try {
      await api.post(`/api/global-skills/${syncSkillId}/sync`, { project_id: syncPending.projectId })
    } catch (e: unknown) {
      alert("Sync failed: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSyncPending(null)
      setSyncSkillId(null)
    }
  }

  async function uploadFile(file: File) {
    if (file.size > MAX_MB * 1024 * 1024) { alert(`File exceeds ${MAX_MB} MB`); return }
    const payload = new FormData()
    payload.append("file", file)
    const token = localStorage.getItem("rb_token") ?? ""
    const res = await fetch(`${BASE}/api/global-skills/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    })
    if (!res.ok) { alert("Upload failed: " + (await res.text())); return }
    const uploaded = await res.json()
    await load()
    if (uploaded.id) {
      const full = await api.get<GlobalSkill>(`/api/global-skills/${uploaded.id}`)
      setEditing(full)
      setForm({
        title: full.title,
        tags: (full.tags || []).join(", "),
        sections: full.sections || [],
        recommended_docs: (full.recommended_docs || []).join(", "),
        content: full.content || "",
      })
    }
  }

  function toggleSection(section: string) {
    setForm(prev => ({
      ...prev,
      sections: prev.sections.includes(section) ? prev.sections.filter(s => s !== section) : [...prev.sections, section],
    }))
  }

  function downloadSkill(skill: GlobalSkill) {
    const token = localStorage.getItem("rb_token") ?? ""
    fetch(`${BASE}/api/global-skills/${skill.id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = `${skill.id}.md`
        a.click()
      })
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      {showUploadDialog && (
        <UploadDialog onClose={() => setShowUploadDialog(false)} onUpload={uploadFile} />
      )}

      {importSkill && !loadingStatuses && (
        <ImportDialog
          skill={importSkill}
          statuses={importStatuses}
          currentProjectId={currentProject?.id ?? null}
          onImport={handleImport}
          onSync={(projectId) => {
            const s = importStatuses.find(s => s.project_id === projectId)
            requestSync(importSkill.id, projectId, s?.project_name ?? projectId)
          }}
          onClose={() => setImportSkill(null)}
        />
      )}

      {syncPending && (
        <SyncWarningDialog
          projectName={syncPending.projectName}
          onConfirm={confirmSync}
          onCancel={() => { setSyncPending(null); setSyncSkillId(null) }}
        />
      )}

      <div className="mx-auto max-w-5xl space-y-5 px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            {currentProject && (
              <Link href={`/projects/${currentProject.id}/home`}
                className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black">
                <ChevronLeft size={13} /> Back to current project
              </Link>
            )}
            <h2 className="text-lg font-semibold">Global Skills Library</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Shared skills visible to all signed-in users. Import into any project you can edit.
            </p>
          </div>
          <button onClick={() => setShowUploadDialog(true)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
            <FileUp size={13} /> Upload
          </button>
        </div>

        {/* Add / edit form */}
        <section className="rounded-md border bg-white">
          <div className="border-b px-4 py-3 text-sm font-medium">
            {editing ? "Edit global skill" : "Add global skill"}
          </div>
          <form onSubmit={saveSkill} className="grid gap-2 p-4 md:grid-cols-2">
            <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Skill name" required className="rounded border px-2 py-1.5 text-xs outline-none"/>
            <input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="tags, comma separated" className="rounded border px-2 py-1.5 text-xs outline-none"/>
            <div className="flex flex-wrap gap-1 md:col-span-2">
              {Object.entries(SECTION_LABELS).map(([key,label]) => (
                <button key={key} type="button" onClick={()=>toggleSection(key)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${form.sections.includes(key) ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {label}
                </button>
              ))}
            </div>
            <input value={form.recommended_docs} onChange={e=>setForm({...form,recommended_docs:e.target.value})} placeholder="recommended docs, comma separated" className="rounded border px-2 py-1.5 text-xs outline-none md:col-span-2"/>
            <textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="# Skill" className="h-32 resize-none rounded border px-2 py-1.5 font-mono text-xs outline-none md:col-span-2"/>
            <div className="flex items-center gap-2 md:col-span-2">
              <button type="submit" className="inline-flex items-center gap-1 rounded bg-black px-3 py-1.5 text-xs text-white">
                <Save size={12} /> {editing ? "Save skill" : "Add skill"}
              </button>
              {editing && (
                <button type="button" onClick={() => { setEditing(null); setForm({ title:"", tags:"", sections:[], recommended_docs:"", content:"" }) }}
                  className="rounded border px-3 py-1.5 text-xs text-gray-600">Cancel</button>
              )}
            </div>
          </form>
        </section>

        {/* Skills grid */}
        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <p className="text-sm text-gray-400">Loading skills...</p>
          ) : skills.length === 0 ? (
            <p className="text-sm text-gray-400">No global skills yet.</p>
          ) : skills.map(skill => (
            <div key={skill.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{skill.title}</p>
                  {skill.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{skill.description}</p>}
                  {skill.created_by && <p className="mt-1 text-[11px] text-gray-400">By {skill.created_by}</p>}
                </div>
                <button onClick={()=>deleteSkill(skill)} title="Delete" className="p-1 text-gray-300 hover:text-red-500 shrink-0">
                  <Trash2 size={13}/>
                </button>
              </div>
              {skill.tags?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {skill.tags.map(tag=><span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{tag}</span>)}
                </div>
              )}
              {(skill.sections || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(skill.sections || []).map(section=>(
                    <span key={section} className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                      {SECTION_LABELS[section] ?? section}
                    </span>
                  ))}
                </div>
              )}
              {(skill.recommended_docs || []).length > 0 && (
                <p className="mt-2 text-[11px] text-gray-400">Docs: {(skill.recommended_docs || []).join(", ")}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => openImportDialog(skill)}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50">
                  <Plus size={11} /> Import
                </button>
                <button onClick={()=>editSkill(skill)} className="rounded border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50">Edit</button>
                <button onClick={()=>downloadSkill(skill)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50">
                  <Download size={11}/>Download
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
