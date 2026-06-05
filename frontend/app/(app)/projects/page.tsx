"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { Project } from "@/lib/types"

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(true)

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
              <button
                onClick={() => router.push(`/projects/${project.id}/papers`)}
                className="w-full text-left border rounded-xl px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-xs text-gray-400 capitalize">{project.role}</span>
                </div>
                {project.description && <p className="text-sm text-gray-500 mt-1">{project.description}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
