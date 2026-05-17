import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Upload, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'
import { usePermission } from '@/context/PermissionContext'

type Brand = {
  id: string
  name: string
  logoImage: string | null
  description: string | null
  isActive: boolean
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

export function CatalogBrandsPage() {
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canWriteCatalog = can('catalog:write')
  const [createOpen, setCreateOpen] = useState(false)
  const [editBrand, setEditBrand] = useState<Brand | null>(null)
  const [statusTab, setStatusTab] = useState<'active' | 'inactive'>('active')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [logoImage, setLogoImage] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const query = useQuery({
    queryKey: ['catalog', 'brands', 'all'],
    queryFn: async () => {
      const res = await api.get<{ data?: Brand[] } | Brand[]>('/catalog/brands', { params: { includeInactive: true } })
      const payload = res.data as { data?: Brand[] } | Brand[] | undefined
      if (Array.isArray(payload)) return payload
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; logoImage?: string; description?: string }) => {
      await api.post('/catalog/brands', payload)
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['catalog', 'brands'] }) },
  })

  const updateMutation = useMutation({
    mutationFn: async (params: { id: string; payload: Partial<Brand> }) => {
      await api.patch(`/catalog/brands/${params.id}`, params.payload)
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['catalog', 'brands'] }) },
  })

  function resetForm() {
    setName('')
    setDescription('')
    setLogoImage('')
    setLogoPreview(null)
    setLogoFile(null)
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openCreate() {
    setEditBrand(null)
    resetForm()
    setCreateOpen(true)
  }

  function openEdit(brand: Brand) {
    setEditBrand(brand)
    setName(brand.name)
    setDescription(brand.description ?? '')
    setLogoImage(brand.logoImage ?? '')
    setLogoPreview(brand.logoImage ?? null)
    setLogoFile(null)
    setErrorMessage(null)
    setCreateOpen(true)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setLogoFile(null)
    setLogoPreview(null)
    setLogoImage('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    let finalLogo = logoImage
    if (logoFile) {
      finalLogo = await fileToDataUrl(logoFile)
    }

    const payload = {
      name: name.trim(),
      description: normalizeOptional(description),
      logoImage: finalLogo || undefined,
    }

    try {
      if (editBrand) {
        await updateMutation.mutateAsync({ id: editBrand.id, payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      setCreateOpen(false)
      resetForm()
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Unable to save brand.'))
    }
  }

  async function handleToggleActive(brand: Brand) {
    try {
      await updateMutation.mutateAsync({ id: brand.id, payload: { isActive: !brand.isActive } })
    } catch { /* no-op */ }
  }

  const brands = query.data ?? []
  const activeCount = useMemo(() => brands.filter((brand) => brand.isActive).length, [brands])
  const inactiveCount = brands.length - activeCount
  const visibleBrands = useMemo(
    () => brands.filter((brand) => (statusTab === 'active' ? brand.isActive : !brand.isActive)),
    [brands, statusTab],
  )
  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Catalog Brands</CardTitle>
          {canWriteCatalog && (
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              New Brand
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setStatusTab('active')}
                className={`rounded px-3 py-1 text-sm ${statusTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                Active ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('inactive')}
                className={`rounded px-3 py-1 text-sm ${statusTab === 'inactive' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                Inactive ({inactiveCount})
              </button>
            </div>
            <p className="text-sm text-slate-500">{activeCount} active / {brands.length} total</p>
          </div>
          {query.isLoading ? <p className="text-sm text-slate-500">Loading brands…</p> : null}
          {query.isError ? <p className="text-sm text-red-600">Unable to load brands.</p> : null}
          {!query.isLoading && !query.isError && visibleBrands.length === 0 ? (
            <p className="text-sm text-slate-500">
              {statusTab === 'active' ? 'No active brands available.' : 'No inactive brands available.'}
            </p>
          ) : null}

          {visibleBrands.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Logo</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleBrands.map((brand) => (
                    <TableRow key={brand.id}>
                      <TableCell className="w-14">
                        {brand.logoImage ? (
                          <img
                            src={brand.logoImage}
                            alt={brand.name}
                            className="h-10 w-10 rounded-md object-contain"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-400 text-xs">
                            —
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{brand.name}</p>
                        <p className="text-xs text-slate-500">{brand.description ?? 'No description'}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={brand.isActive ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-slate-100 text-slate-700'}>
                          {brand.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canWriteCatalog && (
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => openEdit(brand)}>
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => handleToggleActive(brand)}>
                              {brand.isActive ? 'Disable' : 'Enable'}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm() }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editBrand ? 'Edit Brand' : 'Create Brand'}</DialogTitle>
            <DialogDescription>Manage brand details and logo image.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Brand Name</Label>
              <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Exide, Amara Raja" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-description">Description (Optional)</Label>
              <Input id="brand-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of the brand" />
            </div>

            {/* Logo upload */}
            <div className="space-y-2">
              <Label>Logo Image (Optional)</Label>
              <div className="flex items-center gap-3">
                {logoPreview ? (
                  <div className="relative">
                    <img src={logoPreview} alt="preview" className="h-16 w-16 rounded-lg object-contain border border-slate-200 bg-slate-50" />
                    <button
                      type="button"
                      onClick={clearImage}
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
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml"
                    onChange={handleFileChange}
                    className="hidden"
                    id="brand-logo-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    {logoPreview ? 'Change image' : 'Upload image'}
                  </Button>
                  <p className="text-xs text-slate-500">JPEG, PNG, WebP or SVG</p>
                </div>
              </div>
            </div>

            {errorMessage ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
