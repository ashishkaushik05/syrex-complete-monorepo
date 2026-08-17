import { ArrowLeft, ImagePlus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth-context'
import { ProductPicker } from '../components/ProductPicker'
import { apiErrorMessage, portalApi } from '../lib/api'
import { buildComplaintInput } from '../lib/complaint-input'
import type { PortalCatalogProduct } from '../types'

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

export function NewComplaintPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [complainantType, setComplainantType] = useState<'self' | 'on_behalf_of'>('self')
  const [selectedProduct, setSelectedProduct] = useState<PortalCatalogProduct | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function addFiles(nextFiles: FileList | null) {
    if (!nextFiles) return
    const next = Array.from(nextFiles)
    const invalid = next.find((file) => !ACCEPTED_TYPES.has(file.type) || file.size > 25 * 1024 * 1024)
    if (invalid) {
      setError('Photos must be JPEG, PNG, WebP, HEIC, or HEIF and no larger than 25 MB each.')
      return
    }
    setError('')
    setFiles((current) => [...current, ...next].slice(0, 5))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!navigator.onLine) {
      setError('You are offline. Reconnect before submitting your complaint.')
      return
    }
    if (!selectedProduct) {
      setError('Select the product that needs service.')
      return
    }
    setError('')
    setSubmitting(true)
    const data = new FormData(event.currentTarget)
    const input = buildComplaintInput(data, complainantType, selectedProduct)
    try {
      const complaint = await portalApi.createComplaint(input)
      try {
        for (const file of files) {
          const pending = await portalApi.createAttachment(complaint.id, file)
          const upload = await fetch(pending.upload.uploadUrl, {
            method: 'PUT',
            headers: { 'content-type': file.type },
            body: file,
          })
          if (!upload.ok) throw new Error(`${file.name} could not be uploaded.`)
          await portalApi.confirmAttachment(complaint.id, pending.attachment.id)
        }
        navigate(`/complaints/${complaint.id}`, { replace: true })
      } catch (uploadError) {
        navigate(`/complaints/${complaint.id}`, {
          replace: true,
          state: {
            uploadNotice: `Complaint created, but one or more photos were not uploaded. ${apiErrorMessage(uploadError)} Add the missing photos again below.`,
          },
        })
      }
    } catch (nextError) {
      setError(apiErrorMessage(nextError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="narrow-page">
      <Link className="back-link" to="/complaints"><ArrowLeft size={17} /> Back to complaints</Link>
      <div className="page-heading compact"><div><p className="eyebrow">New service request</p><h1>Raise a complaint</h1><p>Select the exact product and enter its serial number before describing the issue.</p></div></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form className="panel form-stack complaint-form" onSubmit={submit}>
        <fieldset>
          <legend>Issue details</legend>
          <div className="form-grid two">
            <label>Issue category<input name="issueCategory" placeholder="Example: Not charging" required /></label>
            <label>Short title <span className="optional">Optional</span><input name="title" placeholder="A quick summary" /></label>
          </div>
          <label>Description<textarea name="description" rows={5} placeholder="Describe the issue, when it began, and what you have already tried." required /></label>
        </fieldset>
        <fieldset>
          <legend>Battery identification</legend>
          <div className="form-grid two">
            <ProductPicker selectedProduct={selectedProduct} onSelect={setSelectedProduct} />
            <label>
              Serial number
              <input
                name="serialNumber"
                autoCapitalize="characters"
                placeholder="Battery serial number"
                minLength={2}
                maxLength={200}
                required
              />
              <span className="input-help">Enter at least 2 characters exactly as printed on the product.</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Contact details</legend>
          <div className="form-grid two">
            <label>Customer name<input name="customerName" defaultValue={user?.name} required /></label>
            <label>Customer phone<input name="customerPhone" type="tel" defaultValue={user?.phone} required /></label>
          </div>
          <div className="segmented" aria-label="Who is this complaint for?">
            <button type="button" className={complainantType === 'self' ? 'selected' : ''} onClick={() => setComplainantType('self')}>For myself</button>
            <button type="button" className={complainantType === 'on_behalf_of' ? 'selected' : ''} onClick={() => setComplainantType('on_behalf_of')}>On behalf of someone</button>
          </div>
          {complainantType === 'on_behalf_of' && (
            <div className="form-grid two inset-fields">
              <label>Person's name<input name="thirdPartyName" required /></label>
              <label>Person's phone<input name="thirdPartyPhone" type="tel" required /></label>
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>Photos <span className="optional">Optional</span></legend>
          <p className="field-help">If you have photos of the issue, attach them here. It helps us resolve faster.</p>
          <label className="upload-box"><ImagePlus /><strong>Add photos</strong><span>JPEG, PNG, WebP, HEIC or HEIF. Up to 25 MB each.</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => addFiles(event.target.files)} /></label>
          {files.length > 0 && <div className="file-list">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></span>)}</div>}
        </fieldset>
        <div className="form-actions"><Link className="secondary-button link-button" to="/complaints">Cancel</Link><button className="primary-button" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit complaint'}</button></div>
      </form>
    </section>
  )
}
