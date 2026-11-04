export interface GameItem {
  id: string;
  title: { id: string; en: string };
  description: { id: string; en: string };
  mode: "solo" | "multiplayer";
  status: "active" | "maintenance";
  open: boolean;
  opensAt: string | null;
  windows: Array<{ start: string; end: string }>;
  days: number[];
  maintenanceMessage: { id: string | null; en: string | null } | null;
  badge: string | null;
  mobile: {
    supported: boolean;
    orientation?: "portrait" | "landscape" | "any";
  };
  mine: { best: number; plays: number } | null;
}

export interface AdminGameItem {
  id: string;
  status: "active" | "maintenance" | "inactive";
  maintenanceMessage: { id: string; en: string } | null;
  schedule: {
    enabled: boolean;
    windows: Array<{ start: string; end: string }>;
    days: number[];
  } | null;
  sortOrder: number;
  badge: string | null;
  updatedAt: string;
  manifest: {
    title: { id: string; en: string };
    description: { id: string; en: string };
    mode: "solo" | "multiplayer";
    mobile: {
      supported: boolean;
      orientation?: "portrait" | "landscape" | "any";
    };
    version: string;
  } | null;
}
