"use client"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"

const TABS = [
  { label: "Home", href: "home" },
  { label: "Papers", href: "papers" },
  { label: "Meetings", href: "meetings" },
  { label: "Docs", href: "docs" },
  { label: "Writing", href: "writing" },
  { label: "Images", href: "images" },
  { label: "Prototype", href: "prototype" },
  { label: "Skills", href: "skills" },
  { label: "Coding", href: "coding" },
  { label: "Workspace", href: "workspace" },
]

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const path = usePathname()

  return (
    <div className="flex flex-col h-full">
      <nav className="border-b bg-white px-6 flex gap-1">
        {TABS.map((tab) => {
          const href = `/projects/${id}/${tab.href}`
          const active = path.includes(`/${tab.href}`)
          return (
            <Link
              key={tab.href}
              href={href}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-black"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}
