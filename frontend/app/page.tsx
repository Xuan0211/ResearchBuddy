import Link from "next/link"
import { ArrowRight, BookOpen, Bot, Cloud, FileText, FolderGit2, GitBranch, Layers3, Users } from "lucide-react"

const features = [
  {
    icon: FolderGit2,
    title: "One git workspace",
    text: "Papers, writing, docs, skills, prototypes, and images live in predictable folders that can be cloned, edited, pushed, and reindexed.",
  },
  {
    icon: Bot,
    title: "Agent-readable by default",
    text: "Each module carries its own docs and Skills, so local agents see the same context after clone that the web app uses.",
  },
  {
    icon: Cloud,
    title: "Syncs into real tools",
    text: "ResearchBuddy connects to Google Drive, Outlook-style meetings, Overleaf, Figma, GitHub, and Zotero without turning them into a separate silo.",
  },
]

const modules = ["Papers", "Writing", "Docs", "Skills", "Meetings", "Images", "Prototype", "Coding"]
const connectors = ["Google Drive", "Outlook", "Overleaf", "Figma", "GitHub", "Zotero"]

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <header className="border-b bg-white/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">ResearchBuddy</Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/help" className="text-gray-500 hover:text-black">Help</Link>
            <Link href="/login" className="text-gray-500 hover:text-black">Log in</Link>
            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-white">
              Get started <ArrowRight size={13} />
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Research workspace infrastructure</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            ResearchBuddy keeps human work and agent work in the same repo.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-gray-600">
            It is a project workspace for papers, writing, notes, meetings, prototypes, and coding workflows. The app stays usable for people, while the cloned git workspace stays legible to agents.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
              Open workspace <ArrowRight size={14} />
            </Link>
            <Link href="/help" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Read docs
            </Link>
          </div>
        </div>

        <div className="rounded-xl border bg-gray-50 p-4">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users size={15} /> Web workspace
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {modules.map(item => (
                    <div key={item} className="rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-600">{item}</div>
                  ))}
                </div>
              </div>
              <div className="hidden items-center px-1 text-[10px] uppercase tracking-wide text-gray-300 md:flex">sync</div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <GitBranch size={15} /> Git source of truth
                </div>
                <div className="mt-3 space-y-1.5 text-xs text-blue-800">
                  <p><code>papers/</code> with metadata and refs</p>
                  <p><code>writing/&lt;paper&gt;/</code> with tex/bib</p>
                  <p><code>*/skills/</code> and <code>*/docs/</code> for agents</p>
                  <p><code>.researchbuddy/</code> for sync/index contracts</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Bot size={15} /> Local agents
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-600">
                  Clone the repo, read module-local Skills and docs, edit normal files, then push back for humans and sync services.
                </p>
              </div>
              <div className="hidden items-center px-1 text-[10px] uppercase tracking-wide text-gray-300 md:flex">sync</div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Cloud size={15} /> External tools
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {connectors.map(item => (
                    <span key={item} className="rounded-full border bg-white px-2.5 py-1 text-xs text-gray-600">{item}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-gray-50">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-3">
          {features.map(feature => (
            <div key={feature.title} className="rounded-lg border bg-white p-5">
              <feature.icon size={18} className="text-blue-600" />
              <h2 className="mt-3 text-sm font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-10 md:grid-cols-3">
        <div className="md:col-span-1">
          <p className="text-sm font-semibold">How teams use it</p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            ResearchBuddy is not another private editor. It is a structured workspace over the files and tools a research team already uses.
          </p>
        </div>
        <div className="grid gap-3 md:col-span-2">
          <div className="flex gap-3 rounded-lg border p-4">
            <BookOpen size={17} className="mt-0.5 text-blue-600" />
            <div>
              <p className="text-sm font-medium">Read and write with shared context</p>
              <p className="mt-1 text-sm text-gray-600">Papers, Zotero refs, AI citations, docs, and writing projects stay linked without hiding the underlying tex, bib, and Markdown files.</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border p-4">
            <Layers3 size={17} className="mt-0.5 text-blue-600" />
            <div>
              <p className="text-sm font-medium">Attach module-local Skills and docs</p>
              <p className="mt-1 text-sm text-gray-600">A writing project can carry writing rules; a prototype can carry implementation constraints; a paper workflow can carry screening logic.</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border p-4">
            <FileText size={17} className="mt-0.5 text-blue-600" />
            <div>
              <p className="text-sm font-medium">Sync without losing the repo</p>
              <p className="mt-1 text-sm text-gray-600">Google Drive views and external links are convenience layers. The canonical workspace remains cloneable and recoverable.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
