"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import type { Project } from "@/lib/types"

function timeAgo(iso: string | null): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteInput, setDeleteInput] = useState("")
  const [deleteError, setDeleteError] = useState("")

  useEffect(() => {
    api.get<Project[]>("/api/projects").then(setProjects).finally(() => setLoading(false))
  }, [])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    const project = await api.post<Project>("/api/projects", { name: newName })
    setProjects([...projects, project])
    setNewName("")
    setCreating(false)
  }

  function startDelete(project: Project, e: React.MouseEvent) {
    e.stopPropagation()
    setDeletingId(project.id)
    setDeleteInput("")
    setDeleteError("")
  }

  function cancelDelete() {
    setDeletingId(null)
    setDeleteInput("")
    setDeleteError("")
  }

  async function confirmDelete(project: Project) {
    if (deleteInput !== project.name) {
      setDeleteError("Project name doesn't match.")
      return
    }
    await api.delete(`/api/projects/${project.id}`)
    setProjects(prev => prev.filter(p => p.id !== project.id))
    cancelDelete()
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Projects</h2>
        <button
          onClick={() => setCreating(true)}
          className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800"
        >
          New project
        </button>
      </div>

      {creating && (
        <form onSubmit={createProject} className="flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            required
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button type="submit" className="bg-black text-white text-sm px-4 py-2 rounded-lg">
            Create
          </button>
          <button type="button" onClick={() => setCreating(false)} className="text-sm px-3 py-2 text-gray-500 hover:text-black">
            Cancel
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-gray-500">No projects yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => (
            <li key={project.id}>
              {deletingId === project.id ? (
                /* ── Delete confirmation inline ── */
                <div className="border border-red-200 rounded-xl px-5 py-4 bg-red-50 space-y-3">
                  <p className="text-sm font-medium text-red-700">
                    Delete <span className="font-bold">{project.name}</span>?
                  </p>
                  <p className="text-xs text-red-500">
                    This will permanently delete the project and all its contents. Type the project name to confirm.
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      autoFocus
                      value={deleteInput}
                      onChange={e => { setDeleteInput(e.target.value); setDeleteError("") }}
                      onKeyDown={e => { if (e.key === "Escape") cancelDelete() }}
                      placeholder={project.name}
                      className="flex-1 border border-red-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                    />
                    <button
                      onClick={() => confirmDelete(project)}
                      className="bg-red-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                      disabled={deleteInput !== project.name}
                    >
                      Delete
                    </button>
                    <button onClick={cancelDelete} className="text-sm px-3 py-1.5 text-gray-500 hover:text-black">
                      Cancel
                    </button>
                  </div>
                  {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                </div>
              ) : (
                /* ── Normal project card ── */
                <div className="group relative border rounded-xl hover:bg-gray-50 transition-colors">
                  <button
                    onClick={() => router.push(`/projects/${project.id}/papers`)}
                    className="w-full text-left px-5 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{project.name}</span>
                      <div className="flex items-center gap-3">
                        {project.last_edited_at && (
                          <span className="text-xs text-gray-400">
                            edited {timeAgo(project.last_edited_at)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 capitalize">{project.role}</span>
                      </div>
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-500 mt-1">{project.description}</p>
                    )}
                  </button>
                  {project.role === "admin" && (
                    <button
                      onClick={(e) => startDelete(project, e)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
