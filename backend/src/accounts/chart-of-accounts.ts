import type { AccountType } from "@prisma/client";

// Canonical account codes referenced by the posting engine. Keep these stable —
// the posting engine looks accounts up by code, and the seed creates them.
export const ACCOUNT_CODES = {
  // Assets
  cash: "1100",
  bank: "1150",
  debtors: "1200", // Accounts Receivable — party = outlet
  inventory: "1300",
  // Liabilities
  gstOutputCgst: "2110",
  gstOutputSgst: "2120",
  gstOutputIgst: "2130",
  creditors: "2200", // Accounts Payable
  // Equity
  ownersCapital: "3100",
  openingBalanceEquity: "3900",
  // Income
  salesBatteries: "4100",
  scrapIncome: "4200",
  // Expense
  purchasesBatteries: "5100",
  oldBatteryBuyback: "5200",
  warrantyExpense: "5300",
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

type SeedAccount = {
  code: string;
  name: string;
  type: AccountType;
  parentCode: string | null;
  isPostable: boolean;
};

// Battery-distributor Chart of Accounts template (Phase 1). Header nodes
// (isPostable: false) group their children for reporting. Accounts marked for
// later phases are seeded now so reports have a stable structure.
export const CHART_OF_ACCOUNTS_TEMPLATE: SeedAccount[] = [
  // Assets
  { code: "1000", name: "Assets", type: "ASSET", parentCode: null, isPostable: false },
  { code: ACCOUNT_CODES.cash, name: "Cash in Hand", type: "ASSET", parentCode: "1000", isPostable: true },
  { code: ACCOUNT_CODES.bank, name: "Bank Account", type: "ASSET", parentCode: "1000", isPostable: true },
  { code: ACCOUNT_CODES.debtors, name: "Accounts Receivable (Debtors)", type: "ASSET", parentCode: "1000", isPostable: true },
  { code: ACCOUNT_CODES.inventory, name: "Inventory — Batteries", type: "ASSET", parentCode: "1000", isPostable: true },
  // Liabilities
  { code: "2000", name: "Liabilities", type: "LIABILITY", parentCode: null, isPostable: false },
  { code: "2100", name: "GST Output (Payable)", type: "LIABILITY", parentCode: "2000", isPostable: false },
  { code: ACCOUNT_CODES.gstOutputCgst, name: "GST Output — CGST", type: "LIABILITY", parentCode: "2100", isPostable: true },
  { code: ACCOUNT_CODES.gstOutputSgst, name: "GST Output — SGST", type: "LIABILITY", parentCode: "2100", isPostable: true },
  { code: ACCOUNT_CODES.gstOutputIgst, name: "GST Output — IGST", type: "LIABILITY", parentCode: "2100", isPostable: true },
  { code: ACCOUNT_CODES.creditors, name: "Accounts Payable (Creditors)", type: "LIABILITY", parentCode: "2000", isPostable: true },
  // Equity
  { code: "3000", name: "Equity", type: "EQUITY", parentCode: null, isPostable: false },
  { code: ACCOUNT_CODES.ownersCapital, name: "Owner's Capital", type: "EQUITY", parentCode: "3000", isPostable: true },
  { code: ACCOUNT_CODES.openingBalanceEquity, name: "Opening Balance Equity", type: "EQUITY", parentCode: "3000", isPostable: true },
  // Income
  { code: "4000", name: "Income", type: "INCOME", parentCode: null, isPostable: false },
  { code: ACCOUNT_CODES.salesBatteries, name: "Sales — Batteries", type: "INCOME", parentCode: "4000", isPostable: true },
  { code: ACCOUNT_CODES.scrapIncome, name: "Battery Scrap Income", type: "INCOME", parentCode: "4000", isPostable: true },
  // Expense
  { code: "5000", name: "Expenses", type: "EXPENSE", parentCode: null, isPostable: false },
  { code: ACCOUNT_CODES.purchasesBatteries, name: "Purchases — Batteries", type: "EXPENSE", parentCode: "5000", isPostable: true },
  { code: ACCOUNT_CODES.oldBatteryBuyback, name: "Old Battery Buyback", type: "EXPENSE", parentCode: "5000", isPostable: true },
  { code: ACCOUNT_CODES.warrantyExpense, name: "Warranty Expense", type: "EXPENSE", parentCode: "5000", isPostable: true },
];
