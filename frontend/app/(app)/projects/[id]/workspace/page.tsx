"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { AlertCircle, CheckCircle2, Copy, FileJson, FolderGit2, RefreshCw } from "lucide-react"
import { api } from "@/lib/api"
import SectionResourcesPanel from "@/components/SectionResourcesPanel"

type WorkspaceItem = {
  id: string
  type: string
  path: string
  title: string
  tags: string[]
  refs: string[]
}

type WorkspaceResponse = {
  project: { id: string; name: string; role: string }
  git_url: string
  manifest_path: string
  index_path: string
  workspace: {
    generated_at: string
    manifest: {
      agent_contract: { editable: string[]; system_owned: string[]; citation_syntax: string }
      folders: Record<string, string>
      extensions: Record<string, { root: string; preferred: string[] }>
    }
    counts: Record<string, number>
    items: WorkspaceItem[]
    issues: string[]
  }
}

export default function WorkspacePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [data, setData] = useState<WorkspaceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"" | "ensure" | "reindex">("")
  const [copied, setCopied] = useState("")

  async function load() {
    setLoading(true)
    try {
      setData(await api.get<WorkspaceResponse>(`/api/projects/${projectId}/workspace`))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId])

  const gitCommand = useMemo(() => {
    if (!data) return ""
    return `git clone ${data.git_url} ${data.project.name.replace(/\s+/g, "-").toLowerCase()}`
  }, [data])

  async function ensure() {
    setBusy("ensure")
    try {
      await api.post(`/api/projects/${projectId}/workspace/ensure`)
      await load()
    } finally {
      setBusy("")
    }
  }

  async function reindex() {
    setBusy("reindex")
    try {
      await api.post(`/api/projects/${projectId}/workspace/reindex`)
      await load()
    } finally {
      setBusy("")
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(""), 1600)
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading workspace…</div>
  if (!data) return <div className="p-8 text-sm text-red-500">Workspace not found</div>

  const { workspace } = data
  const editable = workspace.manifest.agent_contract.editable
  const systemOwned = workspace.manifest.agent_contract.system_owned

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FolderGit2 size={16} />
              Agent Workspace
            </div>
            <p className="mt-1 text-sm text-gray-500 max-w-3xl">
              This project repo is the shared source of truth. Agents edit normal folders; ResearchBuddy indexes,
              renders, and syncs through the system layer.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={ensure} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <CheckCircle2 size={14} /> {busy === "ensure" ? "Ensuring…" : "Ensure"}
            </button>
            <button onClick={reindex} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
              <RefreshCw size={14} className={busy === "reindex" ? "animate-spin" : ""} /> Reindex
            </button>
          </div>
        </div>

        {workspace.issues.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertCircle size={15} /> Workspace issues
            </div>
            <ul className="mt-2 space-y-1">
              {workspace.issues.map(issue => (
                <li key={issue} className="text-xs text-amber-700">{issue}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 size={15} /> Workspace schema is present and readable.
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-md border">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FolderGit2 size={15} /> Git endpoint
              </div>
              <button onClick={() => copy(gitCommand, "git")}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black">
                <Copy size={12} /> {copied === "git" ? "copied" : "copy command"}
              </button>
            </div>
            <div className="p-4 space-y-3">
              <code className="block rounded-md bg-gray-950 px-3 py-2 text-xs text-gray-100 overflow-x-auto">
                {gitCommand}
              </code>
              <p className="text-xs text-gray-500">
                Git clients need the same bearer-token authorization as the app. The endpoint is ready for cloud
                workers, teammates, and local agents that can provide auth headers.
              </p>
            </div>
          </div>

          <div className="rounded-md border">
            <div className="border-b px-4 py-3 flex items-center gap-2 text-sm font-medium">
              <FileJson size={15} /> System files
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Manifest</span>
                <code className="text-xs">{data.manifest_path}</code>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Index</span>
                <code className="text-xs">{data.index_path}</code>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">System owned</span>
                <code className="text-xs">{systemOwned.join(", ")}</code>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3">Editable Folders</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {editable.map(folder => (
              <div key={folder} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-medium">{folder}/</code>
                  <span className="text-xs text-gray-400">{workspace.counts[folder] ?? 0} files</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{workspace.manifest.folders[folder]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border">
            <div className="border-b px-4 py-3 text-sm font-medium">Extension Roots</div>
            <div className="divide-y">
              {Object.entries(workspace.manifest.extensions).map(([key, ext]) => (
                <div key={key} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{key.replaceAll("_", " ")}</span>
                    <code className="text-xs text-gray-500">{ext.root}/</code>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{ext.preferred.join(", ")}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border">
            <div className="border-b px-4 py-3 text-sm font-medium">Indexed Items</div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {workspace.items.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No indexed Markdown items yet.</p>
              ) : workspace.items.slice(0, 30).map(item => (
                <div key={item.path} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">{item.type}</span>
                  </div>
                  <code className="mt-1 block text-xs text-gray-500 truncate">{item.path}</code>
                  {item.refs.length > 0 && (
                    <p className="mt-1 text-xs text-blue-600">{item.refs.length} refs</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionResourcesPanel projectId={projectId} section="workspace" />
      </div>
    </div>
  )
}
