import { statusLabel, statusTone } from '../lib/status'
import type { ComplaintStatus } from '../types'

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  return <span className={`status-badge status-${statusTone(status)}`}>{statusLabel(status)}</span>
}
