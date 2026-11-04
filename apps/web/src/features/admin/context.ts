import { createContext } from "react";
import type { AdminMe } from "./types";

export interface AdminContextValue {
  admin: AdminMe | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAdmin: () => Promise<void>;
}

export const AdminContext = createContext<AdminContextValue | null>(null);
