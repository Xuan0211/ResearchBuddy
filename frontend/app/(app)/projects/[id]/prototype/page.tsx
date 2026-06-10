"use client"
import { useParams } from "next/navigation"
import ModuleLinksPanel from "@/components/ModuleLinksPanel"
import ModuleResourcesPanel from "@/components/ModuleResourcesPanel"

export default function PrototypePage() {
  const { id: projectId } = useParams<{ id: string }>()

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">Prototype</h2>
      </div>
      <ModuleResourcesPanel projectId={projectId} section="prototype" canEdit={true} />
      <ModuleLinksPanel
        projectId={projectId}
        section="prototype"
        kind="github"
        title="GitHub links"
        labelPlaceholder="Repository or branch"
        urlPlaceholder="https://github.com/..."
      />
    </div>
  )
}
