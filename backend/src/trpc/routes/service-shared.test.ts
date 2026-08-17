import { describe, expect, it } from 'bun:test';

import { createServiceComplaint, normalizeSerial, resolveTransition } from './service-shared';

describe('service transition engine', () => {
  it('allows primary lifecycle progression', () => {
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
  });
});

describe('serial normalization', () => {
  it('normalizes to uppercase alphanumeric token', () => {
    expect(normalizeSerial(' sn- 123 /ab ')).toBe('SN123AB');
  });
});

function createCorePrisma(options: { product?: boolean; duplicate?: boolean } = {}) {
  const calls: string[] = [];
  let createdData: any;
  let productWhere: any;
  const tx: any = {
    $executeRaw: async () => {
      calls.push('serial-lock');
      return 1;
    },
    $queryRaw: async () => [{ nextval: 7n }],
    product: {
      findFirst: async ({ where }: any) => {
        calls.push('resolve-sku');
        productWhere = where;
        return options.product === false ? null : { id: 'product-1', sku: 'SKU-1' };
      },
    },
    serviceComplaint: {
      findFirst: async () => {
        calls.push('duplicate-check');
        return options.duplicate ? { complaintNumber: 'CMP-2026-000006' } : null;
      },
      create: async ({ data }: any) => {
        calls.push('create-complaint');
        createdData = data;
        return { id: 'complaint-1' };
      },
    },
    serviceUser: {
      findUnique: async () => ({ id: 'service-user-1', isActive: true }),
    },
    serviceComplaintActivity: {
      create: async () => {
        calls.push('create-activity');
        return {};
      },
    },
    auditLog: { create: async () => ({}) },
    dispatchLineSerial: { findMany: async () => [] },
    dispatchLine: { findMany: async () => [] },
    serviceSerialIndex: {
      findUnique: async () => null,
      upsert: async () => {
        calls.push('upsert-serial-index');
        return { normalizedSerial: 'SERIAL1', hydratedLegacy: false };
      },
    },
    serviceSerialEvent: {
      count: async () => 0,
      createMany: async () => ({}),
    },
  };
  const prisma: any = {
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => {
      calls.push('begin-transaction');
      const result = await callback(tx);
      calls.push('commit-transaction');
      return result;
    },
  };
  return {
    prisma,
    calls,
    getCreatedData: () => createdData,
    getProductWhere: () => productWhere,
  };
}

const createInput = {
  orgId: 'org-test',
  issueCategory: 'Not charging',
  description: 'Battery does not charge',
  customerName: 'Customer',
  customerPhone: '9999999999',
  complainantType: 'self' as const,
  sku: 'SKU-1',
  serialNumber: ' serial-1 ',
  serviceUserId: 'service-user-1',
};

describe('transactional complaint create core', () => {
  it('rejects an unresolved active SKU before creating a complaint', async () => {
    const { prisma, calls, getProductWhere } = createCorePrisma({ product: false });
    await expect(createServiceComplaint(prisma, createInput))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(calls).not.toContain('create-complaint');
    expect(getProductWhere()).toEqual({
      sku: 'SKU-1',
      isActive: true,
      category: {
        isActive: true,
        brand: { isActive: true },
      },
    });
  });

  it('locks the normalized serial before checking open duplicates', async () => {
    const { prisma, calls } = createCorePrisma({ duplicate: true });
    await expect(createServiceComplaint(prisma, createInput))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    expect(calls.indexOf('serial-lock')).toBeLessThan(calls.indexOf('duplicate-check'));
    expect(calls).not.toContain('create-complaint');
  });

  it('creates one owned line, activity, and serial index in one transaction', async () => {
    const { prisma, calls, getCreatedData } = createCorePrisma();
    const id = await createServiceComplaint(prisma, createInput);
    expect(id).toBe('complaint-1');
    expect(getCreatedData()).toMatchObject({
      complaintNumber: 'CMP-2026-000007',
      orgId: 'org-test',
      raisedByUserId: null,
      raisedByServiceUserId: 'service-user-1',
      lines: {
        create: {
          sku: 'SKU-1',
          serialNumber: 'serial-1',
          normalizedSerial: 'SERIAL1',
          productId: 'product-1',
        },
      },
    });
    expect(calls).toEqual([
      'begin-transaction',
      'serial-lock',
      'resolve-sku',
      'duplicate-check',
      'create-complaint',
      'create-activity',
      'upsert-serial-index',
      'commit-transaction',
    ]);
  });
});
