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

  it('supports telephonic closure from open states', () => {
    expect(resolveTransition('raised', 'telephonic_close').nextStatus).toBe('telephonic_closure');
    expect(resolveTransition('assigned', 'telephonic_close').nextStatus).toBe('telephonic_closure');
    expect(resolveTransition('visit', 'telephonic_close').nextStatus).toBe('telephonic_closure');
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
