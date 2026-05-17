import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlarmClock,
  BatteryCharging,
  Bell,
  Boxes,
  Building2,
  CalendarCheck,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MapPinned,
  Menu,
  PauseCircle,
  Plug,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/context/PermissionContext";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { notificationTargetPath } from "@/lib/notifications";
import type { NotificationItem } from "@/lib/notifications";
import { cn } from "@/lib/utils";

type NavItem = {
  section:
    | "Core"
    | "Sales"
    | "Accounts"
    | "Dispatch"
    | "Catalog"
    | "Field Sense"
    | "Service"
    | "Administration";
  label: string;
  to: string;
  icon: typeof Bell;
  exact: boolean;
  requiredPermission?: string;
};

type NotificationListResponse = {
  data: NotificationItem[];
};

const navItems: NavItem[] = [
  {
    section: "Core",
    label: "Overview",
    to: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    section: "Core",
    label: "Notifications",
    to: "/dashboard/notifications",
    icon: Bell,
    exact: false,
  },
  {
    section: "Sales",
    label: "Outlets",
    to: "/dashboard/outlets",
    icon: Store,
    exact: false,
    requiredPermission: "outlets:read",
  },
  {
    section: "Sales",
    label: "Orders",
    to: "/dashboard/sales/orders",
    icon: ShoppingCart,
    exact: false,
    requiredPermission: "orders:read",
  },
  {
    section: "Sales",
    label: "Dispatches",
    to: "/dashboard/sales/dispatches",
    icon: Truck,
    exact: false,
    requiredPermission: "dispatches:read",
  },
  {
    section: "Sales",
    label: "Sale Reports",
    to: "/dashboard/sales/reports",
    icon: ClipboardList,
    exact: false,
    requiredPermission: "orders:read",
  },
  {
    section: "Accounts",
    label: "Invoices",
    to: "/dashboard/accounts/invoices",
    icon: Receipt,
    exact: false,
    requiredPermission: "invoices:read",
  },
  {
    section: "Accounts",
    label: "Approval Queue",
    to: "/dashboard/accounts/approval",
    icon: CheckCheck,
    exact: false,
    requiredPermission: "orders:approve",
  },
  {
    section: "Accounts",
    label: "AR Aging",
    to: "/dashboard/accounts/ar-aging",
    icon: Receipt,
    exact: false,
    requiredPermission: "invoices:read",
  },
  {
    section: "Accounts",
    label: "Outstanding",
    to: "/dashboard/accounts/outstanding",
    icon: Building2,
    exact: false,
    requiredPermission: "payments:read",
  },
  {
    section: "Accounts",
    label: "Payments",
    to: "/dashboard/accounts/payments",
    icon: Receipt,
    exact: false,
    requiredPermission: "payments:write",
  },
  {
    section: "Catalog",
    label: "Catalog Brands",
    to: "/dashboard/catalog/brands",
    icon: Wrench,
    exact: false,
    requiredPermission: "catalog:read",
  },
  {
    section: "Catalog",
    label: "Catalog Categories",
    to: "/dashboard/catalog/categories",
    icon: Wrench,
    exact: false,
    requiredPermission: "catalog:read",
  },
  {
    section: "Catalog",
    label: "Catalog SKUs",
    to: "/dashboard/catalog/skus",
    icon: Wrench,
    exact: false,
    requiredPermission: "catalog:read",
  },
  {
    section: "Dispatch",
    label: "Orders Queue",
    to: "/dashboard/dispatch/orders",
    icon: ShoppingCart,
    exact: false,
    requiredPermission: "orders:read",
  },
  {
    section: "Dispatch",
    label: "Dispatch Queue",
    to: "/dashboard/dispatch/queue",
    icon: Truck,
    exact: false,
    requiredPermission: "dispatches:read",
  },
  {
    section: "Dispatch",
    label: "Dispatch Runs",
    to: "/dashboard/dispatch/runs",
    icon: Truck,
    exact: false,
    requiredPermission: "dispatches:read",
  },
  {
    section: "Dispatch",
    label: "Warehouses",
    to: "/dashboard/dispatch/warehouses",
    icon: Boxes,
    exact: false,
    requiredPermission: "warehouses:read",
  },
  {
    section: "Service",
    label: "Complaints",
    to: "/dashboard/service/complaints",
    icon: ShieldCheck,
    exact: false,
    requiredPermission: "service:read",
  },
  {
    section: "Service",
    label: "Serial Lookup",
    to: "/dashboard/service/serials",
    icon: Search,
    exact: false,
    requiredPermission: "service:read",
  },
  {
    section: "Service",
    label: "Warranty Queue",
    to: "/dashboard/service/warranty",
    icon: Wrench,
    exact: false,
    requiredPermission: "service:approve",
  },
  {
    section: "Service",
    label: "Integrations",
    to: "/dashboard/service/integrations",
    icon: Plug,
    exact: false,
    requiredPermission: "service:manage",
  },
  {
    section: "Field Sense",
    label: "Live Map",
    to: "/dashboard/map",
    icon: MapPinned,
    exact: false,
    requiredPermission: "field:read",
  },
  {
    section: "Administration",
    label: "Users",
    to: "/dashboard/users",
    icon: Users,
    exact: false,
    requiredPermission: "users:read",
  },
  {
    section: "Administration",
    label: "Roles",
    to: "/dashboard/roles",
    icon: ShieldCheck,
    exact: false,
    requiredPermission: "roles:read",
  },
  {
    section: "Administration",
    label: "Permissions",
    to: "/dashboard/permissions",
    icon: ShieldCheck,
    exact: false,
    requiredPermission: "roles:read",
  },
  {
    section: "Field Sense",
    label: "Field Schedule",
    to: "/dashboard/field-schedule",
    icon: AlarmClock,
    exact: false,
    requiredPermission: "field:write",
  },
  {
    section: "Field Sense",
    label: "Attendance",
    to: "/dashboard/attendance",
    icon: CalendarCheck,
    exact: false,
    requiredPermission: "field:read",
  },
  {
    section: "Field Sense",
    label: "Shifts",
    to: "/dashboard/field-shifts",
    icon: ListTodo,
    exact: false,
    requiredPermission: "field:read",
  },
  {
    section: "Field Sense",
    label: "Visits",
    to: "/dashboard/field-visits",
    icon: MapPinned,
    exact: false,
    requiredPermission: "field:read",
  },
  {
    section: "Field Sense",
    label: "Stops",
    to: "/dashboard/field-stops",
    icon: PauseCircle,
    exact: false,
    requiredPermission: "field:read",
  },
];

type BreadcrumbSegment = { label: string; to?: string };

function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const crumbs: BreadcrumbSegment[] = [{ label: "Dashboard", to: "/dashboard" }];

  if (pathname === "/dashboard") return [];

  if (pathname.startsWith("/dashboard/sales/orders/")) {
    crumbs.push({ label: "Sales Orders", to: "/dashboard/sales/orders" });
    crumbs.push({ label: "Order Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/sales/orders")) {
    crumbs.push({ label: "Sales Orders" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/sales/invoices/")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Invoices", to: "/dashboard/accounts/invoices" });
    crumbs.push({ label: "Invoice Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/sales/invoices")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Invoices" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/sales/dispatches/")) {
    crumbs.push({ label: "Dispatches", to: "/dashboard/sales/dispatches" });
    crumbs.push({ label: "Dispatch Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/sales/dispatches")) {
    crumbs.push({ label: "Dispatches" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/sales/reports/")) {
    crumbs.push({ label: "Sale Reports", to: "/dashboard/sales/reports" });
    crumbs.push({ label: "Report Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/sales/reports")) {
    crumbs.push({ label: "Sale Reports" });
    return crumbs;
  }
  if (pathname.match(/^\/dashboard\/outlets\/[^/]+/)) {
    crumbs.push({ label: "Outlets", to: "/dashboard/outlets" });
    crumbs.push({ label: "Outlet Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/outlets")) {
    crumbs.push({ label: "Outlets" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/accounts/invoices/")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Invoices", to: "/dashboard/accounts/invoices" });
    crumbs.push({ label: "Invoice Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/accounts/invoices")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Invoices" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/accounts/approval")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Approval Queue" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/accounts/ar-aging")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "AR Aging" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/accounts/outstanding")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Outstanding Balances" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/accounts/payments")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Payments" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/orders/")) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Orders Queue", to: "/dashboard/dispatch/orders" });
    crumbs.push({ label: "Order Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/orders")) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Orders Queue" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/queue/")) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Dispatch Queue", to: "/dashboard/dispatch/queue" });
    crumbs.push({ label: "Warehouse Queue" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/queue")) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Dispatch Queue" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/invoices/")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Invoices", to: "/dashboard/accounts/invoices" });
    crumbs.push({ label: "Invoice Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/invoices")) {
    crumbs.push({ label: "Accounts" });
    crumbs.push({ label: "Invoices" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/runs/")) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Dispatch Runs", to: "/dashboard/dispatch/runs" });
    crumbs.push({ label: "Dispatch Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/runs")) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Dispatch Runs" });
    return crumbs;
  }
  if (pathname.match(/^\/dashboard\/dispatch\/warehouses\/[^/]+\/grn$/)) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Warehouses", to: "/dashboard/dispatch/warehouses" });
    crumbs.push({ label: "Record GRN" });
    return crumbs;
  }
  if (pathname.match(/^\/dashboard\/dispatch\/warehouses\/[^/]+\/adjustment$/)) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Warehouses", to: "/dashboard/dispatch/warehouses" });
    crumbs.push({ label: "Stock Adjustment" });
    return crumbs;
  }
  if (pathname.match(/^\/dashboard\/dispatch\/warehouses\/[^/]+/)) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Warehouses", to: "/dashboard/dispatch/warehouses" });
    crumbs.push({ label: "Warehouse Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/dispatch/warehouses")) {
    crumbs.push({ label: "Dispatch" });
    crumbs.push({ label: "Warehouses" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/catalog/brands")) {
    crumbs.push({ label: "Catalog" });
    crumbs.push({ label: "Catalog Brands" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/catalog/categories")) {
    crumbs.push({ label: "Catalog" });
    crumbs.push({ label: "Catalog Categories" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/catalog/skus")) {
    crumbs.push({ label: "Catalog" });
    crumbs.push({ label: "Catalog SKUs" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/roles")) {
    crumbs.push({ label: "Administration" });
    crumbs.push({ label: "Roles" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/permissions")) {
    crumbs.push({ label: "Administration" });
    crumbs.push({ label: "Permissions" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/map")) {
    crumbs.push({ label: "Field Sense" });
    crumbs.push({ label: "Live Map" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/field-schedule")) {
    crumbs.push({ label: "Field Sense" });
    crumbs.push({ label: "Field Schedule" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/attendance")) {
    crumbs.push({ label: "Field Sense" });
    crumbs.push({ label: "Attendance" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/notifications")) {
    crumbs.push({ label: "Notifications" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/service/complaints/")) {
    crumbs.push({ label: "Service", to: "/dashboard/service/complaints" });
    crumbs.push({ label: "Complaint Details" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/service/complaints")) {
    crumbs.push({ label: "Service" });
    crumbs.push({ label: "Complaints" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/service/serials")) {
    crumbs.push({ label: "Service", to: "/dashboard/service/complaints" });
    crumbs.push({ label: "Serial Lookup" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/service/warranty")) {
    crumbs.push({ label: "Service", to: "/dashboard/service/complaints" });
    crumbs.push({ label: "Warranty Queue" });
    return crumbs;
  }
  if (pathname.startsWith("/dashboard/service/integrations")) {
    crumbs.push({ label: "Service", to: "/dashboard/service/complaints" });
    crumbs.push({ label: "Integrations" });
    return crumbs;
  }

  return crumbs;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "S";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

const sectionColors: Record<NavItem["section"], string> = {
  Core: "text-slate-400",
  Sales: "text-cyan-400",
  Accounts: "text-emerald-400",
  Dispatch: "text-amber-400",
  Catalog: "text-indigo-400",
  "Field Sense": "text-sky-400",
  Service: "text-teal-400",
  Administration: "text-rose-400",
};

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logoutMutation } = useAuth();
  const { can, isAdmin } = usePermission();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<NavItem["section"], boolean>>>({
    Core: true,
    Sales: true,
    Accounts: true,
    Dispatch: true,
    Catalog: true,
    "Field Sense": true,
    Service: true,
    Administration: true,
  });
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(location.pathname), [location.pathname]);

  const visibleNavItems = useMemo(() => {
    return navItems.filter((item) => {
      if (!item.requiredPermission) return true;
      if (isAdmin) return true;
      return can(item.requiredPermission);
    });
  }, [can, isAdmin]);

  const sectionedNavItems = useMemo(() => {
    const sectionOrder: NavItem["section"][] = [
      "Core",
      "Sales",
      "Accounts",
      "Dispatch",
      "Catalog",
      "Field Sense",
      "Service",
      "Administration",
    ];
    return sectionOrder
      .map((section) => ({
        section,
        items: visibleNavItems.filter((item) => item.section === section),
      }))
      .filter((group) => group.items.length > 0);
  }, [visibleNavItems]);

  const toggleSection = (section: NavItem["section"]) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const unreadCountQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const response = await api.get<{ data: { count: number } }>("/notifications/unread-count");
      return response.data.data.count;
    },
    refetchInterval: 30000,
  });

  const panelNotificationsQuery = useQuery({
    queryKey: ["notifications", "panel"],
    queryFn: async () => {
      const response = await api.get<NotificationListResponse>("/notifications", {
        params: { page: 1, limit: 6 },
      });
      return response.data.data;
    },
    enabled: notificationsOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/notifications/${notificationId}/read`);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] }),
      ]);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.post("/notifications/read-all");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] }),
      ]);
    },
  });

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onDocumentPointerDown = (event: MouseEvent) => {
      if (!notificationsRef.current) return;
      if (notificationsRef.current.contains(event.target as Node)) return;
      setNotificationsOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", onDocumentPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [notificationsOpen]);

  const onSignOut = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      navigate("/login");
    }
  };

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      try {
        await markReadMutation.mutateAsync(notification.id);
      } catch {
        // Continue navigation even if read update fails.
      }
    }
    setNotificationsOpen(false);
    navigate(notificationTargetPath(notification));
  };

  const unreadCount = unreadCountQuery.data ?? 0;
  const panelNotifications = panelNotificationsQuery.data ?? [];

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-3 border-b border-slate-700/60 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500">
          <BatteryCharging className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight text-white">Syrex</p>
          <p className="text-[11px] text-slate-400">Operations</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {sectionedNavItems.map((group, index) => (
          <div
            key={group.section}
            className={cn("space-y-0.5", index > 0 && "mt-5")}
          >
            <button
              type="button"
              onClick={() => toggleSection(group.section)}
              aria-expanded={!collapsedSections[group.section]}
              className="mb-1.5 flex w-full items-center justify-between rounded-md px-3 py-1 text-left hover:bg-white/5"
            >
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-widest",
                  sectionColors[group.section as NavItem["section"]],
                )}
              >
                {group.section}
              </span>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 text-slate-500 transition-transform",
                  collapsedSections[group.section] ? "rotate-0" : "rotate-90",
                )}
              />
            </button>
            {!collapsedSections[group.section] && group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-white/10 text-white shadow-sm"
                      : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={cn("h-4 w-4 shrink-0", isActive ? "text-cyan-300" : "text-slate-500")}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.label === "Notifications" && unreadCount > 0 && (
                      <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-700/60 p-3">
        <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="bg-cyan-600 text-xs font-semibold text-white">
              {initials(user?.name ?? "Syrex")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.name ?? "—"}</p>
            <p className="truncate text-[11px] text-slate-400">{user?.email ?? "—"}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={logoutMutation.isPending}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col bg-[#0d1526] md:flex">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[#0d1526]">
            <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500">
                  <BatteryCharging className="h-4 w-4 text-white" />
                </div>
                <p className="text-sm font-bold text-white">Syrex</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              {sectionedNavItems.map((group, index) => (
                <div key={group.section} className={cn("space-y-0.5", index > 0 && "mt-5")}>
                  <button
                    type="button"
                    onClick={() => toggleSection(group.section)}
                    aria-expanded={!collapsedSections[group.section]}
                    className="mb-1.5 flex w-full items-center justify-between rounded-md px-3 py-1 text-left hover:bg-white/5"
                  >
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-widest",
                        sectionColors[group.section as NavItem["section"]],
                      )}
                    >
                      {group.section}
                    </span>
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 text-slate-500 transition-transform",
                        collapsedSections[group.section] ? "rotate-0" : "rotate-90",
                      )}
                    />
                  </button>
                  {!collapsedSections[group.section] && group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.exact}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                          isActive
                            ? "bg-white/10 text-white"
                            : "text-slate-300 hover:bg-white/5 hover:text-white",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0 text-slate-500" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className="border-t border-slate-700/60 p-3">
              <p className="truncate px-2 text-sm text-slate-300">{user?.name ?? "—"}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full border-slate-600 bg-transparent text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={onSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="md:pl-56">
        {/* Top Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 md:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 md:hidden"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>

              {breadcrumbs.length > 0 ? (
                <nav className="flex items-center gap-1 text-sm">
                  {breadcrumbs.map((crumb, index) => (
                    <span key={index} className="flex items-center gap-1">
                      {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                      {crumb.to ? (
                        <NavLink
                          to={crumb.to}
                          className="font-medium text-slate-500 hover:text-slate-900"
                        >
                          {crumb.label}
                        </NavLink>
                      ) : (
                        <span className="font-semibold text-slate-900">{crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              ) : (
                <span className="text-lg font-semibold text-slate-900">Overview</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                  aria-label="Open notifications"
                  onClick={() => setNotificationsOpen((c) => !c)}
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 top-11 z-30 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Notifications</p>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-900 disabled:cursor-not-allowed disabled:text-slate-400"
                        onClick={() => markAllReadMutation.mutate()}
                        disabled={markAllReadMutation.isPending || unreadCount === 0}
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        {markAllReadMutation.isPending ? "Marking..." : "Mark all read"}
                      </button>
                    </div>

                    {panelNotificationsQuery.isLoading ? (
                      <p className="py-4 text-center text-sm text-slate-500">Loading...</p>
                    ) : panelNotifications.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-500">No notifications.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {panelNotifications.map((notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => openNotification(notification)}
                            className={cn(
                              "w-full rounded-lg border p-2.5 text-left transition",
                              notification.isRead
                                ? "border-slate-100 bg-white hover:bg-slate-50"
                                : "border-cyan-200 bg-cyan-50/60 hover:border-cyan-300",
                            )}
                          >
                            <p className={cn("text-sm", notification.isRead ? "font-medium text-slate-700" : "font-semibold text-slate-900")}>
                              {notification.title}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{notification.body}</p>
                            <p className="mt-1.5 text-[11px] text-slate-400">{timeAgo(notification.createdAt)}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        setNotificationsOpen(false);
                        navigate("/dashboard/notifications");
                      }}
                    >
                      View all notifications
                    </button>
                  </div>
                )}
              </div>

              <Avatar className="h-9 w-9 border border-slate-200">
                <AvatarFallback className="bg-slate-800 text-sm font-semibold text-white">
                  {initials(user?.name ?? "Syrex")}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <main className="min-w-0 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
