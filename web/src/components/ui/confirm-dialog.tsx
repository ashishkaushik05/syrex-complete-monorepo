import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  variant?: 'default' | 'destructive'
  onConfirm: () => void
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!w-[min(420px,90vw)] !max-w-[min(420px,90vw)]"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={
                variant === 'destructive'
                  ? 'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10'
                  : 'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10'
              }
            >
              {variant === 'destructive' ? (
                <AlertTriangleIcon className="size-4 text-destructive" />
              ) : (
                <CheckCircleIcon className="size-4 text-primary" />
              )}
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
