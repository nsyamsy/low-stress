export interface AdminMe {
  id: string;
  username: string;
}

export interface AdminDashboardData {
  activeToday: number;
  pending: number;
  newRegistrations7d: number;
  runsToday: number;
  runsByGame: Record<string, number>;
  topGame: string | null;
  pendingQueue: Array<{
    id: string;
    username: string;
    displayName: string;
    email: string;
    createdAt: string;
  }>;
}

export interface AdminUserItem {
  id: string;
  username: string;
  displayName: string;
  email: string;
  status: "pending" | "active" | "rejected" | "suspended" | "banned";
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminSettings {
  registration: "approval" | "open" | "closed";
  defaultLocale: "auto" | "id" | "en";
  globalSchedule: {
    enabled: boolean;
    windows: Array<{ start: string; end: string }>;
    days: number[];
  };
  chatEnabled: boolean;
  ludoMaxPlayers: number;
  smtp: {
    configured: boolean;
    enabled: boolean;
  };
}

export interface AuditLogItem {
  id: string;
  adminId: string | null;
  adminUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  createdAt: string;
}
