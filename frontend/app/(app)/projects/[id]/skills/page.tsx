"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Archive, Download, Eye, Trash2, Upload } from "lucide-react"
import { api } from "@/lib/api"
import type { ProjectSkill } from "@/lib/types"

export default function SkillsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [skills, setSkills] = useState<ProjectSkill[]>([])
  const [selected, setSelected] = useState<ProjectSkill | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setSkills(await api.get<ProjectSkill[]>(`/api/projects/${projectId}/skills`))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId])

  async function viewSkill(skill: ProjectSkill) {
    setSelected(await api.get<ProjectSkill>(`/api/projects/${projectId}/skills/${skill.id}`))
  }

  async function deleteSkill(skill: ProjectSkill) {
    if (!confirm(`Delete "${skill.title}" from the project repository?`)) return
    await api.delete(`/api/projects/${projectId}/skills/${skill.id}`)
    if (selected?.id === skill.id) setSelected(null)
    await load()
  }

  function later() {
    alert("后续开发")
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading skills…</div>

  return (
    <div className="flex h-full overflow-hidden bg-white">
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium">Skills</h3>
            <p className="mt-1 max-w-2xl text-xs text-gray-500">
              Skills are read-only in the cloud UI. Edit them locally under <code>skills/</code>, then push through git.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={later} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              <Upload size={13} /> Upload zip
            </button>
            <button onClick={later} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              <Download size={13} /> Download zip
            </button>
          </div>
        </div>

        {skills.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Archive size={30} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No skills found.</p>
            <p className="mt-1 text-xs">Add skills locally under skills/ and push them to this project.</p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {skills.map(skill => (
              <li key={skill.id} className="rounded-md border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{skill.title}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-gray-500">{skill.description || skill.path}</p>
                    <p className="mt-2 truncate text-[11px] text-gray-400">{skill.path}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => viewSkill(skill)} title="View" className="rounded p-1 text-gray-400 hover:bg-gray-50 hover:text-black">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => deleteSkill(skill)} title="Delete" className="rounded p-1 text-gray-400 hover:bg-gray-50 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {skill.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {skill.tags.map(tag => <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{tag}</span>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {selected && (
        <aside className="w-[420px] border-l bg-gray-50 p-4 overflow-y-auto">
          <div className="mb-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold">{selected.title}</h4>
              <p className="mt-1 text-xs text-gray-500">{selected.description}</p>
              <p className="mt-1 text-[11px] text-gray-400">{selected.path}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-black">Close</button>
          </div>
          <pre className="whitespace-pre-wrap rounded-md border bg-white p-3 text-xs leading-5 text-gray-700">
            {selected.content}
          </pre>
        </aside>
      )}
    </div>
  )
}
