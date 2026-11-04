import { useContext } from "react";
import { AdminContext, type AdminContextValue } from "./context";

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdmin harus digunakan di dalam AdminProvider");
  }
  return ctx;
}
