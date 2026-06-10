"use client"
import { useParams } from "next/navigation"
import ModuleLinksPanel from "@/components/ModuleLinksPanel"
import ModuleResourcesPanel from "@/components/ModuleResourcesPanel"

export default function ImagesPage() {
  const { id: projectId } = useParams<{ id: string }>()

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">Images</h2>
      </div>
      <ModuleResourcesPanel projectId={projectId} section="images" canEdit={true} />
      <ModuleLinksPanel
        projectId={projectId}
        section="images"
        kind="figma"
        title="Figma links"
        labelPlaceholder="Figma file or frame"
        urlPlaceholder="https://figma.com/..."
      />
    </div>
  )
}
