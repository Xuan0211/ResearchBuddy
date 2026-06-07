import Link from "next/link"

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link href="/" className="font-semibold text-sm hover:text-gray-600">
          ResearchBuddy
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">Documentation</span>
          <Link href="/login" className="text-sm text-gray-500 hover:text-black border rounded-lg px-3 py-1.5">
            Sign in
          </Link>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 49px)" }}>
        {children}
      </div>
    </div>
  )
}
