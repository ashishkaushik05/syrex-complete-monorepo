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

type Category = {
  id: string
  name: string
  brandId: string | null
  brand: string | null
  description: string | null
  icon: string | null
  sortOrder: number
  isActive: boolean
}

type Brand = { id: string; name: string }

function parseSortOrder(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
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

export function CatalogCategoriesPage() {
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canWriteCatalog = can('catalog:write')
  const [createOpen, setCreateOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<Category | null>(null)
  const [brandFilterId, setBrandFilterId] = useState('')
  const [statusTab, setStatusTab] = useState<'active' | 'inactive'>('active')
  const [createBrandId, setCreateBrandId] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')           // current URL (existing or freshly uploaded)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [sortOrder, setSortOrder] = useState('0')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const brandsQuery = useQuery({
    queryKey: ['catalog', 'brands', 'for-category-filter'],
    queryFn: async () => {
      const res = await api.get<{ data?: Brand[] } | Brand[]>('/catalog/brands', { params: { includeInactive: false } })
      const payload = res.data as { data?: Brand[] } | Brand[] | undefined
      if (Array.isArray(payload)) return payload
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const categoriesQuery = useQuery({
    queryKey: ['catalog', 'categories', 'all', brandFilterId],
    queryFn: async () => {
      const res = await api.get<{ data?: Category[] } | Category[]>('/catalog/categories', {
        params: { includeInactive: true, ...(brandFilterId ? { brandId: brandFilterId } : {}) },
      })
      const payload = res.data as { data?: Category[] } | Category[] | undefined
      if (Array.isArray(payload)) return payload
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: { brandId: string; name: string; description?: string; icon?: string; sortOrder: number }) => {
      await api.post('/catalog/categories', payload)
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] }) },
  })

  const updateMutation = useMutation({
    mutationFn: async (params: { id: string; payload: Partial<Category> & { brandId?: string } }) => {
      await api.patch(`/catalog/categories/${params.id}`, params.payload)
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] }) },
  })

  function resetForm() {
    setName('')
    setDescription('')
    setIcon('')
    setIconPreview(null)
    setIconFile(null)
    setSortOrder('0')
    setCreateBrandId('')
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openCreate() {
    setEditCategory(null)
    resetForm()
    setCreateOpen(true)
  }

  function openEdit(category: Category) {
    setEditCategory(category)
    setName(category.name)
    setCreateBrandId(category.brandId ?? '')
    setDescription(category.description ?? '')
    setIcon(category.icon ?? '')
    setIconPreview(category.icon ?? null)
    setIconFile(null)
    setSortOrder(String(category.sortOrder))
    setErrorMessage(null)
    setCreateOpen(true)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIconFile(file)
    setIconPreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setIconFile(null)
    setIconPreview(null)
    setIcon('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    let finalIcon = icon
    if (iconFile) {
      finalIcon = await fileToDataUrl(iconFile)
    }

    const payload = {
      name: name.trim(),
      brandId: createBrandId || undefined,
      description: normalizeOptional(description),
      icon: finalIcon || undefined,
      sortOrder: parseSortOrder(sortOrder),
    }

    try {
      if (editCategory) {
        await updateMutation.mutateAsync({ id: editCategory.id, payload })
      } else {
        if (!createBrandId) {
          setErrorMessage('Select brand for category.')
          return
        }
        await createMutation.mutateAsync({ ...payload, brandId: createBrandId })
      }
      setCreateOpen(false)
      resetForm()
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Unable to save category.'))
    }
  }

  async function handleToggleActive(category: Category) {
    try {
      await updateMutation.mutateAsync({
        id: category.id,
        payload: { name: category.name, sortOrder: category.sortOrder, isActive: !category.isActive },
      })
    } catch { /* no-op */ }
  }

  const categories = categoriesQuery.data ?? []
  const activeCount = useMemo(() => categories.filter((c) => c.isActive).length, [categories])
  const inactiveCount = categories.length - activeCount
  const visibleCategories = useMemo(
    () => categories.filter((category) => (statusTab === 'active' ? category.isActive : !category.isActive)),
    [categories, statusTab],
  )
  const isSaving = createMutation.isPending || updateMutation.isPending
  const brandLocked = Boolean(editCategory?.brandId)

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-row items-center justify-between">
            <CardTitle>Catalog Categories</CardTitle>
            {canWriteCatalog && (
              <Button onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" />
                New Category
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={brandFilterId}
              onChange={(e) => setBrandFilterId(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">All Brands</option>
              {(brandsQuery.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
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
            <p className="text-sm text-slate-600">{activeCount} active / {categories.length} total</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {categoriesQuery.isLoading ? <p className="text-sm text-slate-500">Loading categories…</p> : null}
          {categoriesQuery.isError ? <p className="text-sm text-red-600">Unable to load categories.</p> : null}
          {!categoriesQuery.isLoading && !categoriesQuery.isError && visibleCategories.length === 0 ? (
            <p className="text-sm text-slate-500">
              {statusTab === 'active' ? 'No active categories found.' : 'No inactive categories found.'}
            </p>
          ) : null}

          {visibleCategories.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Icon</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Sort</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleCategories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="w-14">
                        {category.icon ? (
                          <img
                            src={category.icon}
                            alt={category.name}
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-400 text-xs">
                            —
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{category.name}</p>
                        <p className="text-xs text-slate-500">{category.description ?? 'No description'}</p>
                      </TableCell>
                      <TableCell>{category.brand ?? '-'}</TableCell>
                      <TableCell>{category.sortOrder}</TableCell>
                      <TableCell>
                        <Badge className={category.isActive ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-slate-100 text-slate-700'}>
                          {category.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canWriteCatalog && (
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => openEdit(category)}>
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => handleToggleActive(category)}>
                              {category.isActive ? 'Disable' : 'Enable'}
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
            <DialogTitle>{editCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <DialogDescription>Manage category details and icon image.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="cat-brand">Brand</Label>
              <select
                id="cat-brand"
                value={createBrandId}
                onChange={(e) => setCreateBrandId(e.target.value)}
                disabled={brandLocked || brandsQuery.isLoading || Boolean(brandsQuery.isError)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:opacity-70"
                required
              >
                <option value="">
                  {brandsQuery.isLoading
                    ? 'Loading brands...'
                    : brandsQuery.isError
                      ? 'Failed to load brands'
                      : 'Select brand'}
                </option>
                {(brandsQuery.data ?? []).map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
              {brandsQuery.isError ? (
                <p className="text-xs text-red-600">Unable to load brands. Retry after refreshing the page.</p>
              ) : null}
              {brandLocked ? (
                <p className="text-xs text-slate-500">Brand mapping is locked after creation.</p>
              ) : editCategory ? (
                <p className="text-xs text-slate-500">Select a brand to complete mapping for this category.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Category Name</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Two Wheeler, Four Wheeler" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-description">Description (Optional)</Label>
              <Input id="cat-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-sort">Sort Order</Label>
              <p className="text-xs text-slate-400">Lower numbers appear first in lists.</p>
              <Input id="cat-sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="e.g. 1" type="number" />
            </div>

            {/* Image upload */}
            <div className="space-y-2">
              <Label>Icon Image (Optional)</Label>
              <div className="flex items-center gap-3">
                {iconPreview ? (
                  <div className="relative">
                    <img src={iconPreview} alt="preview" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
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
                    id="category-icon-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    {iconPreview ? 'Change image' : 'Upload image'}
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
