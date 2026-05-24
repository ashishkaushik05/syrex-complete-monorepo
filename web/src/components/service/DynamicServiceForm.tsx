import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multiselect' | 'date'

export type ValidationRules = {
  minLength?: number
  maxLength?: number
  regex?: string
  min?: number
  max?: number
  options?: string[]
  minSelections?: number
  maxSelections?: number
  minDate?: string
  maxDate?: string
}

export type FormField = {
  id: string
  fieldKey: string
  label: string
  fieldType: FieldType
  isRequired: boolean
  displayOrder: number
  validationRules: ValidationRules | null
  isActive: boolean
}

export type FormTemplate = {
  id: string
  name: string
  description: string | null
  version: number
  isActive: boolean
  fields?: FormField[]
}

export type FieldValue = { fieldKey: string; rawValue: string }

// ── Per-field validation ───────────────────────────────────────────────────────

function validateField(field: FormField, rawValue: string): string | null {
  const rules = (field.validationRules ?? {}) as ValidationRules
  const empty = rawValue.trim() === ''

  if (empty) {
    return field.isRequired ? `${field.label} is required` : null
  }

  const val = rawValue.trim()

  switch (field.fieldType) {
    case 'text':
    case 'textarea': {
      if (rules.minLength !== undefined && val.length < rules.minLength)
        return `Minimum ${rules.minLength} characters`
      if (rules.maxLength !== undefined && val.length > rules.maxLength)
        return `Maximum ${rules.maxLength} characters`
      if (rules.regex) {
        try {
          if (!new RegExp(rules.regex).test(val)) return 'Value does not match required format'
        } catch { /* invalid regex — skip */ }
      }
      return null
    }

    case 'number': {
      const num = Number(val)
      if (isNaN(num)) return 'Must be a valid number'
      if (rules.min !== undefined && num < rules.min) return `Minimum value is ${rules.min}`
      if (rules.max !== undefined && num > rules.max) return `Maximum value is ${rules.max}`
      return null
    }

    case 'boolean': {
      if (val !== 'true' && val !== 'false') return 'Must select Yes or No'
      return null
    }

    case 'select': {
      const options = rules.options ?? []
      if (!options.includes(val)) return `Must be one of: ${options.join(', ')}`
      return null
    }

    case 'multiselect': {
      const options = rules.options ?? []
      let selected: string[]
      try {
        selected = JSON.parse(val)
        if (!Array.isArray(selected)) throw new Error()
      } catch { return 'Invalid selection' }
      const invalid = selected.filter((s) => !options.includes(s))
      if (invalid.length > 0) return `Invalid option(s): ${invalid.join(', ')}`
      if (rules.minSelections !== undefined && selected.length < rules.minSelections)
        return `Select at least ${rules.minSelections}`
      if (rules.maxSelections !== undefined && selected.length > rules.maxSelections)
        return `Select at most ${rules.maxSelections}`
      return null
    }

    case 'date': {
      const d = new Date(val)
      if (isNaN(d.getTime())) return 'Must be a valid date'
      if (rules.minDate && d < new Date(rules.minDate)) return `Must be on or after ${rules.minDate}`
      if (rules.maxDate && d > new Date(rules.maxDate)) return `Must be on or before ${rules.maxDate}`
      return null
    }

    default:
      return null
  }
}

// ── Field renderers ───────────────────────────────────────────────────────────

interface FieldProps {
  field: FormField
  value: string
  error: string | null
  touched: boolean
  onChange: (v: string) => void
  onBlur: () => void
  disabled?: boolean
}

function FieldInput({ field, value, error, touched, onChange, onBlur, disabled }: FieldProps) {
  const rules = (field.validationRules ?? {}) as ValidationRules
  const hasError = touched && error !== null
  const base =
    'w-full rounded-md border bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 ' +
    (hasError
      ? 'border-rose-400 focus:ring-rose-300'
      : 'border-slate-200 focus:ring-teal-300 focus:border-teal-400')

  switch (field.fieldType) {
    case 'textarea':
      return (
        <textarea
          id={field.fieldKey}
          className={`${base} min-h-[80px] resize-y`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          maxLength={rules.maxLength}
          placeholder={`Enter ${field.label.toLowerCase()}…`}
        />
      )

    case 'number':
      return (
        <Input
          id={field.fieldKey}
          type="number"
          className={hasError ? 'border-rose-400 focus:ring-rose-300' : ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          min={rules.min}
          max={rules.max}
          step="any"
          placeholder={`Enter number${rules.min !== undefined || rules.max !== undefined ? ` (${rules.min ?? ''}–${rules.max ?? ''})` : ''}…`}
        />
      )

    case 'boolean':
      return (
        <div className="flex gap-3">
          {(['true', 'false'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name={field.fieldKey}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                onBlur={onBlur}
                disabled={disabled}
                className="h-4 w-4 accent-teal-600"
              />
              <span className="text-sm text-slate-700">{opt === 'true' ? 'Yes' : 'No'}</span>
            </label>
          ))}
        </div>
      )

    case 'select': {
      const options = rules.options ?? []
      return (
        <select
          id={field.fieldKey}
          className={`h-10 ${base}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
        >
          <option value="">— Select —</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }

    case 'multiselect': {
      const options = rules.options ?? []
      let selected: string[] = []
      try { selected = value ? JSON.parse(value) : [] } catch { /* ignore */ }
      function toggle(opt: string) {
        const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]
        onChange(JSON.stringify(next))
      }
      return (
        <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 p-3">
          {options.length === 0 ? (
            <p className="text-xs text-slate-400">No options configured</p>
          ) : (
            options.map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  onBlur={onBlur}
                  disabled={disabled}
                  className="h-4 w-4 rounded accent-teal-600"
                />
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            ))
          )}
        </div>
      )
    }

    case 'date':
      return (
        <Input
          id={field.fieldKey}
          type="date"
          className={hasError ? 'border-rose-400 focus:ring-rose-300' : ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          min={rules.minDate}
          max={rules.maxDate}
        />
      )

    default: // text
      return (
        <Input
          id={field.fieldKey}
          type="text"
          className={hasError ? 'border-rose-400 focus:ring-rose-300' : ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          maxLength={rules.maxLength}
          placeholder={`Enter ${field.label.toLowerCase()}…`}
        />
      )
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

interface DynamicServiceFormProps {
  template: FormTemplate
  initialValues?: Record<string, string>
  onSubmit: (values: FieldValue[]) => void
  isPending?: boolean
  submitLabel?: string
  disabled?: boolean
}

export function DynamicServiceForm({
  template,
  initialValues = {},
  onSubmit,
  isPending = false,
  submitLabel = 'Submit Form',
  disabled = false,
}: DynamicServiceFormProps) {
  const activeFields = (template.fields ?? [])
    .filter((f) => f.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder)

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of activeFields) init[f.fieldKey] = initialValues[f.fieldKey] ?? ''
    return init
  })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  // Reset when template changes — batch state updates to avoid cascading render warning
  useEffect(() => {
    const init: Record<string, string> = {}
    for (const f of activeFields) init[f.fieldKey] = initialValues[f.fieldKey] ?? ''
    // Use queueMicrotask to defer state batching outside the effect synchronous phase
    queueMicrotask(() => {
      setValues(init)
      setTouched({})
      setSubmitAttempted(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id])

  function getError(field: FormField, rawValue?: string): string | null {
    return validateField(field, rawValue ?? values[field.fieldKey] ?? '')
  }

  const errors = Object.fromEntries(activeFields.map((f) => [f.fieldKey, getError(f)]))
  const hasErrors = Object.values(errors).some((e) => e !== null)

  function handleChange(fieldKey: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldKey]: value }))
  }

  function handleBlur(fieldKey: string) {
    setTouched((prev) => ({ ...prev, [fieldKey]: true }))
  }

  function handleSubmit() {
    setSubmitAttempted(true)
    const allTouched = Object.fromEntries(activeFields.map((f) => [f.fieldKey, true]))
    setTouched(allTouched)

    // Recompute errors synchronously with current values — avoids stale closure
    const currentErrors: Record<string, string | null> = {}
    for (const field of activeFields) {
      currentErrors[field.fieldKey] = getError(field, values[field.fieldKey] ?? '')
    }
    const hasCurrentErrors = Object.values(currentErrors).some((e) => e !== null)
    if (hasCurrentErrors) return

    // Include ALL fields in payload — never silently drop empty optional ones
    const payload: FieldValue[] = activeFields.map((f) => ({
      fieldKey: f.fieldKey,
      rawValue: values[f.fieldKey] ?? '',
    }))

    onSubmit(payload)
  }

  if (activeFields.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">This template has no active fields.</p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Template header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{template.name}</p>
          {template.description ? (
            <p className="text-xs text-slate-500 mt-0.5">{template.description}</p>
          ) : null}
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
          v{template.version}
        </span>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {activeFields.map((field) => {
          const isTouched = touched[field.fieldKey] || submitAttempted
          const error = isTouched ? errors[field.fieldKey] : null
          return (
            <div key={field.fieldKey} className="space-y-1.5">
              <Label htmlFor={field.fieldKey} className="flex items-center gap-1 text-sm font-medium text-slate-700">
                {field.label}
                {field.isRequired ? (
                  <span className="text-rose-500">*</span>
                ) : (
                  <span className="text-slate-400 text-xs font-normal">(optional)</span>
                )}
              </Label>
              <FieldInput
                field={field}
                value={values[field.fieldKey] ?? ''}
                error={error}
                touched={isTouched}
                onChange={(v) => handleChange(field.fieldKey, v)}
                onBlur={() => handleBlur(field.fieldKey)}
                disabled={disabled || isPending}
              />
              {error ? (
                <p className="text-xs text-rose-600 flex items-center gap-1">
                  <span>⚠</span> {error}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      {submitAttempted && hasErrors ? (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          Please fix the errors above before submitting.
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        onClick={handleSubmit}
        disabled={disabled || isPending}
        className="bg-teal-600 hover:bg-teal-700 text-white"
      >
        {isPending ? 'Submitting…' : submitLabel}
      </Button>
    </div>
  )
}
