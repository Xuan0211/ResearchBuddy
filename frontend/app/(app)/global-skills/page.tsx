"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, Download, FileUp, Plus, Save, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import type { ProjectSkill } from "@/lib/types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const MAX_MB = 10

type GlobalSkill = ProjectSkill & { recommended_docs?: string[]; content?: string }
type CurrentProject = { id: string; name?: string }

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

export default function GlobalSkillsPage() {
  const [skills, setSkills] = useState<GlobalSkill[]>([])
  const [editing, setEditing] = useState<GlobalSkill | null>(null)
  const [form, setForm] = useState({ title: "", tags: "", sections: [] as string[], recommended_docs: "", content: "" })
  const [currentProject, setCurrentProject] = useState<CurrentProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [importingId, setImportingId] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

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
    const typed = prompt(`Type the skill name to delete: ${skill.title}`)
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

  async function importSkill(skill: GlobalSkill) {
    if (!currentProject) return
    setImportingId(skill.id)
    try {
      await api.post(`/api/global-skills/${skill.id}/import`, { project_id: currentProject.id })
      alert(`Imported "${skill.title}" to current project.`)
    } finally {
      setImportingId("")
    }
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_MB * 1024 * 1024) { alert(`File exceeds ${MAX_MB} MB`); return }
    if (!file.name.endsWith(".md") && !file.name.endsWith(".zip")) { alert("Only .md or .zip files supported"); return }
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
    e.target.value = ""
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
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            {currentProject && (
              <Link href={`/projects/${currentProject.id}/home`} className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black">
                <ChevronLeft size={13} /> Back to current project
              </Link>
            )}
            <h2 className="text-lg font-semibold">Global Skills Library</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Shared skills visible to all signed-in users. Import one into the current project when you want to use it locally.
            </p>
          </div>
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
            <FileUp size={13} /> Upload
          </button>
          <input ref={fileRef} type="file" accept=".md,.zip" className="hidden" onChange={uploadFile} />
        </div>

        <section className="rounded-md border bg-white">
          <div className="border-b px-4 py-3 text-sm font-medium">{editing ? "Edit global skill" : "Add global skill"}</div>
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
                <button type="submit" className="inline-flex items-center gap-1 rounded bg-black px-3 py-1.5 text-xs text-white"><Save size={12} /> {editing ? "Save skill" : "Add skill"}</button>
              {editing && <button type="button" onClick={()=>{setEditing(null);setForm({ title:"", tags:"", sections:[], recommended_docs:"", content:"" })}} className="rounded border px-3 py-1.5 text-xs text-gray-600">Cancel</button>}
            </div>
          </form>
        </section>

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
                <button onClick={()=>deleteSkill(skill)} title="Delete" className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={13}/></button>
              </div>
              {skill.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{skill.tags.map(tag=><span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{tag}</span>)}</div>}
              {(skill.sections || []).length > 0 && <div className="mt-2 flex flex-wrap gap-1">{(skill.sections || []).map(section=><span key={section} className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">{SECTION_LABELS[section] ?? section}</span>)}</div>}
              {(skill.recommended_docs || []).length > 0 && <p className="mt-2 text-[11px] text-gray-400">Docs: {(skill.recommended_docs || []).join(", ")}</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={()=>importSkill(skill)} disabled={!currentProject || importingId === skill.id} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 disabled:opacity-40">
                  <Plus size={11} /> {importingId === skill.id ? "Importing" : "Import"}
                </button>
                <button onClick={()=>editSkill(skill)} className="rounded border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50">Edit</button>
                <button onClick={()=>downloadSkill(skill)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"><Download size={11}/>Download</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
