"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock,
  Copy, FolderGit2, FolderOpen, RefreshCw, RotateCcw,
  Terminal, UploadCloud,
} from "lucide-react"
import { api } from "@/lib/api"

// ── types ────────────────────────────────────────────────────────────────────

type WorkspaceItem = {
  id: string; type: string; path: string; title: string; tags: string[]; refs: string[]
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
type GitCommit = {
  sha: string; full_sha: string; message: string; author: string; date: string
}

// ── file-tree helpers ────────────────────────────────────────────────────────

type DirNode = { dirs: Record<string, DirNode>; files: string[] }

function buildTree(paths: string[]): DirNode {
  const root: DirNode = { dirs: {}, files: [] }
  for (const p of paths) {
    const parts = p.split("/")
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!node.dirs[seg]) node.dirs[seg] = { dirs: {}, files: [] }
      node = node.dirs[seg]
    }
    node.files.push(parts[parts.length - 1])
  }
  return root
}

function countTree(node: DirNode): number {
  let n = node.files.length
  for (const child of Object.values(node.dirs)) n += countTree(child)
  return n
}

function TreeDir({
  name, node, depth = 0, defaultOpen = false, description,
}: {
  name: string; node: DirNode; depth?: number; defaultOpen?: boolean; description?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const count = countTree(node)
  const subdirs = Object.entries(node.dirs).sort(([a], [b]) => a.localeCompare(b))
  const files = [...node.files].sort()

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1 py-0.5 hover:bg-gray-50 rounded text-left"
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        {open ? <ChevronDown size={12} className="text-gray-400 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
        <FolderOpen size={13} className="text-amber-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-gray-800">{name}/</span>
          {depth === 0 && description && (
            <span className="ml-2 text-[10px] text-gray-400">{description}</span>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-gray-400 pr-2">{count}</span>
      </button>
      {open && (
        <div>
          {subdirs.map(([n, child]) => (
            <TreeDir key={n} name={n} node={child} depth={depth + 1} />
          ))}
          {files.map(f => (
            <div
              key={f}
              className="py-0.5 text-xs text-gray-500 truncate"
              style={{ paddingLeft: (depth + 1) * 14 + 18 }}
            >
              {f}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [data, setData] = useState<WorkspaceResponse | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"" | "ensure" | "reindex">("")
  const [copied, setCopied] = useState("")
  const [revertingSha, setRevertingSha] = useState<string | null>(null)
  const [revertConfirm, setRevertConfirm] = useState<string | null>(null)
  const [showTree, setShowTree] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [ws, f, h] = await Promise.all([
        api.get<WorkspaceResponse>(`/api/projects/${projectId}/workspace`),
        api.get<{ files: string[] }>(`/api/projects/${projectId}/workspace/files`),
        api.get<{ commits: GitCommit[] }>(`/api/projects/${projectId}/workspace/history`),
      ])
      setData(ws)
      setFiles(f.files)
      setCommits(h.commits)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId])

  const tree = useMemo(() => buildTree(files), [files])

  const gitUrl = data?.git_url ?? ""
  const projectSlug = (data?.project.name ?? "project").replace(/\s+/g, "-").toLowerCase()

  const cloneCmd = `git clone ${gitUrl} ${projectSlug}`
  const pushCmds = `git add .\ngit commit -m "Your message"\ngit pull --rebase\ngit push`

  async function ensure() {
    setBusy("ensure")
    try { await api.post(`/api/projects/${projectId}/workspace/ensure`); await load() }
    finally { setBusy("") }
  }

  async function reindex() {
    setBusy("reindex")
    try { await api.post(`/api/projects/${projectId}/workspace/reindex`); await load() }
    finally { setBusy("") }
  }

  async function doRevert(commit: GitCommit) {
    setRevertingSha(commit.full_sha)
    try {
      await api.post(`/api/projects/${projectId}/workspace/revert`, {
        full_sha: commit.full_sha,
        message: commit.message,
      })
      setRevertConfirm(commit.sha)
      await load()
    } catch (e: unknown) {
      alert(`Revert failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRevertingSha(null)
      setTimeout(() => setRevertConfirm(null), 3000)
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(""), 1600)
  }

  function fmtDate(iso: string) {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
        " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    } catch { return iso }
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading workspace…</div>
  if (!data) return <div className="p-8 text-sm text-red-500">Workspace not found</div>

  const { workspace } = data
  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

        {/* ── header ── */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FolderGit2 size={16} /> Git Workspace
            </div>
            <p className="mt-1 text-sm text-gray-500 max-w-2xl">
              Every project is a real git repo. Clone it to work locally with any editor or AI agent; push changes back and the UI updates instantly.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={ensure} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <CheckCircle2 size={13} /> {busy === "ensure" ? "Ensuring…" : "Ensure"}
            </button>
            <button onClick={reindex} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
              <RefreshCw size={13} className={busy === "reindex" ? "animate-spin" : ""} /> Reindex
            </button>
          </div>
        </div>

        {/* ── status ── */}
        {workspace.issues.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertCircle size={14} /> Workspace issues
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {workspace.issues.map(issue => (
                <li key={issue} className="text-xs text-amber-700">{issue}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 size={14} /> Workspace structure is present and readable.
          </div>
        )}

        {/* ── git access ── */}
        <div className="rounded-md border">
          <div className="border-b px-4 py-3 flex items-center gap-2 text-sm font-medium">
            <Terminal size={14} /> Git access
          </div>
          <div className="p-4 space-y-4">

            {/* clone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">1 · Clone</span>
                <button onClick={() => copy(cloneCmd, "clone")}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-black">
                  <Copy size={11} /> {copied === "clone" ? "copied" : "copy"}
                </button>
              </div>
              <code className="block rounded bg-gray-950 px-3 py-2 text-xs text-gray-100 whitespace-pre overflow-x-auto">
                {cloneCmd}
              </code>
            </div>

            {/* push — step 1: navigate */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">2 · Enter the folder</span>
              </div>
              <code className="block rounded bg-gray-950 px-3 py-2 text-xs text-gray-100 whitespace-pre overflow-x-auto">
                {`cd ${projectSlug}`}
              </code>
            </div>

            {/* push — step 2: git ops */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">3 · Commit &amp; push</span>
                <button onClick={() => copy(pushCmds, "push")}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-black">
                  <Copy size={11} /> {copied === "push" ? "copied" : "copy"}
                </button>
              </div>
              <code className="block rounded bg-gray-950 px-3 py-2 text-xs text-gray-100 whitespace-pre overflow-x-auto">
                {`git add .\ngit commit -m "Your message"\ngit pull --rebase   # sync remote changes first\ngit push`}
              </code>
            </div>

            {/* one-time setup tip */}
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 space-y-1">
              <p className="font-medium">One-time setup (recommended)</p>
              <p className="text-blue-700">
                Run this once so <code className="rounded bg-blue-100 px-1">git pull</code> always rebases automatically — no need for <code className="rounded bg-blue-100 px-1">--rebase</code> every time:
              </p>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 rounded bg-blue-950 px-2 py-1 text-blue-100 font-mono">
                  git config --global pull.rebase true
                </code>
                <button
                  onClick={() => copy("git config --global pull.rebase true", "rebase-tip")}
                  className="shrink-0 inline-flex items-center gap-1 text-blue-600 hover:text-blue-900"
                >
                  <Copy size={11} /> {copied === "rebase-tip" ? "copied" : "copy"}
                </button>
              </div>
            </div>

          </div>
          <div className="border-t px-4 py-3 flex items-start gap-2 text-xs text-gray-500">
            <UploadCloud size={13} className="mt-0.5 shrink-0 text-gray-400" />
            Authenticate with your account email + password, or an API key (<code className="bg-gray-100 px-1 rounded">rb_…</code>) as the password.
            Generate API keys in <strong>Settings → API Keys</strong>.
          </div>
        </div>

        {/* ── file tree (collapsible) ── */}
        <div className="rounded-md border">
          <button
            onClick={() => setShowTree(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              {showTree ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <FolderOpen size={14} /> File tree
              <span className="text-xs text-gray-400 font-normal ml-1">({files.length} files)</span>
            </div>
            <span className="text-xs text-gray-400">current HEAD</span>
          </button>
          {showTree && (
            <div className="border-t px-2 py-2 max-h-96 overflow-y-auto">
              {Object.entries(tree.dirs)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, node]) => (
                  <TreeDir
                    key={name} name={name} node={node} defaultOpen={false}
                    description={workspace.manifest.folders[name]}
                  />
                ))}
              {tree.files.map(f => (
                <div key={f} className="py-0.5 pl-4 text-xs text-gray-500">{f}</div>
              ))}
            </div>
          )}
        </div>

        {/* ── version history (collapsible) ── */}
        <div className="rounded-md border">
          <button
            onClick={() => setShowHistory(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Clock size={14} /> Version history
              <span className="text-xs text-gray-400 font-normal ml-1">
                ({commits.length} user push{commits.length !== 1 ? "es" : ""})
              </span>
            </div>
            <span className="text-xs text-gray-400">your git pushes only</span>
          </button>
          {showHistory && (
            <div className="border-t divide-y max-h-96 overflow-y-auto">
              {commits.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-500">No user commits yet. Push some changes via git.</p>
              ) : commits.map(c => (
                <div key={c.full_sha} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{c.message}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                      <code className="bg-gray-100 px-1 rounded">{c.sha}</code>
                      <span>{c.author}</span>
                      <span>{fmtDate(c.date)}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {revertConfirm === c.sha ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 size={12} /> Reverted
                      </span>
                    ) : (
                      <button
                        onClick={() => doRevert(c)}
                        disabled={revertingSha !== null}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        title="Create a new commit that restores the repo to this version"
                      >
                        <RotateCcw size={11} className={revertingSha === c.full_sha ? "animate-spin" : ""} />
                        {revertingSha === c.full_sha ? "Reverting…" : "Revert to this"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
