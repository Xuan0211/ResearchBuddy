"use client"
import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import {
  ChevronRight, ExternalLink, FileCode, FileImage, FileText,
  Folder, GitBranch, Loader2, Plus, RefreshCw, Trash2, X,
} from "lucide-react"
import { api } from "@/lib/api"
import ModuleResourcesPanel from "@/components/ModuleResourcesPanel"

interface WritingProject {
  id: string; title: string; description: string
  github_url: string; overleaf_url: string
  files?: string[]
}

interface WritingFile { path: string; content: string }

interface FileNode {
  name: string
  path: string
  type: "file" | "dir"
  children?: FileNode[]
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".bmp"])
const TEXT_PREVIEW_EXTS = new Set([".tex", ".bib", ".md", ".json", ".gitignore", ".sh", ".txt", ".cls", ".sty"])

function fileIcon(name: string) {
  const ext = name.includes(".") ? "." + name.split(".").pop()!.toLowerCase() : ""
  if (IMAGE_EXTS.has(ext)) return <FileImage size={11} className="flex-shrink-0 text-purple-400" />
  if ([".tex", ".cls", ".sty"].includes(ext)) return <FileCode size={11} className="flex-shrink-0 text-orange-400" />
  if ([".bib"].includes(ext)) return <FileCode size={11} className="flex-shrink-0 text-green-400" />
  if ([".md"].includes(ext)) return <FileText size={11} className="flex-shrink-0 text-blue-400" />
  return <FileText size={11} className="flex-shrink-0 text-gray-400" />
}

function buildTree(rawFiles: string[]): FileNode[] {
  const root: FileNode[] = []

  for (const file of rawFiles) {
    const parts = file.split("/")
    let nodes = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      if (isLast && part === ".gitkeep") break

      if (isLast) {
        nodes.push({ name: part, path: file, type: "file" })
      } else {
        let dir = nodes.find(n => n.name === part && n.type === "dir")
        if (!dir) {
          dir = { name: part, path: parts.slice(0, i + 1).join("/"), type: "dir", children: [] }
          nodes.push(dir)
        }
        nodes = dir.children!
      }
    }
  }

  function sortNodes(ns: FileNode[]) {
    ns.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of ns) if (n.children) sortNodes(n.children)
  }
  sortNodes(root)
  return root
}

function TreeNode({
  node, depth, projectId, writingProject, selectedPath, onSelect,
}: {
  node: FileNode
  depth: number
  projectId: string
  writingProject: WritingProject
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const indent = depth * 12

  if (node.type === "dir") {
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ paddingLeft: 8 + indent }}
          className="w-full text-left flex items-center gap-1.5 py-1 hover:bg-gray-100 rounded text-xs text-gray-600"
        >
          <ChevronRight size={11} className={`transition-transform text-gray-400 ${open ? "rotate-90" : ""}`} />
          <Folder size={11} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {open && (
          <div>
            {(node.children ?? []).length === 0 && (
              <p style={{ paddingLeft: 8 + indent + 24 }} className="py-0.5 text-[10px] text-gray-300 italic">empty</p>
            )}
            {(node.children ?? []).map(child => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                projectId={projectId}
                writingProject={writingProject}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const isSelected = selectedPath === node.path
  return (
    <button
      onClick={() => onSelect(node.path)}
      style={{ paddingLeft: 8 + indent }}
      className={`w-full text-left flex items-center gap-1.5 py-1 rounded text-xs transition-colors ${
        isSelected ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {fileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  )
}

function FilePreview({
  projectId, writingId, path,
}: { projectId: string; writingId: string; path: string }) {
  const ext = path.includes(".") ? "." + path.split(".").pop()!.toLowerCase() : ""
  const [content, setContent] = useState<string | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const prevImageSrc = useRef<string | null>(null)

  const isImage = IMAGE_EXTS.has(ext)
  const isReadOnly = path.includes("references.read_only")

  useEffect(() => {
    setLoading(true)
    setEditing(false)
    setContent(null)
    setImageSrc(null)

    if (isImage) {
      api.download(`/api/projects/${projectId}/writing/${writingId}/image?path=${encodeURIComponent(path)}`)
        .then(blob => {
          const url = URL.createObjectURL(blob)
          if (prevImageSrc.current) URL.revokeObjectURL(prevImageSrc.current)
          prevImageSrc.current = url
          setImageSrc(url)
        })
        .finally(() => setLoading(false))
    } else {
      api.get<{ path: string; content: string }>(`/api/projects/${projectId}/writing/${writingId}/file?path=${encodeURIComponent(path)}`)
        .then(r => { setContent(r.content); setDraft(r.content) })
        .finally(() => setLoading(false))
    }

    return () => {
      if (prevImageSrc.current) { URL.revokeObjectURL(prevImageSrc.current); prevImageSrc.current = null }
    }
  }, [projectId, writingId, path])

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/api/projects/${projectId}/writing/${writingId}/file?path=${encodeURIComponent(path)}`, { content: draft })
      setContent(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50 flex-shrink-0">
        <span className="text-xs font-mono text-gray-600 flex-1 truncate">{path}</span>
        {!isImage && !isReadOnly && !editing && (
          <button onClick={() => setEditing(true)} className="text-[11px] text-gray-500 hover:text-black border border-gray-200 rounded px-2 py-0.5">Edit</button>
        )}
        {editing && (
          <div className="flex gap-1">
            <button onClick={save} disabled={saving} className="text-[11px] bg-black text-white rounded px-2 py-0.5 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setEditing(false); setDraft(content ?? "") }} className="text-[11px] text-gray-400 hover:text-gray-700">Cancel</button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 text-sm text-gray-400">Loading…</div>
        ) : isImage ? (
          <div className="p-6 flex items-start justify-center">
            {imageSrc && <img src={imageSrc} alt={path} className="max-w-full max-h-[70vh] rounded border" />}
          </div>
        ) : editing ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full h-full p-4 text-xs font-mono bg-white focus:outline-none resize-none"
            spellCheck={false}
          />
        ) : (
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed text-gray-800">
            {content ?? ""}
          </pre>
        )}
      </div>
    </div>
  )
}

function GitHubSyncPanel({
  projectId, writingProject, onRefresh,
}: { projectId: string; writingProject: WritingProject; onRefresh: () => void }) {
  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function doSync(dir: "push" | "pull") {
    const setter = dir === "push" ? setPushing : setPulling
    setter(true)
    setMsg(null)
    try {
      const res = await api.post<{ message: string }>(
        `/api/projects/${projectId}/writing/${writingProject.id}/github-${dir}`,
        { github_token: token },
      )
      setMsg({ text: res.message, ok: true })
      if (dir === "pull") onRefresh()
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : `${dir} failed`
      setMsg({ text, ok: false })
    } finally {
      setter(false)
    }
  }

  if (!writingProject.github_url) return null

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-white">
      <div className="flex items-center gap-2">
        <GitBranch size={13} className="text-gray-500" />
        <p className="text-xs font-medium text-gray-700">GitHub Sync</p>
        <a href={writingProject.github_url} target="_blank" rel="noreferrer"
          className="ml-auto text-[11px] text-blue-500 hover:underline">
          {writingProject.github_url.replace(/^https?:\/\//, "").replace(/\.git$/, "")} ↗
        </a>
      </div>

      {showToken ? (
        <div className="flex gap-2 items-center">
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="GitHub PAT (optional for HTTPS auth)"
            className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-black"
          />
          <button onClick={() => { setShowToken(false); setToken("") }}
            className="text-gray-400 hover:text-gray-700"><X size={12} /></button>
        </div>
      ) : (
        <button onClick={() => setShowToken(true)}
          className="text-[11px] text-gray-400 hover:text-gray-600">
          + Set GitHub token (needed for HTTPS push/pull)
        </button>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => doSync("push")}
          disabled={pushing || pulling}
          className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
        >
          {pushing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Push to GitHub
        </button>
        <button
          onClick={() => doSync("pull")}
          disabled={pushing || pulling}
          className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
        >
          {pulling ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Pull from GitHub
        </button>
      </div>

      {msg && (
        <p className={`text-[11px] rounded px-2 py-1.5 ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}

export default function WritingPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [projects, setProjects] = useState<WritingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", github_url: "", overleaf_url: "" })
  const [selected, setSelected] = useState<WritingProject | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
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
    setSelectedPath(null)
  }

  async function openProject(wp: WritingProject) {
    const full = await api.get<WritingProject>(`/api/projects/${projectId}/writing/${wp.id}`)
    setSelected(full)
    setProjects(prev => prev.map(p => p.id === full.id ? full : p))
    setSelectedPath(null)
    setEditingUrls(false)
  }

  async function refreshSelected() {
    if (!selected) return
    const full = await api.get<WritingProject>(`/api/projects/${projectId}/writing/${selected.id}`)
    setSelected(full)
    setProjects(prev => prev.map(p => p.id === full.id ? full : p))
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
    setSelectedPath(null)
    setEditingUrls(false)
  }

  const tree = selected?.files ? buildTree(selected.files) : []

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-white px-6 py-4 space-y-3 flex-shrink-0">
        <h3 className="text-sm font-semibold">Writing</h3>
        <ModuleResourcesPanel projectId={projectId} section="writing" canEdit={true} />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Writing project list ── */}
        <div className="w-52 border-r bg-gray-50 flex flex-col flex-shrink-0">
          <div className="p-3 border-b flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Projects</p>
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

        {/* ── Main area ── */}
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
              {/* ── File tree ── */}
              <div className="w-48 border-r overflow-y-auto flex-shrink-0 bg-gray-50 flex flex-col">
                <div className="px-3 py-2 border-b flex-shrink-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Files</p>
                </div>
                <div className="flex-1 overflow-y-auto p-1">
                  {tree.map(node => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      projectId={projectId}
                      writingProject={selected}
                      selectedPath={selectedPath}
                      onSelect={setSelectedPath}
                    />
                  ))}
                </div>
              </div>

              {/* ── Content panel ── */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {selectedPath ? (
                  <FilePreview
                    projectId={projectId}
                    writingId={selected.id}
                    path={selectedPath}
                  />
                ) : (
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-5 max-w-2xl">
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

                      <GitHubSyncPanel
                        projectId={projectId}
                        writingProject={selected}
                        onRefresh={refreshSelected}
                      />

                      <div className="p-4 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1">
                        <p className="font-medium text-gray-700">AI writing guidelines</p>
                        <p>• <code className="bg-white px-1 rounded">bibs/references.read_only.bib</code> is read-only — managed by Zotero</p>
                        <p>• <code className="bg-white px-1 rounded">bibs/ai_generated.bib</code> is for AI-suggested references</p>
                        <p>• Use <code className="bg-white px-1 rounded">\aicite{"{key}"}</code> for AI refs (shows in color), <code className="bg-white px-1 rounded">\cite{"{key}"}</code> for confirmed</p>
                        <p>• Confirm AI references in Papers → AI Generated tab</p>
                      </div>
                    </div>
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
