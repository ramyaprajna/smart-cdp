import { useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { Database, BarChart3, Users, Search, Layers, Upload, Settings, AlertTriangle, History, Archive, FileText, Activity, Megaphone, Star, ShieldCheck, MessageSquare, BookOpen, Radio, Fingerprint } from 'lucide-react';

interface NavigationItem {
  name: string;
  href: string;
  icon: any;
  tooltip: string;
  roles?: string[];
  group?: string;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    name: "Dashboard",
    href: "/",
    icon: BarChart3,
    tooltip: "Overview of customer analytics with key metrics, segment distribution, and platform statistics from your authentic customer database.",
    group: "Analytics",
  },
  {
    name: "Customer Profiles",
    href: "/customers",
    icon: Users,
    tooltip: "Browse and manage individual customer profiles. View demographics, contact information, and customer segments with search and filtering capabilities.",
    group: "Analytics",
  },
  {
    name: "Vector Search",
    href: "/vector-search",
    icon: Search,
    tooltip: "Find similar customers using AI-powered semantic search. Enter natural language queries to discover customers with matching demographics, locations, or characteristics.",
    group: "Analytics",
  },
  {
    name: "Segments",
    href: "/segments",
    icon: Layers,
    tooltip: "Explore customer segments like Students, Professionals, Entrepreneurs, and Regular Listeners. Analyze audience composition and create targeted strategies.",
    group: "Analytics",
  },
  {
    name: "Scoring",
    href: "/scoring",
    icon: Activity,
    tooltip: "View customer engagement scores, score distribution, high-value profiles, and churn risk analysis.",
    roles: ['admin', 'analyst'],
    group: "Analytics",
  },
  {
    name: "Campaigns",
    href: "/campaigns",
    icon: Megaphone,
    tooltip: "Create and manage marketing campaigns across WhatsApp, email, SMS, and push channels with audience targeting and delivery analytics.",
    roles: ['admin', 'marketing'],
    group: "Engagement",
  },
  {
    name: "WABA",
    href: "/waba",
    icon: MessageSquare,
    tooltip: "Manage WhatsApp Business API templates, sync templates from Meta, and send test messages.",
    roles: ['admin', 'marketing'],
    group: "Engagement",
  },
  {
    name: "Loyalty",
    href: "/loyalty",
    icon: Star,
    tooltip: "View customer loyalty point balances, transaction history, and manage earn, burn, and redemption actions.",
    roles: ['admin', 'marketing'],
    group: "Engagement",
  },
  {
    name: "Consent",
    href: "/consent",
    icon: ShieldCheck,
    tooltip: "Manage customer consent preferences per channel and maintain the global suppression list for compliance.",
    roles: ['admin'],
    group: "Compliance",
  },
  {
    name: "Data Streams",
    href: "/streams",
    icon: Radio,
    tooltip: "Manage data streams from any source — upload CSV/Excel, let AI analyze the structure, and activate streams with auto-configured schema.",
    group: "Lite CDP",
  },
  {
    name: "Identity Clusters",
    href: "/clusters",
    icon: Fingerprint,
    tooltip: "View unified identity profiles formed by linking records across multiple data streams through shared identifiers.",
    group: "Lite CDP",
  },
  {
    name: "Data Import",
    href: "/data-import",
    icon: Upload,
    tooltip: "Import new customer data from Excel or CSV files. Supports bulk uploads with automatic data validation and duplicate detection for maintaining data quality.",
    group: "Data",
  },
  {
    name: "Import History",
    href: "/import-history",
    icon: History,
    tooltip: "View complete history of all customer data imports with detailed metadata, status tracking, and searchable filters for comprehensive audit trails.",
    group: "Data",
  },
  {
    name: "Import Errors",
    href: "/import-errors",
    icon: AlertTriangle,
    tooltip: "View detailed error logs and troubleshoot failed import records. Access comprehensive error tracking with row-level details, suggested fixes, and retry options.",
    roles: ['admin', 'analyst'],
    group: "Data",
  },
  {
    name: "User Management",
    href: "/admin/users",
    icon: Settings,
    tooltip: "Manage CDP dashboard users, roles, and access permissions for admin, analyst, and viewer accounts.",
    roles: ['admin'],
    group: "Admin",
  },
  {
    name: "Archive Management",
    href: "/admin/archives",
    icon: Archive,
    tooltip: "Comprehensive data archiving and restoration tools. Create backups, manage archives, and restore application data with secure admin controls.",
    roles: ['admin'],
    group: "Admin",
  },
  {
    name: "Application Logs",
    href: "/admin/logs",
    icon: FileText,
    tooltip: "Monitor system events, track application performance, and review detailed logs for debugging and audit purposes.",
    roles: ['admin'],
    group: "Admin",
  },
  {
    name: "Real-Time Log View",
    href: "/admin/log",
    icon: Activity,
    tooltip: "Live monitoring of embedding system status with real-time log entries and auto-refresh capabilities.",
    roles: ['admin'],
    group: "Admin",
  },
];

const GROUP_ORDER = ["Analytics", "Engagement", "Compliance", "Data", "Admin"];

export function useSidebarNavigation() {
  const [location] = useLocation();
  const { user: currentUser, logout } = useAuth();
  const { resetTour } = useOnboarding();

  const filteredNavItems = useMemo(() => {
    return NAVIGATION_ITEMS.filter(item => {
      if (item.roles && currentUser) {
        return item.roles.includes(currentUser.role);
      }
      return true;
    });
  }, [currentUser]);

  const groupedNavItems = useMemo(() => {
    const groups: { name: string; items: NavigationItem[] }[] = [];
    const grouped = new Map<string, NavigationItem[]>();

    for (const item of filteredNavItems) {
      const group = item.group ?? "Other";
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group)!.push(item);
    }

    for (const groupName of GROUP_ORDER) {
      const items = grouped.get(groupName);
      if (items && items.length > 0) {
        groups.push({ name: groupName, items });
      }
    }

    grouped.forEach((items, name) => {
      if (!GROUP_ORDER.includes(name)) {
        groups.push({ name, items });
      }
    });

    return groups;
  }, [filteredNavItems]);

  const isActiveLink = useCallback((href: string) => {
    return location === href || (href !== "/" && location.startsWith(href));
  }, [location]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout]);

  const startTour = useCallback(() => {
    resetTour();
  }, [resetTour]);

  const getUserInitials = useCallback(() => {
    return currentUser ? currentUser.firstName[0].toUpperCase() : 'A';
  }, [currentUser]);

  const getUserDisplayName = useCallback(() => {
    return currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Loading...';
  }, [currentUser]);

  const getUserRole = useCallback(() => {
    return currentUser
      ? `${currentUser.role.charAt(0).toUpperCase()}${currentUser.role.slice(1)} User`
      : 'Platform User';
  }, [currentUser]);

  const getTourDataAttribute = useCallback((href: string) => {
    if (href === '/') return 'dashboard';
    return href.replace('/', '').replace('-', '-');
  }, []);

  return {
    location,
    currentUser,
    filteredNavItems,
    groupedNavItems,
    isActiveLink,
    getTourDataAttribute,
    getUserInitials,
    getUserDisplayName,
    getUserRole,
    handleLogout,
    startTour,
    brandName: "Smart CDP",
    brandIcon: Database
  };
}
