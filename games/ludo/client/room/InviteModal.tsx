import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

export function InviteModal({
  open,
  searchQuery,
  searchResults,
  onClose,
  onSearchChange,
  onInviteUser,
}: {
  open: boolean;
  searchQuery: string;
  searchResults: Array<{ id: string; username: string; displayName: string }>;
  onClose: () => void;
  onSearchChange: (q: string) => void;
  onInviteUser: (userId: string) => void;
}) {
  const { t } = useTranslation("game.ludo");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-scrim)] p-4">
      <div className="w-full max-w-sm rounded-xl bg-[var(--bg-surface-raised)] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            {t("invitePick")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("searchUsersPh")}
          className="mb-3 h-8 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-raised)] px-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
        />

        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {searchResults.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">
              {t("noInvitable")}
            </p>
          ) : (
            searchResults.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-inset)] p-2 text-xs"
              >
                <div>
                  <span className="block font-bold text-[var(--text-primary)]">
                    {u.displayName}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    @{u.username}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onInviteUser(u.id)}
                  className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-[var(--text-on-primary)] hover:bg-[var(--primary-hover)]"
                >
                  {t("invite")}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
