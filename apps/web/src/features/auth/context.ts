import { createContext } from "react";
import type { Me, PublicConfig } from "./types";

export interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  publicConfig: PublicConfig | null;
  refreshUser: () => Promise<void>;
  login: (credentials: { username: string; password: string }) => Promise<Me>;
  logout: () => Promise<void>;
  setUser: (user: Me | null) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
