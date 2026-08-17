import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Pencil, Plus, Upload, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermission } from '@/context/PermissionContext'
import { api } from '@/lib/api'
import { formatCurrencyINR } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'

type Brand = { id: string; name: string }
type Category = { id: string; name: string }

type SkuCustomFieldType = 'text' | 'number' | 'boolean'

type SkuCustomField = {
  key: string
  label: string
  type: SkuCustomFieldType
  value: string | number | boolean | null
  unit?: string
  visible?: boolean
}

type SkuDetails = {
  version?: number
  customFields: SkuCustomField[]
}

type CustomFieldDraft = {
  id: string
  key: string
  label: string
  type: SkuCustomFieldType
  value: string
  unit: string
  visible: boolean
}

type Sku = {
  id: string
  brandId: string | null
  categoryId: string | null
  name: string
  displayName: string
  skuCode: string
  basePrice: number
  warrantyMonths: number
  hsnCode: string
  uqc: string
  gstRate: number
  transferValue: number
  category: string | null
  brand: string | null
  type: string | null
  description?: string | null
  details?: SkuDetails | null
  images: string[]
  isActive: boolean
}

type ImportRowResult = {
  rowNumber: number
  skuCode: string
  action: 'create' | 'update' | 'error'
  errors: string[]
}

type ImportResult = {
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    toCreate: number
    toUpdate: number
  }
  rows: ImportRowResult[]
}

function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseImages(raw: string) {
  return raw
    .split('\n')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function isLikelyBase64Chunk(value: string) {
  return /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 16
}

function normalizeSkuImages(input: unknown): string[] {
  const rawItems = Array.isArray(input)
    ? input.map((value) => String(value ?? '').trim()).filter(Boolean)
    : typeof input === 'string'
      ? parseImages(input)
      : []

  const normalized: string[] = []
  for (let i = 0; i < rawItems.length; i += 1) {
    const current = rawItems[i]
    const next = rawItems[i + 1]

    if (current.startsWith('data:') && !current.includes(',') && next && isLikelyBase64Chunk(next)) {
      normalized.push(`${current},${next}`)
      i += 1
      continue
    }

    normalized.push(current)
  }

  return Array.from(new Set(normalized))
}

function normalizeSkuRow(sku: Sku): Sku {
  const name = String(sku.name ?? '').trim()
  const displayName = String(sku.displayName ?? '').trim()
  const skuCode = String(sku.skuCode ?? '').trim()
  const description = typeof sku.description === 'string' ? sku.description : null

  return {
    ...sku,
    name: name || displayName || skuCode || 'Unnamed SKU',
    displayName: displayName || name || skuCode || '',
    skuCode: skuCode || name || '—',
    description,
    images: normalizeSkuImages(sku.images),
  }
}

function normalizeOptional(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

function makeCustomFieldDraft(overrides?: Partial<CustomFieldDraft>): CustomFieldDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    key: '',
    label: '',
    type: 'text',
    value: '',
    unit: '',
    visible: true,
    ...overrides,
  }
}

function detailsToDrafts(details?: SkuDetails | null) {
  if (!details || !Array.isArray(details.customFields)) return [] as CustomFieldDraft[]

  return details.customFields.map((field) =>
    makeCustomFieldDraft({
      key: field.key ?? '',
      label: field.label ?? field.key ?? '',
      type: field.type ?? 'text',
      value:
        field.value === null || field.value === undefined
          ? ''
          : typeof field.value === 'string'
            ? field.value
            : String(field.value),
      unit: field.unit ?? '',
      visible: field.visible ?? true,
    }),
  )
}

function customFieldDisplayValue(field: SkuCustomField) {
  if (field.value === null || field.value === undefined || field.value === '') return '—'
  if (field.type === 'boolean') return field.value ? 'Yes' : 'No'
  return `${field.value}${field.unit ? ` ${field.unit}` : ''}`
}

function buildDetailsPayload(drafts: CustomFieldDraft[]) {
  const filtered = drafts.filter((draft) =>
    draft.key.trim().length > 0
    || draft.label.trim().length > 0
    || draft.value.trim().length > 0
    || draft.unit.trim().length > 0
    || draft.visible === false,
  )

  const seen = new Set<string>()
  const customFields: SkuCustomField[] = []

  for (const draft of filtered) {
    const key = draft.key.trim()
    const label = draft.label.trim()
    if (!key) throw new Error('Each custom field must have a key.')
    if (!label) throw new Error(`Custom field "${key}" must have a label.`)

    const dedupeKey = key.toLowerCase()
    if (seen.has(dedupeKey)) throw new Error(`Duplicate custom field key: ${key}`)
    seen.add(dedupeKey)

    let value: string | number | boolean | null
    if (draft.type === 'number') {
      if (!draft.value.trim()) {
        value = null
      } else {
        const parsed = Number(draft.value)
        if (!Number.isFinite(parsed)) throw new Error(`Custom field "${key}" expects a numeric value.`)
        value = parsed
      }
    } else if (draft.type === 'boolean') {
      if (!draft.value.trim()) {
        value = null
      } else if (draft.value === 'true' || draft.value === 'false') {
        value = draft.value === 'true'
      } else {
        throw new Error(`Custom field "${key}" expects true/false.`)
      }
    } else {
      value = draft.value
    }

    customFields.push({
      key,
      label,
      type: draft.type,
      value,
      unit: normalizeOptional(draft.unit),
      visible: draft.visible,
    })
  }

  return {
    version: 1,
    customFields,
  } satisfies SkuDetails
}

export function CatalogSkusPage() {
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canReadCatalog = can('catalog:read')
  const canWriteCatalog = can('catalog:write')
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const skuImagesInputRef = useRef<HTMLInputElement | null>(null)

  // filters
  const [filterBrandId, setFilterBrandId] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [searchText, setSearchText] = useState('')
  const [statusTab, setStatusTab] = useState<'active' | 'inactive'>('active')

  // create form — separate brand/category selectors
  const [createBrandId, setCreateBrandId] = useState('')
  const [createCategoryId, setCreateCategoryId] = useState('')

  const [editSku, setEditSku] = useState<Sku | null>(null)
  const [viewSku, setViewSku] = useState<Sku | null>(null)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [skuCode, setSkuCode] = useState('')
  const [basePrice, setBasePrice] = useState('0')
  const [warrantyMonths, setWarrantyMonths] = useState('0')
  const [hsnCode, setHsnCode] = useState('')
  const [uqc, setUqc] = useState('NOS')
  const [gstRate, setGstRate] = useState('18')
  const [transferValue, setTransferValue] = useState('0')
  const [typeName, setTypeName] = useState('General')
  const [description, setDescription] = useState('')
  const [imagesText, setImagesText] = useState('')
  const [customFields, setCustomFields] = useState<CustomFieldDraft[]>([])
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importCsvText, setImportCsvText] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isUploadingImages, setIsUploadingImages] = useState(false)

  const brandsQuery = useQuery({
    queryKey: ['catalog', 'brands', 'sku-page'],
    queryFn: async () => {
      const res = await api.get<{ data?: Brand[] } | Brand[]>('/catalog/brands', { params: { includeInactive: false } })
      const payload = res.data as { data?: Brand[] } | Brand[] | undefined
      if (Array.isArray(payload)) return payload
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const filterCategoriesQuery = useQuery({
    queryKey: ['catalog', 'categories', 'sku-filter', filterBrandId],
    enabled: Boolean(filterBrandId),
    queryFn: async () => {
      const res = await api.get<{ data?: Category[] } | Category[]>('/catalog/categories', {
        params: { includeInactive: false, brandId: filterBrandId },
      })
      const payload = res.data as { data?: Category[] } | Category[] | undefined
      if (Array.isArray(payload)) return payload
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const createCategoriesQuery = useQuery({
    queryKey: ['catalog', 'categories', 'sku-create', createBrandId],
    enabled: Boolean(createBrandId) && dialogOpen,
    queryFn: async () => {
      const res = await api.get<{ data?: Category[] } | Category[]>('/catalog/categories', {
        params: { includeInactive: false, brandId: createBrandId },
      })
      const payload = res.data as { data?: Category[] } | Category[] | undefined
      if (Array.isArray(payload)) return payload
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const skusQuery = useQuery({
    queryKey: ['catalog', 'skus', filterBrandId, filterCategoryId],
    queryFn: async () => {
      const res = await api.get<{ data?: Sku[] } | Sku[]>('/catalog/skus', {
        params: {
          includeInactive: true,
          ...(filterBrandId ? { brandId: filterBrandId } : {}),
          ...(filterCategoryId ? { categoryId: filterCategoryId } : {}),
        },
      })
      const payload = res.data as { data?: Sku[] } | Sku[] | undefined
      if (Array.isArray(payload)) return payload.map(normalizeSkuRow)
      if (Array.isArray(payload?.data)) return payload.data.map(normalizeSkuRow)
      return []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: {
      brandId: string
      categoryId: string
      typeName?: string
      name: string
      displayName?: string
      skuCode: string
      basePrice: number
      warrantyMonths: number
      hsnCode: string
      uqc: string
      gstRate: number
      transferValue: number
      description?: string
      details: SkuDetails
      images: string[]
    }) => {
      await api.post('/catalog/skus', payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['catalog', 'skus'] })
      await queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (params: {
      id: string
      payload: {
        brandId?: string
        categoryId?: string
        typeName?: string
        name: string
        displayName?: string
        skuCode: string
        basePrice: number
        warrantyMonths: number
        hsnCode: string
        uqc: string
        gstRate: number
        transferValue: number
        description?: string
        details: SkuDetails
        images: string[]
        isActive?: boolean
      }
    }) => {
      await api.patch(`/catalog/skus/${params.id}`, params.payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['catalog', 'skus'] })
    },
  })

  const importDryRunMutation = useMutation({
    mutationFn: async (csvText: string) => {
      const res = await api.post<{ data: ImportResult }>('/catalog/skus/import', {
        mode: 'dry_run',
        csvText,
      })
      return res.data.data
    },
  })

  const importApplyMutation = useMutation({
    mutationFn: async (csvText: string) => {
      const res = await api.post<{ data: ImportResult }>('/catalog/skus/import', {
        mode: 'apply',
        csvText,
      })
      return res.data.data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog', 'skus'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'brands'] }),
      ])
    },
  })

  async function handleDownloadTemplate() {
    try {
      const response = await api.get('/catalog/skus/import-template', {
        responseType: 'blob',
      })
      const blobUrl = URL.createObjectURL(response.data as Blob)
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = 'catalog_sku_import_template.csv'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      setImportError(apiErrorMessage(error, 'Unable to download template.'))
      setImportDialogOpen(true)
    }
  }

  async function handleImportFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)
    setImportResult(null)
    try {
      const csvText = await file.text()
      const dryRun = await importDryRunMutation.mutateAsync(csvText)
      setImportCsvText(csvText)
      setImportResult(dryRun)
      setImportDialogOpen(true)
    } catch (error) {
      setImportError(apiErrorMessage(error, 'Unable to parse or validate CSV.'))
      setImportDialogOpen(true)
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = ''
      }
    }
  }

  async function handleConfirmImport() {
    if (!importCsvText) return
    setImportError(null)
    try {
      const applied = await importApplyMutation.mutateAsync(importCsvText)
      setImportResult(applied)
    } catch (error) {
      setImportError(apiErrorMessage(error, 'CSV import failed.'))
    }
  }

  function resetForm() {
    setName('')
    setDisplayName('')
    setSkuCode('')
    setBasePrice('0')
    setWarrantyMonths('0')
    setHsnCode('')
    setUqc('NOS')
    setGstRate('18')
    setTransferValue('0')
    setTypeName('General')
    setDescription('')
    setImagesText('')
    setCustomFields([])
    setErrorMessage(null)
    setCreateBrandId('')
    setCreateCategoryId('')
    if (skuImagesInputRef.current) skuImagesInputRef.current.value = ''
  }

  async function handleSkuImageFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setErrorMessage(null)
    setIsUploadingImages(true)
    try {
      const uploaded = await fileToDataUrl(file)
      setImagesText(uploaded)
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Unable to read selected images.'))
    } finally {
      setIsUploadingImages(false)
      event.target.value = ''
    }
  }

  function clearSkuImage() {
    setImagesText('')
    if (skuImagesInputRef.current) skuImagesInputRef.current.value = ''
  }

  function openCreate() {
    setEditSku(null)
    resetForm()
    setDialogOpen(true)
  }

  function openEdit(sku: Sku) {
    setEditSku(sku)
    setCreateBrandId(sku.brandId ?? '')
    setCreateCategoryId(sku.categoryId ?? '')
    setName(sku.name)
    setDisplayName(sku.displayName)
    setSkuCode(sku.skuCode)
    setBasePrice(String(sku.basePrice))
    setWarrantyMonths(String(sku.warrantyMonths))
    setHsnCode(sku.hsnCode)
    setUqc(sku.uqc)
    setGstRate(String(sku.gstRate))
    setTransferValue(String(sku.transferValue))
    setTypeName(sku.type ?? 'General')
    setDescription(sku.description ?? '')
    setImagesText(sku.images.join('\n'))
    setCustomFields(detailsToDrafts(sku.details))
    setErrorMessage(null)
    setDialogOpen(true)
  }

  function openView(sku: Sku) {
    setViewSku(sku)
    setViewDialogOpen(true)
  }

  async function handleToggleActive(sku: Sku) {
    try {
      await updateMutation.mutateAsync({
        id: sku.id,
        payload: {
          name: sku.name,
          displayName: normalizeOptional(sku.displayName),
          skuCode: sku.skuCode,
          basePrice: sku.basePrice,
          warrantyMonths: sku.warrantyMonths,
          hsnCode: sku.hsnCode,
          uqc: sku.uqc,
          gstRate: sku.gstRate,
          transferValue: sku.transferValue,
          details: sku.details ?? { version: 1, customFields: [] },
          images: sku.images,
          isActive: !sku.isActive,
        },
      })
    } catch {
      // no-op
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    const payload = {
      name: name.trim(),
      displayName: normalizeOptional(displayName),
      skuCode: skuCode.trim(),
      basePrice: Math.max(0, toNumber(basePrice)),
      warrantyMonths: Math.max(0, Math.trunc(toNumber(warrantyMonths))),
      hsnCode: hsnCode.trim(),
      uqc: uqc.trim(),
      gstRate: Math.max(0, toNumber(gstRate)),
      transferValue: Math.max(0, toNumber(transferValue)),
      description: normalizeOptional(description),
      details: buildDetailsPayload(customFields),
      images: parseImages(imagesText),
    }

    try {
      if (!createBrandId || !createCategoryId) {
        setErrorMessage('Select brand and category.')
        return
      }
      if (!payload.hsnCode || !payload.uqc || payload.transferValue <= 0) {
        setErrorMessage('HSN, UQC, and a transfer value greater than zero are required.')
        return
      }

      if (editSku) {
        await updateMutation.mutateAsync({
          id: editSku.id,
          payload: {
            brandId: createBrandId,
            categoryId: createCategoryId,
            typeName: normalizeOptional(typeName),
            ...payload,
          },
        })
      } else {
        await createMutation.mutateAsync({
          brandId: createBrandId,
          categoryId: createCategoryId,
          typeName: normalizeOptional(typeName),
          ...payload,
        })
      }
      setDialogOpen(false)
      resetForm()
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Unable to save SKU.'))
    }
  }

  const allSkus = skusQuery.data ?? []
  const parsedSkuImages = useMemo(() => parseImages(imagesText), [imagesText])

  const searchedSkus = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return allSkus
    return allSkus.filter((sku) =>
      [sku.name, sku.displayName, sku.skuCode, sku.brand, sku.category, sku.type]
        .some((v) => v?.toLowerCase().includes(q))
    )
  }, [allSkus, searchText])

  const summary = useMemo(() => {
    const active = allSkus.filter((s) => s.isActive).length
    const inactive = allSkus.length - active
    return { active, inactive, total: allSkus.length }
  }, [allSkus])

  const visibleSkus = useMemo(
    () => searchedSkus.filter((sku) => (statusTab === 'active' ? sku.isActive : !sku.isActive)),
    [searchedSkus, statusTab],
  )

  const brands = brandsQuery.data ?? []
  const filterCategories = filterCategoriesQuery.data ?? []
  const createCategories = createCategoriesQuery.data ?? []

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Catalog SKUs</CardTitle>
            <div className="flex items-center gap-2">
              {canReadCatalog ? (
                <Button type="button" variant="outline" onClick={handleDownloadTemplate} disabled title="Not available in Phase 1 backend">
                  <Download className="mr-1 h-4 w-4" />
                  Download Template
                </Button>
              ) : null}
              {canWriteCatalog ? (
                <>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleImportFileSelected}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => importInputRef.current?.click()}
                    disabled
                    title="Not available in Phase 1 backend"
                  >
                    <Upload className="mr-1 h-4 w-4" />
                    Import CSV
                  </Button>
                  <Button onClick={openCreate}>
                    <Plus className="mr-1 h-4 w-4" />
                    New SKU
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterBrandId}
              onChange={(e) => { setFilterBrandId(e.target.value); setFilterCategoryId('') }}
              className="h-9 min-w-[180px] rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">All Brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="h-9 min-w-[180px] rounded-md border border-slate-200 bg-white px-3 text-sm disabled:opacity-50"
              disabled={!filterBrandId}
            >
              <option value="">{filterBrandId ? 'All Categories' : 'Select brand first'}</option>
              {filterCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by name, SKU, brand, category…"
              className="max-w-[280px]"
            />
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setStatusTab('active')}
                className={`rounded px-3 py-1 text-sm ${statusTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                Active ({summary.active})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('inactive')}
                className={`rounded px-3 py-1 text-sm ${statusTab === 'inactive' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                Inactive ({summary.inactive})
              </button>
            </div>

            <p className="text-sm text-slate-500">
              {summary.active} active / {summary.total} total
            </p>
            <p className="text-sm text-amber-700">CSV import and template download are disabled in Phase 1.</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {skusQuery.isLoading ? <p className="text-sm text-slate-500">Loading SKUs…</p> : null}
          {skusQuery.isError ? <p className="text-sm text-red-600">Unable to load SKUs.</p> : null}

          {!skusQuery.isLoading && !skusQuery.isError && visibleSkus.length === 0 ? (
            <p className="text-sm text-slate-500">
              {searchText
                ? `No ${statusTab} SKUs match your search.`
                : statusTab === 'active'
                  ? 'No active SKUs yet.'
                  : 'No inactive SKUs.'}
            </p>
          ) : null}

          {visibleSkus.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Warranty</TableHead>
                    <TableHead>Status</TableHead>
                    {canReadCatalog ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSkus.map((sku) => (
                    <TableRow key={sku.id}>
                      <TableCell>
                        <p className="font-medium text-slate-900">{sku.displayName || sku.name}</p>
                        <p className="text-xs text-slate-500">{sku.skuCode}</p>
                        {sku.details?.customFields?.some((field) => field.visible !== false) ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {sku.details.customFields
                              .filter((field) => field.visible !== false)
                              .slice(0, 3)
                              .map((field) => `${field.label}: ${customFieldDisplayValue(field)}`)
                              .join(' • ')}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-slate-700">{sku.brand ?? <span className="text-slate-400">—</span>}</TableCell>
                      <TableCell className="text-slate-700">{sku.category ?? <span className="text-slate-400">—</span>}</TableCell>
                      <TableCell className="text-slate-700">{sku.type ?? <span className="text-slate-400">—</span>}</TableCell>
                      <TableCell>{formatCurrencyINR(sku.basePrice)}</TableCell>
                      <TableCell>{sku.warrantyMonths} mo</TableCell>
                      <TableCell>
                        <Badge className={sku.isActive ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-slate-100 text-slate-700'}>
                          {sku.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {canReadCatalog ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => openView(sku)}>
                              <Eye className="mr-1 h-3 w-3" />
                              View
                            </Button>
                            {canWriteCatalog ? (
                              <>
                                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(sku)}>
                                  <Pencil className="mr-1 h-3 w-3" />
                                  Edit
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => handleToggleActive(sku)}>
                                  {sku.isActive ? 'Disable' : 'Enable'}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="max-h-[92vh] sm:max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editSku ? 'Edit SKU' : 'New SKU'}</DialogTitle>
            <DialogDescription>
              {editSku ? 'Update SKU details and image URLs.' : 'Create a new SKU within the catalog hierarchy.'}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sku-brand">Brand</Label>
                <select
                  id="sku-brand"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={createBrandId}
                  onChange={(e) => { setCreateBrandId(e.target.value); setCreateCategoryId('') }}
                  required
                >
                  <option value="">Select brand…</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-category">Category</Label>
                <select
                  id="sku-category"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={createCategoryId}
                  onChange={(e) => setCreateCategoryId(e.target.value)}
                  disabled={!createBrandId}
                  required
                >
                  <option value="">{createBrandId ? 'Select category…' : 'Select brand first'}</option>
                  {createCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sku-hsn">HSN Code</Label>
                <Input id="sku-hsn" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-uqc">UQC</Label>
                <Input id="sku-uqc" value={uqc} onChange={(e) => setUqc(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-gst">GST Rate (%)</Label>
                <Input id="sku-gst" type="number" min={0} max={100} step="0.01" value={gstRate} onChange={(e) => setGstRate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-transfer">Transfer Value (₹)</Label>
                <Input id="sku-transfer" type="number" min={0.01} step="0.01" value={transferValue} onChange={(e) => setTransferValue(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sku-type-name">Product Type (Optional)</Label>
              <p className="text-xs text-slate-400">Leave blank to use "General".</p>
              <Input
                id="sku-type-name"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                placeholder="e.g. Tubular, Flat Plate"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sku-name">Product Name</Label>
              <Input id="sku-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 35Ah Two Wheeler Battery" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sku-display-name">Display Name (Optional)</Label>
              <Input id="sku-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Shorter name shown to customers" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sku-code">SKU Code</Label>
              <Input id="sku-code" value={skuCode} onChange={(e) => setSkuCode(e.target.value)} placeholder="e.g. EX-2W-35AH" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sku-price">Base Price (₹)</Label>
                <Input id="sku-price" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} type="number" placeholder="0.00" min={0} step="0.01" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-warranty">Warranty (Months)</Label>
                <Input id="sku-warranty" value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} type="number" placeholder="e.g. 24" min={0} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sku-description">Description (Optional)</Label>
              <Input id="sku-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Product description" />
            </div>
            <div className="space-y-2">
              <Label>SKU Image (Optional)</Label>
              <div className="flex items-center gap-3">
                {parsedSkuImages[0] ? (
                  <div className="relative">
                    <img src={parsedSkuImages[0]} alt="preview" className="h-16 w-16 rounded-lg object-cover border border-slate-200 bg-slate-50" />
                    <button
                      type="button"
                      onClick={clearSkuImage}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400">
                    <Upload className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <input
                    ref={skuImagesInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml"
                    onChange={handleSkuImageFilesChange}
                    className="hidden"
                    id="sku-images-upload-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => skuImagesInputRef.current?.click()}
                    disabled={isUploadingImages}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    {isUploadingImages ? 'Reading image…' : parsedSkuImages[0] ? 'Change image' : 'Upload image'}
                  </Button>
                  <p className="text-xs text-slate-500">JPEG, PNG, WebP or SVG</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">Custom Fields</p>
                  <p className="text-xs text-slate-500">These fields are saved in SKU details.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setCustomFields((prev) => [...prev, makeCustomFieldDraft()])}>
                  Add Field
                </Button>
              </div>

              {customFields.length === 0 ? (
                <p className="text-xs text-slate-500">No custom fields added.</p>
              ) : (
                <div className="space-y-2">
                  {customFields.map((field) => (
                    <div key={field.id} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-12">
                      <Input
                        value={field.label}
                        onChange={(e) => setCustomFields((prev) => prev.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item))}
                        placeholder="Label"
                        className="md:col-span-3"
                      />
                      <Input
                        value={field.key}
                        onChange={(e) => setCustomFields((prev) => prev.map((item) => item.id === field.id ? { ...item, key: e.target.value } : item))}
                        placeholder="key_name"
                        className="md:col-span-2"
                      />
                      <select
                        value={field.type}
                        onChange={(e) => setCustomFields((prev) => prev.map((item) => item.id === field.id ? { ...item, type: e.target.value as SkuCustomFieldType, value: '' } : item))}
                        className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-sm md:col-span-2"
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                      {field.type === 'boolean' ? (
                        <select
                          value={field.value}
                          onChange={(e) => setCustomFields((prev) => prev.map((item) => item.id === field.id ? { ...item, value: e.target.value } : item))}
                          className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-sm md:col-span-2"
                        >
                          <option value="">Unset</option>
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : (
                        <Input
                          value={field.value}
                          onChange={(e) => setCustomFields((prev) => prev.map((item) => item.id === field.id ? { ...item, value: e.target.value } : item))}
                          placeholder={field.type === 'number' ? 'Value (number)' : 'Value'}
                          className="md:col-span-2"
                        />
                      )}
                      <Input
                        value={field.unit}
                        onChange={(e) => setCustomFields((prev) => prev.map((item) => item.id === field.id ? { ...item, unit: e.target.value } : item))}
                        placeholder="Unit"
                        className="md:col-span-1"
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-600 md:col-span-1">
                        <input
                          type="checkbox"
                          checked={field.visible}
                          onChange={(e) => setCustomFields((prev) => prev.map((item) => item.id === field.id ? { ...item, visible: e.target.checked } : item))}
                        />
                        Show
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="md:col-span-1"
                        onClick={() => setCustomFields((prev) => prev.filter((item) => item.id !== field.id))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errorMessage ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewDialogOpen}
        onOpenChange={(open) => {
          setViewDialogOpen(open)
          if (!open) setViewSku(null)
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewSku?.displayName || viewSku?.name || 'SKU Details'}</DialogTitle>
            <DialogDescription>{viewSku?.skuCode ?? '-'}</DialogDescription>
          </DialogHeader>

          {viewSku ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-md border border-slate-200 p-3 text-sm md:grid-cols-2">
                <div><span className="text-slate-500">Name:</span> <span className="font-medium text-slate-900">{viewSku.name}</span></div>
                <div><span className="text-slate-500">Display Name:</span> <span className="font-medium text-slate-900">{viewSku.displayName || '—'}</span></div>
                <div><span className="text-slate-500">Brand:</span> <span className="font-medium text-slate-900">{viewSku.brand ?? '—'}</span></div>
                <div><span className="text-slate-500">Category:</span> <span className="font-medium text-slate-900">{viewSku.category ?? '—'}</span></div>
                <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-900">{viewSku.type ?? '—'}</span></div>
                <div><span className="text-slate-500">Base Price:</span> <span className="font-medium text-slate-900">{formatCurrencyINR(viewSku.basePrice)}</span></div>
                <div><span className="text-slate-500">Warranty:</span> <span className="font-medium text-slate-900">{viewSku.warrantyMonths} months</span></div>
                <div><span className="text-slate-500">HSN / UQC:</span> <span className="font-medium text-slate-900">{viewSku.hsnCode} / {viewSku.uqc}</span></div>
                <div><span className="text-slate-500">GST:</span> <span className="font-medium text-slate-900">{viewSku.gstRate}%</span></div>
                <div><span className="text-slate-500">Transfer Value:</span> <span className="font-medium text-slate-900">{formatCurrencyINR(viewSku.transferValue)}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium text-slate-900">{viewSku.isActive ? 'Active' : 'Inactive'}</span></div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">Description</p>
                <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  {viewSku.description?.trim() ? viewSku.description : '—'}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">Custom Fields</p>
                {viewSku.details?.customFields?.length ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Label</TableHead>
                          <TableHead>Key</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Visible</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewSku.details.customFields.map((field) => (
                          <TableRow key={field.key}>
                            <TableCell>{field.label}</TableCell>
                            <TableCell className="font-mono text-xs">{field.key}</TableCell>
                            <TableCell>{field.type}</TableCell>
                            <TableCell>{customFieldDisplayValue(field)}</TableCell>
                            <TableCell>{field.visible === false ? 'No' : 'Yes'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">No custom fields.</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">Images</p>
                {viewSku.images.length > 0 ? (
                  <div className="grid gap-2">
                    {viewSku.images.map((imageUrl) => (
                      <a
                        key={imageUrl}
                        href={imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate rounded-md border border-slate-200 px-3 py-2 text-sm text-blue-700 hover:bg-slate-50"
                      >
                        {imageUrl}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">No images.</p>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>CSV Import Preview</DialogTitle>
            <DialogDescription>Review dry-run results before applying catalog SKU import.</DialogDescription>
          </DialogHeader>

          {importError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{importError}</p>
          ) : null}

          {importResult ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-slate-500">Total</p>
                  <p className="font-semibold text-slate-900">{importResult.summary.totalRows}</p>
                </div>
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-slate-500">Valid</p>
                  <p className="font-semibold text-emerald-700">{importResult.summary.validRows}</p>
                </div>
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-slate-500">Invalid</p>
                  <p className="font-semibold text-red-700">{importResult.summary.invalidRows}</p>
                </div>
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-slate-500">To Create</p>
                  <p className="font-semibold text-slate-900">{importResult.summary.toCreate}</p>
                </div>
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-slate-500">To Update</p>
                  <p className="font-semibold text-slate-900">{importResult.summary.toUpdate}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.rows.slice(0, 200).map((row) => (
                      <TableRow key={`${row.rowNumber}-${row.skuCode || 'none'}`}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.skuCode || <span className="text-slate-400">—</span>}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              row.action === 'create'
                                ? 'border-blue-300 bg-blue-100 text-blue-800'
                                : row.action === 'update'
                                  ? 'border-amber-300 bg-amber-100 text-amber-800'
                                  : 'border-red-300 bg-red-100 text-red-800'
                            }
                          >
                            {row.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {row.errors.length > 0 ? row.errors.join('; ') : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {importResult.rows.length > 200 ? (
                <p className="text-xs text-slate-500">Showing first 200 rows.</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={handleConfirmImport}
              disabled={
                !canWriteCatalog
                || !importResult
                || importResult.summary.invalidRows > 0
                || importApplyMutation.isPending
              }
            >
              {importApplyMutation.isPending ? 'Importing…' : 'Confirm Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
