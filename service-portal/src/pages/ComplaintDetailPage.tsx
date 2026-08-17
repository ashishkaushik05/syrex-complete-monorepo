import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, Download, ImagePlus, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AttachmentImagePreview } from '../components/AttachmentImagePreview'
import { StatusBadge } from '../components/StatusBadge'
import { apiErrorMessage, portalApi } from '../lib/api'
import { downloadSignedFile } from '../lib/download'
import { timelineLabel } from '../lib/status'
import type { PortalAttachment } from '../types'

export function ComplaintDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [uploadNotice, setUploadNotice] = useState(
    () => (location.state as { uploadNotice?: string } | null)?.uploadNotice || '',
  )
  const [actionError, setActionError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!(location.state as { uploadNotice?: string } | null)?.uploadNotice) return
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])
  const query = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => portalApi.getComplaint(id),
    enabled: Boolean(id),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  const update = useMutation({
    mutationFn: (description: string) => portalApi.updateComplaint(id, description),
    onSuccess: (complaint) => {
      queryClient.setQueryData(['complaint', id], complaint)
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      setEditing(false)
      setActionError('')
    },
    onError: (error) => setActionError(apiErrorMessage(error)),
  })
  const cancel = useMutation({
    mutationFn: () => portalApi.cancelComplaint(id),
    onSuccess: (complaint) => {
      queryClient.setQueryData(['complaint', id], complaint)
      queryClient.invalidateQueries({ queryKey: ['complaints'] })
      setConfirmCancel(false)
      setActionError('')
    },
    onError: (error) => setActionError(apiErrorMessage(error)),
  })

  if (query.isLoading) return <div className="page-state">Loading complaint...</div>
  if (query.isError || !query.data) return <div className="empty-card"><h2>Complaint unavailable</h2><p>{apiErrorMessage(query.error)}</p><div className="form-actions"><button className="secondary-button" onClick={() => query.refetch()}>Try again</button><Link className="secondary-button link-button" to="/complaints">Back to complaints</Link></div></div>
  const complaint = query.data

  async function downloadAttachment(attachment: PortalAttachment) {
    setActionError('')
    try {
      const result = await portalApi.attachmentDownload(id, attachment.id)
      await downloadSignedFile(result.downloadUrl, attachment.fileName)
    } catch (error) {
      setActionError(apiErrorMessage(error))
    }
  }

  async function uploadAttachment(file: File | undefined) {
    if (!file) return
    setActionError('')
    setUploading(true)
    try {
      const pending = await portalApi.createAttachment(id, file)
      const upload = await fetch(pending.upload.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      })
      if (!upload.ok) throw new Error(`${file.name} could not be uploaded.`)
      await portalApi.confirmAttachment(id, pending.attachment.id)
      await query.refetch()
    } catch (error) {
      setActionError(`${apiErrorMessage(error)} Please retry.`)
    } finally {
      setUploading(false)
    }
  }

  async function removeAttachment(attachmentId: string) {
    setActionError('')
    try {
      await portalApi.removeAttachment(id, attachmentId)
      await query.refetch()
    } catch (error) {
      setActionError(apiErrorMessage(error))
    }
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    update.mutate(String(data.get('description')))
  }

  return (
    <section className="detail-page">
      <Link className="back-link" to="/complaints"><ArrowLeft size={17} /> Back to complaints</Link>
      <div className="detail-header panel">
        <div><p className="complaint-number">{complaint.complaintNumber}</p><h1>{complaint.title || complaint.issueCategory}</h1><p>{complaint.issueCategory}</p></div>
        <div className="detail-status"><StatusBadge status={complaint.status} /><button className="text-button" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={15} /> Refresh</button></div>
      </div>
      {uploadNotice && (
        <div className="form-notice" role="status">
          <span>{uploadNotice}</span>
          <button type="button" onClick={() => setUploadNotice('')} aria-label="Dismiss upload notice">Dismiss</button>
        </div>
      )}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      <div className="detail-grid">
        <div className="detail-main">
          <article className="panel">
            <div className="panel-heading"><h2>Issue summary</h2>{complaint.canEdit && !editing && <button className="text-button" onClick={() => setEditing(true)}>Edit description</button>}</div>
            {editing ? (
              <form className="form-stack" onSubmit={submitEdit}>
                <label>Description<textarea name="description" rows={5} defaultValue={complaint.description || ''} required /></label>
                <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button className="primary-button" disabled={update.isPending}>{update.isPending ? 'Saving...' : 'Save'}</button></div>
              </form>
            ) : <p className="long-copy">{complaint.description || 'No description was provided.'}</p>}
            <dl className="info-grid">
              <div><dt>SKU</dt><dd>{complaint.sku}</dd></div><div><dt>Serial number</dt><dd>{complaint.serialNumber}</dd></div>
              <div><dt>Customer</dt><dd>{complaint.customerName || 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{complaint.customerPhone || 'Not provided'}</dd></div>
              {complaint.complainantType === 'on_behalf_of' && <><div><dt>Raised for</dt><dd>{complaint.thirdPartyName}</dd></div><div><dt>Their phone</dt><dd>{complaint.thirdPartyPhone}</dd></div></>}
            </dl>
          </article>

          <article className="panel">
            <div className="panel-heading"><h2>Progress</h2><span className="muted-small">Updates refresh every 30 seconds</span></div>
            {complaint.timeline.length === 0 ? <p className="muted">No progress updates yet.</p> : (
              <ol className="timeline">{complaint.timeline.map((item, index) => <li key={`${item.action}-${item.createdAt}-${index}`}><span className="timeline-dot" /><div><strong>{timelineLabel(item.action)}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div></li>)}</ol>
            )}
          </article>

          <article className="panel">
            <div className="panel-heading">
              <h2>Attachments</h2>
              <label className="text-button upload-action">
                <ImagePlus size={16} /> {uploading ? 'Uploading...' : 'Add photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  disabled={uploading}
                  onChange={(event) => {
                    void uploadAttachment(event.target.files?.[0])
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
            {complaint.attachments.length === 0 ? <p className="muted">No photos uploaded.</p> : (
              <div className="attachment-list">
                {complaint.attachments.map((attachment) => (
                  <div className="attachment-row" key={attachment.id}>
                    <AttachmentImagePreview complaintId={id} attachment={attachment} />
                    <div className="attachment-copy">
                      <strong>{attachment.fileName}</strong>
                      <small>{Math.max(1, Math.round(attachment.fileSize / 1024))} KB</small>
                    </div>
                    <button className="attachment-download" onClick={() => downloadAttachment(attachment)}>
                      <Download size={17} /> Download
                    </button>
                    <button className="attachment-remove" aria-label={`Remove ${attachment.fileName}`} onClick={() => removeAttachment(attachment.id)}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>

        <aside className="detail-side">
          <article className="panel side-card"><span className="side-icon"><CalendarDays /></span><div><h2>Raised</h2><p>{new Date(complaint.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</p></div></article>
          <article className="panel side-card"><span className="side-icon"><UserRound /></span><div><h2>Assigned engineer</h2><p>{complaint.assignedEngineer ? complaint.assignedEngineer.name : 'Assignment pending'}</p>{complaint.assignedEngineer && <small>{complaint.assignedEngineer.roleLabel}</small>}</div></article>
          <article className="panel warranty-card"><span className="side-icon"><ShieldCheck /></span><h2>Warranty</h2>{complaint.warranty ? <><strong className="warranty-status">{complaint.warranty.status}</strong>{complaint.warranty.reason && <p>{complaint.warranty.reason}</p>}{complaint.warranty.replacement && <div className="replacement-box"><small>{complaint.warranty.replacement.type === 'order' ? 'Replacement order' : 'Replacement invoice'}</small><strong>{complaint.warranty.replacement.reference}</strong><span>{complaint.warranty.replacement.status}</span></div>}</> : <p>Awaiting assessment</p>}</article>
          {complaint.latestTest && <article className="panel"><h2>Latest test</h2><p className="long-copy">{complaint.latestTest.summary}</p><small>{new Date(complaint.latestTest.submittedAt).toLocaleString()}</small></article>}
          {complaint.canCancel && <article className="panel danger-panel"><h2>Need to withdraw?</h2>{confirmCancel ? <><p>This closes the complaint and cannot be undone from the portal.</p><div className="form-actions"><button className="secondary-button" onClick={() => setConfirmCancel(false)}>Keep complaint</button><button className="danger-button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Cancelling...' : 'Cancel complaint'}</button></div></> : <><p>You can cancel while it is still submitted.</p><button className="text-button danger-text" onClick={() => setConfirmCancel(true)}>Cancel this complaint</button></>}</article>}
        </aside>
      </div>
    </section>
  )
}
