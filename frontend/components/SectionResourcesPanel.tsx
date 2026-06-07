"use client"
import { useEffect, useMemo, useState } from "react"
import { BookOpen, FileText, Plus, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"
import type { ProjectSkill, SectionResourceDoc, SectionResources } from "@/lib/types"

type Props = {
  projectId: string
  section: "papers" | "meetings" | "coding" | "workspace" | "writing" | "docs"
  title?: string
}

export default function SectionResourcesPanel({ projectId, section, title }: Props) {
  const [resources, setResources] = useState<SectionResources | null>(null)
  const [skills, setSkills] = useState<ProjectSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [showDocForm, setShowDocForm] = useState(false)
  const [docForm, setDocForm] = useState({ title: "", content: "" })
  const [editingDoc, setEditingDoc] = useState<SectionResourceDoc | null>(null)
  const [selectedSkill, setSelectedSkill] = useState("")

  async function load() {
    setLoading(true)
    try {
      const [res, allSkills] = await Promise.all([
        api.get<SectionResources>(`/api/projects/${projectId}/section-resources/${section}`),
        api.get<ProjectSkill[]>(`/api/projects/${projectId}/skills`),
      ])
      setResources(res)
      setSkills(allSkills)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, section])

  const attachableSkills = useMemo(() => {
    const attached = new Set(resources?.skill_ids ?? [])
    return skills.filter(skill => !attached.has(skill.id))
  }, [resources?.skill_ids, skills])

  async function createDoc(e: React.FormEvent) {
    e.preventDefault()
    await api.post(`/api/projects/${projectId}/section-resources/${section}/docs`, docForm)
    setDocForm({ title: "", content: "" })
    setShowDocForm(false)
    await load()
  }

  async function saveDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!editingDoc) return
    await api.patch(`/api/projects/${projectId}/section-resources/${section}/docs/${editingDoc.id}`, {
      title: editingDoc.title,
      content: editingDoc.content,
    })
    setEditingDoc(null)
    await load()
  }

  async function deleteDoc(doc: SectionResourceDoc) {
    if (!confirm(`Delete "${doc.title}"?`)) return
    await api.delete(`/api/projects/${projectId}/section-resources/${section}/docs/${doc.id}`)
    await load()
  }

  async function attachSkill() {
    if (!selectedSkill) return
    await api.post(`/api/projects/${projectId}/section-resources/${section}/skills`, { skill_id: selectedSkill })
    setSelectedSkill("")
    await load()
  }

  async function detachSkill(skill: ProjectSkill) {
    await api.delete(`/api/projects/${projectId}/section-resources/${section}/skills/${skill.id}`)
    await load()
  }

  if (loading) return <div className="rounded-md border p-3 text-xs text-gray-400">Loading resources…</div>
  if (!resources) return null

  return (
    <section className="rounded-md border bg-white">
      <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{title ?? "Section resources"}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Local folder: {resources.local_root}/</p>
        </div>
        <button
          onClick={() => setShowDocForm(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-xs text-white"
        >
          <Plus size={13} /> Doc
        </button>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <FileText size={13} /> Docs
          </div>
          {showDocForm && (
            <form onSubmit={createDoc} className="space-y-2">
              <input
                autoFocus
                value={docForm.title}
                onChange={e => setDocForm({ ...docForm, title: e.target.value })}
                placeholder="Document title"
                required
                className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
              />
              <textarea
                value={docForm.content}
                onChange={e => setDocForm({ ...docForm, content: e.target.value })}
                placeholder="Optional markdown content"
                rows={4}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
              />
              <div className="flex gap-2">
                <button type="submit" className="rounded-md bg-black px-3 py-1.5 text-xs text-white">Create</button>
                <button type="button" onClick={() => setShowDocForm(false)} className="text-xs text-gray-400 hover:text-black">Cancel</button>
              </div>
            </form>
          )}
          {resources.docs.length === 0 ? (
            <p className="text-xs text-gray-400">No section docs yet.</p>
          ) : (
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
                        rows={6}
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
          )}
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
              className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
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
    </section>
  )
}
