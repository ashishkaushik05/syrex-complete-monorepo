import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

type TemplateField = {
  id: string
  fieldKey: string
  label: string
  fieldType: string
  isRequired: boolean
  isActive: boolean
  displayOrder: number
}

type FormTemplate = {
  id: string
  name: string
  description?: string | null
  version: number
  isActive: boolean
  fields?: TemplateField[]
}

const FIELD_TYPES = ['text', 'textarea', 'number', 'boolean', 'select', 'date'] as const

export function ServiceFormsPage() {
  const queryClient = useQueryClient()

  // Create template dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  // Selected template (expanded view)
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null)

  // Add field dialog state
  const [addFieldOpen, setAddFieldOpen] = useState(false)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<string>('text')
  const [newFieldRequired, setNewFieldRequired] = useState(true)
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Data fetching
  const templatesQuery = useQuery({
    queryKey: ['service-form-templates-admin'],
    queryFn: async () => {
      const response = await api.get('/service/forms/templates', { params: { withFields: true } })
      const payload = response.data as any
      return Array.isArray(payload?.data) ? payload.data : []
    },
  })

  const templates: FormTemplate[] = templatesQuery.data ?? []

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!createName.trim()) throw new Error('Template name is required')
      const response = await api.post('/service/forms/templates', {
        name: createName.trim(),
        description: createDescription.trim() || undefined,
      })
      const payload = response.data as any
      return payload?.data?.data ?? payload?.data ?? payload
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-form-templates-admin'] })
      setCreateOpen(false)
      resetCreateForm()
    },
    onError: (error) => {
      setCreateError(apiErrorMessage(error, 'Failed to create template'))
    },
  })

  // Add field mutation
  const addFieldMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('No template selected')
      if (!newFieldKey.trim()) throw new Error('Field key is required')
      if (!/^[a-z0-9_]+$/.test(newFieldKey.trim())) {
        throw new Error('Field key must only contain lowercase letters, numbers, and underscores')
      }
      if (!newFieldLabel.trim()) throw new Error('Field label is required')

      const response = await api.post(
        `/service/forms/templates/${selectedTemplate.id}/fields`,
        {
          fieldKey: newFieldKey.trim(),
          label: newFieldLabel.trim(),
          fieldType: newFieldType,
          isRequired: newFieldRequired,
          displayOrder: (selectedTemplate.fields?.length ?? 0),
        },
      )
      const payload = response.data as any
      return payload?.data?.data ?? payload?.data ?? payload
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-form-templates-admin'] })
      setAddFieldOpen(false)
      resetFieldForm()
    },
    onError: (error) => {
      setFieldError(apiErrorMessage(error, 'Failed to add field'))
    },
  })

  // Disable template mutation
  const disableTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await api.post(`/service/forms/templates/${templateId}/disable`, {})
      const payload = response.data as any
      return payload?.data?.data ?? payload?.data ?? payload
    },
    onSuccess: (_data, templateId) => {
      queryClient.invalidateQueries({ queryKey: ['service-form-templates-admin'] })
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null)
      }
    },
  })

  function resetCreateForm() {
    setCreateName('')
    setCreateDescription('')
    setCreateError(null)
  }

  function resetFieldForm() {
    setNewFieldKey('')
    setNewFieldLabel('')
    setNewFieldType('text')
    setNewFieldRequired(true)
    setFieldError(null)
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open)
    if (!open) resetCreateForm()
  }

  function handleAddFieldOpenChange(open: boolean) {
    setAddFieldOpen(open)
    if (!open) resetFieldForm()
  }

  function handleViewFields(template: FormTemplate) {
    setSelectedTemplate((prev) => (prev?.id === template.id ? null : template))
  }

  const loadError = templatesQuery.isError
    ? apiErrorMessage(templatesQuery.error, 'Unable to load form templates.')
    : null

  // Sync selectedTemplate with latest data from query
  const syncedSelectedTemplate =
    selectedTemplate
      ? (templates.find((t) => t.id === selectedTemplate.id) ?? selectedTemplate)
      : null

  return (
    <>
      {/* Templates list card */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Form Templates</CardTitle>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            New Template
          </Button>
        </CardHeader>
        <CardContent>
          {templatesQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading templates...</p>
          ) : null}
          {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

          {!templatesQuery.isLoading && !templatesQuery.isError ? (
            templates.length === 0 ? (
              <p className="text-sm text-slate-500">No form templates found.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Fields</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900">{template.name}</span>
                            {template.description ? (
                              <span className="text-xs text-slate-500">{template.description}</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>v{template.version}</TableCell>
                        <TableCell>
                          {template.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-500">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell>{Array.isArray(template.fields) ? template.fields.length : '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant={syncedSelectedTemplate?.id === template.id ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleViewFields(template)}
                            >
                              {syncedSelectedTemplate?.id === template.id ? 'Hide Fields' : 'View Fields'}
                            </Button>
                            {template.isActive ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                disabled={disableTemplateMutation.isPending}
                                onClick={() => disableTemplateMutation.mutate(template.id)}
                              >
                                Disable
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      {/* Selected template fields card */}
      {syncedSelectedTemplate ? (
        <Card className="mt-4 border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Fields for: {syncedSelectedTemplate.name}</CardTitle>
            <Button
              type="button"
              size="sm"
              disabled={!syncedSelectedTemplate.isActive}
              onClick={() => {
                setAddFieldOpen(true)
              }}
            >
              Add Field
            </Button>
          </CardHeader>
          <CardContent>
            {!Array.isArray(syncedSelectedTemplate.fields) ||
            syncedSelectedTemplate.fields.length === 0 ? (
              <p className="text-sm text-slate-500">No fields defined for this template.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncedSelectedTemplate.fields.map((field) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-medium">{field.label}</TableCell>
                        <TableCell>
                          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{field.fieldKey}</code>
                        </TableCell>
                        <TableCell>{field.fieldType}</TableCell>
                        <TableCell>
                          {field.isRequired ? (
                            <Badge className="bg-orange-100 text-orange-700">Required</Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-500">Optional</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {field.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-500">Inactive</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Create Template Dialog */}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>New Form Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Battery Fault Report"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-description">Description (optional)</Label>
              <textarea
                id="template-description"
                className="min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Brief description of what this form is used for"
                maxLength={1000}
              />
            </div>

            {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCreateOpenChange(false)}
              disabled={createTemplateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => createTemplateMutation.mutate()}
              disabled={createTemplateMutation.isPending}
            >
              {createTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Field Dialog */}
      <Dialog open={addFieldOpen} onOpenChange={handleAddFieldOpenChange}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Field to {syncedSelectedTemplate?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="field-key">Field Key</Label>
              <Input
                id="field-key"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g. fault_description"
                maxLength={100}
              />
              <p className="text-xs text-slate-500">Lowercase letters, numbers, and underscores only.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="field-label">Label</Label>
              <Input
                id="field-label"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="e.g. Fault Description"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="field-type">Type</Label>
              <select
                id="field-type"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value)}
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="field-required"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={newFieldRequired}
                onChange={(e) => setNewFieldRequired(e.target.checked)}
              />
              <Label htmlFor="field-required">Required</Label>
            </div>

            {fieldError ? <p className="text-sm text-red-600">{fieldError}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleAddFieldOpenChange(false)}
              disabled={addFieldMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => addFieldMutation.mutate()}
              disabled={addFieldMutation.isPending}
            >
              {addFieldMutation.isPending ? 'Adding...' : 'Add Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
