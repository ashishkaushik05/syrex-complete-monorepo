import { useQuery } from '@tanstack/react-query'
import { ImageOff } from 'lucide-react'
import { portalApi } from '../lib/api'
import type { PortalAttachment } from '../types'

export function AttachmentImagePreview({
  complaintId,
  attachment,
}: {
  complaintId: string
  attachment: PortalAttachment
}) {
  const previewQuery = useQuery({
    queryKey: ['attachment-preview', complaintId, attachment.id],
    queryFn: () => portalApi.attachmentDownload(complaintId, attachment.id),
    staleTime: 4 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  })

  if (previewQuery.isLoading) {
    return <div className="attachment-preview attachment-preview-loading" aria-label={`Loading preview for ${attachment.fileName}`} />
  }

  if (previewQuery.isError || !previewQuery.data) {
    return <div className="attachment-preview attachment-preview-fallback"><ImageOff aria-hidden="true" /></div>
  }

  return (
    <button
      type="button"
      className="attachment-preview-button"
      aria-label={`View ${attachment.fileName}`}
      onClick={() => window.open(previewQuery.data.downloadUrl, '_blank', 'noopener,noreferrer')}
    >
      <img
        className="attachment-preview"
        src={previewQuery.data.downloadUrl}
        alt={attachment.fileName}
        loading="lazy"
      />
    </button>
  )
}
