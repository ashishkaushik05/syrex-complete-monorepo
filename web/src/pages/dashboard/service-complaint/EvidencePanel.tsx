import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, ImageOff, ImagePlus, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { trpcMutation, trpcQuery } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'
import { timeAgo } from '@/lib/format'
import { SectionCard } from './shared'

export type AttachmentSummary = {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  uploadedById: string | null
  isConfirmed: boolean
  createdAt: string
}

type AttachmentPage = {
  items: AttachmentSummary[]
  nextCursor: string | null
}

const MAX_FILE_SIZE = 25 * 1024 * 1024

async function downloadSignedFile(url: string, fileName: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${fileName} could not be downloaded.`)

  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function EvidencePreview({
  attachment,
}: {
  attachment: Pick<AttachmentSummary, 'id' | 'fileName' | 'mimeType'>
}) {
  const isImage = attachment.mimeType.startsWith('image/')
  const previewQuery = useQuery({
    queryKey: ['service', 'evidence-preview', attachment.id],
    queryFn: () => trpcQuery<{ downloadUrl: string }>('attachments.download', { id: attachment.id }),
    enabled: isImage,
    staleTime: 4 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  })

  if (!isImage) {
    return (
      <div className="grid h-20 w-24 shrink-0 place-items-center rounded-lg bg-white text-slate-500">
        <FileText className="h-6 w-6" />
      </div>
    )
  }

  if (previewQuery.isLoading) {
    return <div className="h-20 w-24 shrink-0 animate-pulse rounded-lg bg-slate-200" aria-label={`Loading preview for ${attachment.fileName}`} />
  }

  if (previewQuery.isError || !previewQuery.data) {
    return (
      <div className="grid h-20 w-24 shrink-0 place-items-center rounded-lg bg-white text-slate-400">
        <ImageOff className="h-6 w-6" />
      </div>
    )
  }

  return (
    <button
      type="button"
      className="h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
      aria-label={`View ${attachment.fileName}`}
      onClick={() => window.open(previewQuery.data.downloadUrl, '_blank', 'noopener,noreferrer')}
    >
      <img
        className="h-full w-full object-cover"
        src={previewQuery.data.downloadUrl}
        alt={attachment.fileName}
        loading="lazy"
      />
    </button>
  )
}

export function EvidencePanel({
  complaintId,
  canWrite,
  committedEvidence,
  onStagedEvidenceChange,
}: {
  complaintId: string
  canWrite: boolean
  committedEvidence: Array<{
    id: string
    fileName: string
    mimeType: string
    fileSize: number
    createdAt: string
    formName: string
  }>
  onStagedEvidenceChange?: (attachments: AttachmentSummary[]) => void
}) {
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const queryKey = ['service', 'evidence', complaintId]
  const evidenceQuery = useQuery<AttachmentPage>({
    queryKey,
    queryFn: () => trpcQuery('attachments.list', {
      entityType: 'service_complaint',
      entityId: complaintId,
      isConfirmed: true,
      cursor: null,
      limit: 100,
    }),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (file.size <= 0) throw new Error('Choose a non-empty file.')
      if (file.size > MAX_FILE_SIZE) throw new Error('Each attachment must be 25 MiB or smaller.')
      if (!file.type) throw new Error('The selected file type could not be detected.')

      const pending = await trpcMutation<{
        attachment: AttachmentSummary
        upload: { uploadUrl: string }
      }>('attachments.createPending', {
        entityType: 'service_complaint',
        entityId: complaintId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        expiresInMinutes: 15,
      })
      const response = await fetch(pending.upload.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      })
      if (!response.ok) throw new Error(`${file.name} could not be uploaded. Please retry.`)
      await trpcMutation('attachments.confirm', { attachmentId: pending.attachment.id })
    },
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => setActionError(apiErrorMessage(error, 'Unable to upload attachment. Please retry.')),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => trpcMutation('attachments.remove', { id }),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => setActionError(apiErrorMessage(error, 'Unable to remove attachment.')),
  })

  async function downloadAttachment(attachment: Pick<AttachmentSummary, 'id' | 'fileName'>) {
    setActionError(null)
    setDownloadingId(attachment.id)
    try {
      const result = await trpcQuery<{ downloadUrl: string }>('attachments.download', {
        id: attachment.id,
      })
      await downloadSignedFile(result.downloadUrl, attachment.fileName)
    } catch (error) {
      setActionError(apiErrorMessage(error, 'Unable to open attachment.'))
    } finally {
      setDownloadingId(null)
    }
  }

  const attachments = [
    ...(evidenceQuery.data?.items ?? []).map((attachment) => ({
      ...attachment,
      sourceLabel: 'Complaint evidence',
      removable: canWrite,
    })),
    ...committedEvidence.map((attachment) => ({
      ...attachment,
      sourceLabel: `Committed with ${attachment.formName}`,
      removable: false,
    })),
  ]

  useEffect(() => {
    onStagedEvidenceChange?.(evidenceQuery.data?.items ?? [])
  }, [evidenceQuery.data?.items, onStagedEvidenceChange])

  return (
    <SectionCard title="Complaint Evidence">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Photos and documents attached by service staff.</p>
        {canWrite ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700">
            <ImagePlus className="h-4 w-4" />
            {uploadMutation.isPending ? 'Uploading...' : 'Add evidence'}
            <input
              className="sr-only"
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              disabled={uploadMutation.isPending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) uploadMutation.mutate(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
        ) : null}
      </div>

      {actionError ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </div>
      ) : null}

      {evidenceQuery.isLoading && committedEvidence.length === 0 ? (
        <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
      ) : null}
      {evidenceQuery.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <p>{apiErrorMessage(evidenceQuery.error, 'Unable to load complaint evidence.')}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => evidenceQuery.refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : null}
      {!evidenceQuery.isLoading && attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          No staff evidence attached.
        </p>
      ) : null}
      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-nowrap">
              <EvidencePreview attachment={attachment} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{attachment.fileName}</p>
                <p className="text-xs text-slate-500">
                  {Math.max(1, Math.round(attachment.fileSize / 1024))} KB · {timeAgo(attachment.createdAt)}
                </p>
                <p className="text-xs text-slate-400">{attachment.sourceLabel}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={downloadingId === attachment.id}
                onClick={() => downloadAttachment(attachment)}
              >
                <Download className="h-4 w-4" />
                <span>{downloadingId === attachment.id ? 'Opening...' : 'Download'}</span>
              </Button>
              {attachment.removable ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(attachment.id)}
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                  <span className="sr-only">Remove {attachment.fileName}</span>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  )
}
