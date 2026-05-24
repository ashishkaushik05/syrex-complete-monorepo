import { describe, expect, it } from 'bun:test';

import { normalizeSerial, resolveTransition } from './service-shared';

describe('service transition engine', () => {
  it('allows primary lifecycle progression', () => {
    expect(resolveTransition('raised', 'assign').nextStatus).toBe('assigned');
    expect(resolveTransition('assigned', 'visit_logged').nextStatus).toBe('visit');
    expect(resolveTransition('visit', 'test_submitted').nextStatus).toBe('test_result_submitted');
    expect(resolveTransition('test_result_submitted', 'tested_ok_close').nextStatus).toBe('resolved');
  });

  it('allows retest loop', () => {
    expect(resolveTransition('test_result_submitted', 'retest_requested').nextStatus).toBe('retest_requested');
    expect(resolveTransition('retest_requested', 'visit_logged').nextStatus).toBe('visit');
  });

  it('supports telephonic closure from raised or assigned only', () => {
    expect(resolveTransition('raised', 'telephonic_close').nextStatus).toBe('telephonic_closure');
    expect(resolveTransition('assigned', 'telephonic_close').nextStatus).toBe('telephonic_closure');
  });

  it('telephonic_close from test_result_submitted throws CONFLICT', () => {
    expect(() => resolveTransition('test_result_submitted', 'telephonic_close')).toThrow();
  });

  it('cancel from resolved throws (FINAL_STATUS guard)', () => {
    expect(() => resolveTransition('resolved', 'cancel')).toThrow();
  });

  it('warranty_approve from test_result_submitted returns test_result_submitted (statusChanged false)', () => {
    const result = resolveTransition('test_result_submitted', 'warranty_approve');
    expect(result.nextStatus).toBe('test_result_submitted');
    expect(result.statusChanged).toBe(false);
  });

  it('warranty_reject from test_result_submitted resolves the complaint', () => {
    const result = resolveTransition('test_result_submitted', 'warranty_reject');
    expect(result.nextStatus).toBe('resolved');
    expect(result.statusChanged).toBe(true);
  });

  it('rejects invalid transition attempts', () => {
    expect(() => resolveTransition('raised', 'test_submitted')).toThrow();
    expect(() => resolveTransition('raised', 'visit_logged')).toThrow();
    expect(() => resolveTransition('resolved', 'visit_logged')).toThrow();
    expect(() => resolveTransition('assigned', 'assign')).toThrow();
  });
});

describe('serial normalization', () => {
  it('normalizes to uppercase alphanumeric token', () => {
    expect(normalizeSerial(' sn- 123 /ab ')).toBe('SN123AB');
  });
});
