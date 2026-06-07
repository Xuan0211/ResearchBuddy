"use client"
import { useEffect, useMemo, useState } from "react"
import { BookOpen, ChevronRight, FileText, Plus, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Document, ProjectSkill, SectionResourceDoc, SectionResources } from "@/lib/types"

type SectionKey = "papers" | "meetings" | "coding" | "workspace" | "writing" | "docs" | "images" | "prototype"

type Props = {
  projectId: string
  section: SectionKey
  title?: string
  scope?: string
  compact?: boolean
}

export default function SectionResourcesPanel({
  projectId,
  section,
  title,
  scope = "",
  compact = false,
}: Props) {
  const [resources, setResources] = useState<SectionResources | null>(null)
  const [skills, setSkills] = useState<ProjectSkill[]>([])
  const [projectDocs, setProjectDocs] = useState<(Document & { folder?: string; _path?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [showDocForm, setShowDocForm] = useState(false)
  const [docForm, setDocForm] = useState({ title: "", content: "" })
  const [editingDoc, setEditingDoc] = useState<SectionResourceDoc | null>(null)
  const [selectedSkill, setSelectedSkill] = useState("")
  const [selectedDocPath, setSelectedDocPath] = useState("")
  const [folderPath, setFolderPath] = useState("")
  const [openPreview, setOpenPreview] = useState(false)

  function resourcePath(path: string) {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ""
    const joiner = path.includes("?") ? "&" : "?"
    return `/api/projects/${projectId}/module-resources/${section}${path}${scope && path.includes("?") ? `${joiner}scope=${encodeURIComponent(scope)}` : qs}`
  }

  async function load() {
    setLoading(true)
    try {
      const [res, allSkills, docs] = await Promise.all([
        api.get<SectionResources>(resourcePath("")),
        api.get<ProjectSkill[]>(`/api/projects/${projectId}/skills`),
        api.get<(Document & { folder?: string; _path?: string })[]>(`/api/projects/${projectId}/docs`),
      ])
      setResources(res)
      setSkills(allSkills)
      setProjectDocs(docs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, section, scope])

  const attachableSkills = useMemo(() => {
    const attached = new Set(resources?.skill_ids ?? [])
    return skills.filter(skill => !attached.has(skill.id))
  }, [resources?.skill_ids, skills])

  const attachedDocPaths = useMemo(() => new Set(resources?.doc_refs.map(ref => ref.path) ?? []), [resources?.doc_refs])
  const attachableDocs = useMemo(() => {
    return projectDocs
      .map(doc => ({
        title: doc.title,
        path: doc._path || `docs/${doc.id}.md`,
      }))
      .filter(doc => !attachedDocPaths.has(doc.path))
  }, [attachedDocPaths, projectDocs])

  async function createDoc(e: React.FormEvent) {
    e.preventDefault()
    await api.post(resourcePath("/docs"), docForm)
    setDocForm({ title: "", content: "" })
    setShowDocForm(false)
    await load()
  }

  async function saveDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!editingDoc) return
    await api.patch(resourcePath(`/docs/${editingDoc.id}`), {
      title: editingDoc.title,
      content: editingDoc.content,
    })
    setEditingDoc(null)
    await load()
  }

  async function deleteDoc(doc: SectionResourceDoc) {
    if (!confirm(`Delete "${doc.title}"?`)) return
    await api.delete(resourcePath(`/docs/${doc.id}`))
    await load()
  }

  async function attachSkill() {
    if (!selectedSkill) return
    await api.post(resourcePath("/skills"), { skill_id: selectedSkill })
    setSelectedSkill("")
    await load()
  }

  async function detachSkill(skill: ProjectSkill) {
    await api.delete(resourcePath(`/skills/${skill.id}`))
    await load()
  }

  async function attachDoc(path: string, kind: "doc" | "folder") {
    if (!path.trim()) return
    try {
      await api.post(resourcePath("/doc-refs"), { path: path.trim(), kind })
      setSelectedDocPath("")
      setFolderPath("")
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Attach failed")
    }
  }

  async function detachDoc(path: string, kind: "doc" | "folder") {
    await api.delete(resourcePath(`/doc-refs?path=${encodeURIComponent(path)}&kind=${kind}`))
    await load()
  }

  if (loading) return <div className="rounded-md border p-3 text-xs text-gray-400">Loading resources...</div>
  if (!resources) return null

  const shell = compact ? "border-t" : "rounded-md border bg-white"
  const bodyGrid = compact ? "space-y-4 p-3" : "grid gap-5 p-4 lg:grid-cols-2"

  return (
    <section className={shell}>
      <div className={compact ? "px-3 py-2" : "border-b px-4 py-3"}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium">{title ?? "Docs & skills"}</h3>
            {!compact && <p className="mt-0.5 text-xs text-gray-400">Local folder: {resources.local_root}/</p>}
          </div>
          <button
            onClick={() => setShowDocForm(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Plus size={13} /> Doc
          </button>
        </div>
      </div>

      <div className={bodyGrid}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <FileText size={13} /> Docs
          </div>

          <div className={compact ? "space-y-2" : "grid gap-2 sm:grid-cols-2"}>
            <div className="flex gap-2">
              <select
                value={selectedDocPath}
                onChange={e => setSelectedDocPath(e.target.value)}
                className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs text-gray-700"
              >
                <option value="">Attach project doc</option>
                {attachableDocs.map(doc => <option key={doc.path} value={doc.path}>{doc.title}</option>)}
              </select>
              <button onClick={() => attachDoc(selectedDocPath, "doc")} disabled={!selectedDocPath}
                className="rounded-md border px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Add
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={folderPath}
                onChange={e => setFolderPath(e.target.value)}
                placeholder="docs/folder-name"
                className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs text-gray-700"
              />
              <button onClick={() => attachDoc(folderPath, "folder")} disabled={!folderPath}
                className="rounded-md border px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>

          {showDocForm && (
            <form onSubmit={createDoc} className="space-y-2">
              <input
                autoFocus
                value={docForm.title}
                onChange={e => setDocForm({ ...docForm, title: e.target.value })}
                placeholder="Local doc title"
                required
                className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
              />
              <textarea
                value={docForm.content}
                onChange={e => setDocForm({ ...docForm, content: e.target.value })}
                placeholder="Optional markdown content"
                rows={compact ? 3 : 4}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
              />
              <div className="flex gap-2">
                <button type="submit" className="rounded-md bg-black px-3 py-1.5 text-xs text-white">Create</button>
                <button type="button" onClick={() => setShowDocForm(false)} className="text-xs text-gray-400 hover:text-black">Cancel</button>
              </div>
            </form>
          )}

          {resources.doc_refs.length > 0 && (
            <ul className="space-y-2">
              {resources.doc_refs.map(ref => (
                <li key={`${ref.type}:${ref.path}`} className="rounded-md border border-gray-100 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ref.type === "folder" ? "Folder" : "Doc"} attachment</p>
                      <p className="mt-0.5 truncate text-[11px] text-gray-400">{ref.path}</p>
                    </div>
                    <button onClick={() => detachDoc(ref.path, ref.type)} className="p-1 text-gray-300 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {resources.docs.length > 0 ? (
            <ul className="space-y-2">
              {resources.docs.map(doc => (
                <li key={doc.id} className="rounded-md border border-gray-100 px-3 py-2">
                  {editingDoc?.id === doc.id ? (
                    <form onSubmit={saveDoc} className="space-y-2">
                      <input
                        value={editingDoc.title}
                        onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      />
                      <textarea
                        value={editingDoc.content}
                        onChange={e => setEditingDoc({ ...editingDoc, content: e.target.value })}
                        rows={compact ? 4 : 6}
                        className="w-full rounded-md border px-2 py-1.5 text-sm"
                      />
                      <div className="flex gap-2">
                        <button type="submit" className="rounded bg-black px-2 py-1 text-xs text-white">Save</button>
                        <button type="button" onClick={() => setEditingDoc(null)} className="text-gray-400 hover:text-black"><X size={14} /></button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start gap-2">
                      <button onClick={() => setEditingDoc(doc)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium">{doc.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-gray-400">{doc.path}</p>
                      </button>
                      <button onClick={() => deleteDoc(doc)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : resources.doc_refs.length === 0 ? (
            <p className="text-xs text-gray-400">No docs attached.</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <BookOpen size={13} /> Skills
          </div>
          <div className="flex gap-2">
            <select
              value={selectedSkill}
              onChange={e => setSelectedSkill(e.target.value)}
              className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs text-gray-700"
            >
              <option value="">Attach a skill</option>
              {attachableSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.title}</option>)}
            </select>
            <button onClick={attachSkill} disabled={!selectedSkill}
              className="rounded-md border px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Add
            </button>
          </div>
          {resources.skills.length === 0 ? (
            <p className="text-xs text-gray-400">No skills attached.</p>
          ) : (
            <ul className="space-y-2">
              {resources.skills.map(skill => (
                <li key={skill.id} className="rounded-md border border-gray-100 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{skill.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{skill.description || skill.path}</p>
                    </div>
                    <button onClick={() => detachSkill(skill)} className="p-1 text-gray-300 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!compact && (
        <button
          onClick={() => setOpenPreview(v => !v)}
          className="flex w-full items-center gap-1.5 border-t px-4 py-2 text-left text-xs text-gray-400 hover:text-gray-700"
        >
          <ChevronRight size={13} className={`transition-transform ${openPreview ? "rotate-90" : ""}`} />
          Clone preview
          <span className="ml-auto truncate font-mono text-[11px]">{resources.local_root}/</span>
        </button>
      )}
      {!compact && openPreview && (
        <div className="border-t bg-gray-50 px-4 py-3">
          <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
            <code className="rounded bg-white px-2 py-1">{resources.local_root}/docs</code>
            <code className="rounded bg-white px-2 py-1">{resources.local_root}/skills</code>
            <code className="rounded bg-white px-2 py-1">{resources.local_root}/files</code>
          </div>
        </div>
      )}
    </section>
  )
}
