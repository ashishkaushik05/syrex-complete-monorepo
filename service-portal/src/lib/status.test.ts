import { describe, expect, it } from 'vitest'
import { statusLabel, timelineLabel } from './status'

describe('customer status projection', () => {
  it('collapses internal review states into customer-safe labels', () => {
    expect(statusLabel('test_result_submitted')).toBe('Under review')
    expect(statusLabel('retest_requested')).toBe('Under review')
    expect(statusLabel('telephonic_closure')).toBe('Closed')
  })

  it('does not expose unknown internal activity names', () => {
    expect(timelineLabel('internal_note_added')).toBe('Complaint updated')
  })
})
