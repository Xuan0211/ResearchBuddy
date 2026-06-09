"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ExternalLink, FileCode, GitBranch, Plus, Trash2, X } from "lucide-react"
import { api } from "@/lib/api"

interface WritingProject {
  id: string; title: string; description: string
  github_url: string; overleaf_url: string
  files?: string[]
}

interface WritingFile { path: string; content: string }

export default function WritingPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [projects, setProjects] = useState<WritingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", github_url: "", overleaf_url: "" })
  const [selected, setSelected] = useState<WritingProject | null>(null)
  const [selectedFile, setSelectedFile] = useState<WritingFile | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [editingUrls, setEditingUrls] = useState(false)
  const [urlForm, setUrlForm] = useState({ github_url: "", overleaf_url: "" })

  useEffect(() => {
    api.get<WritingProject[]>(`/api/projects/${projectId}/writing`)
      .then(setProjects).finally(() => setLoading(false))
  }, [projectId])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const p = await api.post<{ id: string }>(`/api/projects/${projectId}/writing`, form)
    const full = await api.get<WritingProject>(`/api/projects/${projectId}/writing/${p.id}`)
    setProjects(prev => [...prev, full])
    setForm({ title: "", description: "", github_url: "", overleaf_url: "" })
    setCreating(false)
    setSelected(full)
  }

  async function openProject(wp: WritingProject) {
    const full = await api.get<WritingProject>(`/api/projects/${projectId}/writing/${wp.id}`)
    setSelected(full)
    setProjects(prev => prev.map(p => p.id === full.id ? full : p))
    setSelectedFile(null)
    setEditingUrls(false)
  }

  async function openFile(wp: WritingProject, path: string) {
    setFileLoading(true)
    try {
      const f = await api.get<WritingFile>(`/api/projects/${projectId}/writing/${wp.id}/file?path=${encodeURIComponent(path)}`)
      setSelectedFile(f)
    } finally { setFileLoading(false) }
  }

  async function saveUrls(wp: WritingProject) {
    await api.patch(`/api/projects/${projectId}/writing/${wp.id}`, urlForm)
    setSelected(prev => prev ? { ...prev, ...urlForm } : prev)
    setProjects(prev => prev.map(p => p.id === wp.id ? { ...p, ...urlForm } : p))
    setEditingUrls(false)
  }

  async function deleteWritingProject(wp: WritingProject) {
    if (!confirm(`Delete "${wp.title}"?`)) return
    if (!confirm("This will remove the writing project folder from the git workspace. Continue?")) return
    await api.delete(`/api/projects/${projectId}/writing/${wp.id}`)
    setProjects(prev => prev.filter(p => p.id !== wp.id))
    setSelected(null)
    setSelectedFile(null)
    setEditingUrls(false)
  }

  const texFiles = selected?.files?.filter(f => f.endsWith(".tex") || f.endsWith(".bib")) ?? []
  const otherFiles = selected?.files?.filter(f => !texFiles.includes(f)) ?? []

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-white px-6 py-4 space-y-3 flex-shrink-0">
        <h3 className="text-sm font-semibold">Writing</h3>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-56 border-r bg-gray-50 flex flex-col flex-shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Writing</p>
          <button onClick={() => setCreating(v => !v)}
            className="p-1 rounded text-gray-400 hover:text-black"><Plus size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {projects.map(p => (
            <button key={p.id} onClick={() => openProject(p)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selected?.id === p.id ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
              }`}>
              {p.title}
            </button>
          ))}
          {projects.length === 0 && !creating && (
            <p className="text-xs text-gray-400 px-3 py-2">No writing projects yet.</p>
          )}
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {creating && (
          <form onSubmit={create} className="p-6 border-b bg-white space-y-3 flex-shrink-0">
            <h3 className="font-semibold text-sm">New writing project</h3>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                placeholder="Paper title" required
                className="col-span-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
              <input value={form.github_url} onChange={e => setForm({...form, github_url: e.target.value})}
                placeholder="GitHub repo URL (optional)"
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <input value={form.overleaf_url} onChange={e => setForm({...form, overleaf_url: e.target.value})}
                placeholder="Overleaf URL (optional)"
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-black text-white text-sm px-4 py-1.5 rounded-lg">Create</button>
              <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
            </div>
          </form>
        )}

        {selected ? (
          <div className="flex flex-1 overflow-hidden">
            {/* File tree */}
            <div className="w-48 border-r overflow-y-auto flex-shrink-0 bg-gray-50">
              <div className="p-3 border-b">
                <p className="text-xs font-medium text-gray-500">Files</p>
              </div>
              <div className="p-2 space-y-0.5">
                {texFiles.map(f => (
                  <button key={f} onClick={() => openFile(selected, f.replace(`writing/${selected.id}/`, ""))}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${
                      selectedFile?.path === f.replace(`writing/${selected.id}/`, "") ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}>
                    <FileCode size={11} className="flex-shrink-0" />
                    <span className="truncate">{f.split("/").pop()}</span>
                  </button>
                ))}
                {otherFiles.length > 0 && (
                  <>
                    <div className="px-2 pt-2 pb-0.5 text-[10px] text-gray-400 uppercase tracking-wide">Other</div>
                    {otherFiles.map(f => (
                      <button key={f} onClick={() => openFile(selected, f.replace(`writing/${selected.id}/`, ""))}
                        className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-500 hover:bg-gray-100 truncate">
                        {f.split("/").pop()}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {!selectedFile ? (
                <div className="space-y-5 max-w-2xl">
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-semibold truncate">{selected.title}</h2>
                        {selected.description && <p className="text-sm text-gray-500 mt-1">{selected.description}</p>}
                      </div>
                      <button
                        onClick={() => deleteWritingProject(selected)}
                        title="Delete writing project"
                        className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Links */}
                  {editingUrls ? (
                    <div className="space-y-2 p-4 border rounded-xl">
                      <input value={urlForm.github_url} onChange={e => setUrlForm({...urlForm, github_url: e.target.value})}
                        placeholder="GitHub repo URL" className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                      <input value={urlForm.overleaf_url} onChange={e => setUrlForm({...urlForm, overleaf_url: e.target.value})}
                        placeholder="Overleaf URL" className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => saveUrls(selected)} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg">Save</button>
                        <button onClick={() => setEditingUrls(false)} className="text-xs text-gray-500 px-3">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selected.github_url && (
                        <a href={selected.github_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50">
                          <GitBranch size={12} /> GitHub ↗
                        </a>
                      )}
                      {selected.overleaf_url && (
                        <a href={selected.overleaf_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100">
                          <ExternalLink size={12} /> Overleaf ↗
                        </a>
                      )}
                      <button onClick={() => { setEditingUrls(true); setUrlForm({ github_url: selected.github_url || "", overleaf_url: selected.overleaf_url || "" }) }}
                        className="text-xs text-gray-400 border rounded-lg px-3 py-1.5 hover:bg-gray-50">
                        {(selected.github_url || selected.overleaf_url) ? "Edit links" : "+ Add GitHub / Overleaf"}
                      </button>
                    </div>
                  )}
                  <div className="p-4 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1">
                    <p className="font-medium text-gray-700">AI writing guidelines</p>
                    <p>• <code className="bg-white px-1 rounded">reference.bib</code> is read-only — managed by Zotero</p>
                    <p>• <code className="bg-white px-1 rounded">ai-generated.bib</code> is for AI-suggested references</p>
                    <p>• Use <code className="bg-white px-1 rounded">\aicite{"{key}"}</code> for AI refs (shows in color), <code className="bg-white px-1 rounded">\cite{"{key}"}</code> for confirmed</p>
                    <p>• Confirm AI references in Papers → AI Generated tab</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedFile(null)} className="text-xs text-gray-400 hover:text-black">← Back</button>
                    <span className="text-xs font-mono text-gray-600">{selectedFile.path}</span>
                  </div>
                  {fileLoading ? (
                    <div className="text-sm text-gray-400">Loading…</div>
                  ) : (
                    <pre className="bg-gray-50 rounded-xl p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {selectedFile.content}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : !creating ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Select a writing project or create one.
          </div>
        ) : null}
      </div>
      </div>
    </div>
  )
}
