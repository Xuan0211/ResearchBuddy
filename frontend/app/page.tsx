import Link from "next/link"
import {
  ArrowRight,
  Bot,
  BookOpen,
  CheckCircle2,
  Cloud,
  FileText,
  FolderGit2,
  GitBranch,
  Layers3,
  Sparkles,
  Users,
} from "lucide-react"

const promises = [
  {
    label: "01",
    title: "Everyone works in the same context.",
    text: "Project docs, module Skills, contacts, timelines, and writing rules are shared by humans and agents instead of being scattered across chats.",
    accent: "border-blue-200 bg-blue-50 text-blue-800",
  },
  {
    label: "02",
    title: "It fits the workflow you already use.",
    text: "Google Drive, Outlook, Overleaf, Figma, GitHub, and Zotero stay connected and synced so collaborators can keep using familiar tools.",
    accent: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    label: "03",
    title: "Any agent can pick up the repo.",
    text: "Clone the workspace locally, read the folder-level docs and Skills, make changes, then push them back through a git-like loop.",
    accent: "border-amber-200 bg-amber-50 text-amber-800",
  },
]

const workflowTools = ["Google Drive", "Outlook", "Overleaf", "Figma", "GitHub", "Zotero"]
const repoFolders = ["papers/", "writing/", "docs/", "skills/", "prototype/", "images/"]
const steps = [
  {
    icon: BookOpen,
    title: "Create a research project",
    text: "Add papers, docs, meetings, writing projects, codebooks, prototype links, and image assets.",
  },
  {
    icon: Layers3,
    title: "Attach docs and Skills",
    text: "Give every module its own instructions so teammates and agents know the local rules before acting.",
  },
  {
    icon: Cloud,
    title: "Sync to real tools",
    text: "Publish human-friendly views to Drive, keep Zotero and Overleaf close, and link Figma or GitHub where the work already lives.",
  },
  {
    icon: Bot,
    title: "Let agents work locally",
    text: "An agent clones the workspace, edits normal files, follows module conventions, and pushes back for review.",
  },
]

function PromiseCard({ item }: { item: (typeof promises)[number] }) {
  return (
    <div className="rb-rise rounded-lg border bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)]">
      <div className={`mb-4 inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold ${item.accent}`}>
        {item.label}
      </div>
      <h2 className="text-lg font-semibold leading-snug">{item.title}</h2>
      <p className="mt-3 text-sm leading-6 text-gray-600">{item.text}</p>
    </div>
  )
}

function WorkspaceCanvas() {
  return (
    <div className="rb-workspace-stage relative min-h-[620px] overflow-hidden rounded-lg border bg-[#f8fafc] p-4 shadow-[0_28px_90px_rgba(15,23,42,0.12)] sm:min-h-[430px]">
      <div className="absolute inset-0 rb-grid-bg" />
      <div className="absolute left-4 right-4 top-6 rb-float rounded-lg border bg-white p-4 shadow-sm sm:left-8 sm:right-auto sm:top-7">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users size={15} className="text-blue-600" /> Human workspace
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {["Papers", "Writing", "Docs", "Timeline", "Meetings", "Coding"].map(item => (
            <span key={item} className="rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-600">{item}</span>
          ))}
        </div>
      </div>

      <div className="absolute left-4 right-4 top-44 rb-float rb-delay-1 rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm sm:left-auto sm:right-8 sm:top-9">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
          <FolderGit2 size={15} /> Shared context
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-blue-800">
          <p>project docs</p>
          <p>team Skills</p>
          <p>module rules</p>
          <p>git history</p>
        </div>
      </div>

      <div className="absolute bottom-44 left-4 right-4 rb-float rb-delay-2 rounded-lg border bg-white p-4 shadow-sm sm:bottom-8 sm:left-10 sm:right-auto">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bot size={15} className="text-amber-600" /> Local agents
        </div>
        <div className="mt-3 rounded-md bg-gray-950 px-3 py-2 font-mono text-[11px] leading-5 text-gray-100">
          git clone project<br />
          read */skills<br />
          edit docs + tex<br />
          push changes
        </div>
      </div>

      <div className="absolute bottom-6 left-4 right-4 rb-float rb-delay-3 rounded-lg border bg-white p-4 shadow-sm sm:left-auto sm:right-8 sm:bottom-9">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Cloud size={15} className="text-emerald-600" /> Existing tools
        </div>
        <div className="mt-3 flex max-w-56 flex-wrap gap-2">
          {workflowTools.map(item => (
            <span key={item} className="rounded-full border bg-white px-2 py-1 text-[11px] text-gray-600">{item}</span>
          ))}
        </div>
      </div>

      <div className="rb-flow-line rb-flow-line-a hidden sm:block" />
      <div className="rb-flow-line rb-flow-line-b hidden sm:block" />
      <div className="rb-flow-line rb-flow-line-c hidden sm:block" />
      <div className="rb-flow-dot rb-flow-dot-a hidden sm:block" />
      <div className="rb-flow-dot rb-flow-dot-b hidden sm:block" />
      <div className="rb-flow-dot rb-flow-dot-c hidden sm:block" />

      <div className="absolute left-1/2 top-1/2 hidden w-52 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white/95 p-4 text-center shadow-[0_22px_70px_rgba(37,99,235,0.18)] sm:block">
        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-black text-white">
          <Sparkles size={16} />
        </div>
        <p className="text-sm font-semibold">ResearchBuddy</p>
        <p className="mt-1 text-xs leading-5 text-gray-500">one context layer for people, tools, and agents</p>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-black text-white">R</span>
            ResearchBuddy
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/help" className="text-gray-500 hover:text-black">Help</Link>
            <Link href="/login" className="hidden text-gray-500 hover:text-black sm:inline">Log in</Link>
            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-white">
              Get started <ArrowRight size={13} />
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 rb-hero-grid" />
        <div className="mx-auto max-w-7xl px-6 pb-12 pt-14 lg:pb-16">
          <div className="max-w-4xl">
            <p className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Git-backed research workspace for human-agent teams
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.05] sm:mt-6 sm:text-6xl lg:text-7xl">
              Keep the whole research team, every tool, and every agent in one working context.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">
              ResearchBuddy turns a research project into a shared workspace that humans can use in the browser and agents can use after cloning the repo.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white">
                Start from a project <ArrowRight size={14} />
              </Link>
              <Link href="/help" className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                See how it works
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="grid gap-4">
              {promises.map(item => <PromiseCard key={item.label} item={item} />)}
            </div>
            <WorkspaceCanvas />
          </div>
        </div>
      </section>

      <section className="border-b bg-gray-950 py-4 text-white">
        <div className="rb-marquee mx-auto flex max-w-7xl overflow-hidden px-6 text-sm">
          <div className="rb-marquee-track flex min-w-full gap-3">
            {[...workflowTools, ...repoFolders, "shared docs", "module Skills", "agent clone", "Drive sync"].map(item => (
              <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white/85">{item}</span>
            ))}
          </div>
          <div className="rb-marquee-track flex min-w-full gap-3" aria-hidden="true">
            {[...workflowTools, ...repoFolders, "shared docs", "module Skills", "agent clone", "Drive sync"].map(item => (
              <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white/85">{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="text-sm font-semibold text-blue-600">How to use it</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">A clear loop for people, tools, and agents.</h2>
            <p className="mt-4 text-sm leading-6 text-gray-600">
              The browser gives humans an organized workspace. The repository gives agents a concrete file system contract. Sync keeps existing tools useful.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-lg border bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <step.icon size={18} className="text-blue-600" />
                  <span className="text-xs font-semibold text-gray-300">0{index + 1}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-lg border bg-white p-6">
              <GitBranch size={19} className="text-blue-600" />
              <h3 className="mt-4 text-lg font-semibold">Git as the substrate</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                The canonical state is a repo, not a hidden app database. Changes can be reviewed, pushed, pulled, and recovered.
              </p>
            </div>
            <div className="rounded-lg border bg-white p-6">
              <FileText size={19} className="text-emerald-600" />
              <h3 className="mt-4 text-lg font-semibold">Human-friendly sync</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Docs can sync into Google Drive, citations stay close to Zotero, and writing can keep Overleaf links without forcing people into a new editor.
              </p>
            </div>
            <div className="rounded-lg border bg-white p-6">
              <CheckCircle2 size={19} className="text-amber-600" />
              <h3 className="mt-4 text-lg font-semibold">Module-level rules</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Skills and docs sit beside the work they govern, so every section can explain its own conventions to humans and agents.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
