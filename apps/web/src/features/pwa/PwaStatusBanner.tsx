import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@low-stress/ui";
import {
  applySwUpdate,
  dismissSwUpdate,
  getSwState,
  subscribeSwState,
} from "./swState";

export function PwaStatusBanner({
  initialOffline,
  initialNeedRefresh,
}: {
  initialOffline?: boolean;
  initialNeedRefresh?: boolean;
} = {}) {
  const { t } = useTranslation();

  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (initialOffline !== undefined) return initialOffline;
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return !navigator.onLine;
    }
    return false;
  });

  const [needRefresh, setNeedRefresh] = useState<boolean>(() => {
    if (initialNeedRefresh !== undefined) return initialNeedRefresh;
    return getSwState().needRefresh;
  });

  useEffect(() => {
    const unsub = subscribeSwState((next) => {
      setNeedRefresh(next.needRefresh);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      return undefined;
    }
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline && !needRefresh) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="ls-container"
      style={{ paddingTop: "var(--space-2)" }}
    >
      {isOffline && (
        <div
          className="ls-row"
          style={{
            justifyContent: "space-between",
            background: "var(--warning-bg)",
            color: "var(--warning-text)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-control)",
            fontSize: "var(--font-small)",
            marginBottom: needRefresh ? "var(--space-2)" : 0,
          }}
        >
          <span>{t("state.offline")}</span>
        </div>
      )}

      {needRefresh && (
        <div
          className="ls-row border border-[var(--border-strong)]"
          style={{
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            background: "var(--bg-surface-raised)",
            color: "var(--text-primary)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-control)",
            fontSize: "var(--font-small)",
          }}
        >
          <span>{t("state.updateAvailable")}</span>
          <div className="ls-row" style={{ gap: "var(--space-2)" }}>
            <Button variant="primary" onClick={() => void applySwUpdate()}>
              {t("state.updateAction")}
            </Button>
            <Button variant="ghost" onClick={dismissSwUpdate}>
              {t("action.close")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
