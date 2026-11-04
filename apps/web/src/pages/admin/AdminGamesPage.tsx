import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Input, Modal, SegmentedControl } from "@low-stress/ui";
import { fetchAdminGamesApi, updateAdminGameApi } from "../../features/games/api";
import type { AdminGameItem } from "../../features/games/types";

export function AdminGamesPage() {
  const { t, i18n } = useTranslation();
  const [games, setGames] = useState<AdminGameItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal edit game
  const [editingGame, setEditingGame] = useState<AdminGameItem | null>(null);
  const [editStatus, setEditStatus] = useState<"active" | "maintenance" | "inactive">("active");
  const [editMaintId, setEditMaintId] = useState("");
  const [editMaintEn, setEditMaintEn] = useState("");
  const [editBadge, setEditBadge] = useState("");
  const [editOrder, setEditOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const currentLang = i18n.language.startsWith("en") ? "en" : "id";

  const loadGames = async () => {
    try {
      setLoading(true);
      const res = await fetchAdminGamesApi();
      setGames(res.items);
    } catch {
      // Abaikan
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchAdminGamesApi()
      .then((res) => {
        if (mounted) setGames(res.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const openEditModal = (game: AdminGameItem) => {
    setEditingGame(game);
    setEditStatus(game.status);
    setEditMaintId(game.maintenanceMessage?.id ?? "");
    setEditMaintEn(game.maintenanceMessage?.en ?? "");
    setEditBadge(game.badge ?? "");
    setEditOrder(game.sortOrder);
  };

  const handleSave = async () => {
    if (!editingGame) return;
    setSaving(true);
    try {
      await updateAdminGameApi(editingGame.id, {
        status: editStatus,
        maintenanceMessage: {
          id: editMaintId.trim() || null,
          en: editMaintEn.trim() || null,
        },
        badge: editBadge.trim() || null,
        sortOrder: editOrder,
      });
      setEditingGame(null);
      await loadGames();
    } catch {
      // Abaikan
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ls-stack" style={{ gap: "var(--space-6)" }}>
      <div className="ls-row" style={{ justifyContent: "space-between" }}>
        <h1 className="ls-heading-1">{t("admin.games.title")}</h1>
        <Button variant="secondary" onClick={() => void loadGames()}>
          {t("action.retry")}
        </Button>
      </div>

      {loading ? (
        <p className="ls-text-secondary">{t("state.loading")}</p>
      ) : games.length === 0 ? (
        <div className="ls-card" style={{ textAlign: "center", padding: "var(--space-6)" }}>
          <p className="ls-text-secondary">{t("admin.games.empty")}</p>
        </div>
      ) : (
        <>
          {/* Tampilan Desktop (Tabel) */}
          <div className="ls-admin-table-container">
            <table className="ls-admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.games.colName")}</th>
                  <th scope="col">{t("admin.games.colStatus")}</th>
                  <th scope="col">{t("admin.games.colBadge")}</th>
                  <th scope="col">{t("admin.games.colOrder")}</th>
                  <th scope="col">{t("admin.games.colSchedule")}</th>
                  <th scope="col">{t("admin.games.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const title = game.manifest?.title[currentLang] ?? game.manifest?.title.id ?? game.id;
                  return (
                    <tr key={game.id}>
                      <td>
                        <strong>{title}</strong>
                        <div style={{ fontSize: "var(--font-caption)", opacity: 0.7 }}>
                          id: {game.id}
                        </div>
                      </td>
                      <td>
                        {game.status === "active" && (
                          <Chip tone="success">{t("game.status.active")}</Chip>
                        )}
                        {game.status === "maintenance" && (
                          <Chip tone="warning">{t("game.status.maintenance")}</Chip>
                        )}
                        {game.status === "inactive" && (
                          <Chip tone="neutral">{t("game.status.inactive")}</Chip>
                        )}
                      </td>
                      <td>
                        {game.badge ? (
                          <Chip tone="danger">{game.badge.toUpperCase()}</Chip>
                        ) : (
                          <span className="ls-text-muted">-</span>
                        )}
                      </td>
                      <td>{game.sortOrder}</td>
                      <td>
                        {game.schedule
                          ? `${game.schedule.windows.map((w) => `${w.start}–${w.end}`).join(", ")} WIB`
                          : t("admin.games.scheduleGlobal")}
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => openEditModal(game)}
                        >
                          {t("admin.games.edit")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tampilan Mobile (Kartu) */}
          <div className="ls-admin-cards-container">
            {games.map((game) => {
              const title = game.manifest?.title[currentLang] ?? game.manifest?.title.id ?? game.id;
              return (
                <div key={game.id} className="ls-admin-user-card">
                  <div className="ls-row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <strong>{title}</strong>
                      <div style={{ fontSize: "var(--font-caption)", opacity: 0.7 }}>
                        {game.id}
                      </div>
                    </div>
                    <div>
                      {game.status === "active" && (
                        <Chip tone="success">{t("game.status.active")}</Chip>
                      )}
                      {game.status === "maintenance" && (
                        <Chip tone="warning">{t("game.status.maintenance")}</Chip>
                      )}
                      {game.status === "inactive" && (
                        <Chip tone="neutral">{t("game.status.inactive")}</Chip>
                      )}
                    </div>
                  </div>

                  <div className="ls-row" style={{ fontSize: "var(--font-caption)", gap: "var(--space-2)" }}>
                    <span>{t("admin.games.colOrder")}: {game.sortOrder}</span>
                    {game.badge && <Chip tone="danger">{game.badge}</Chip>}
                  </div>

                  <div style={{ marginTop: "var(--space-2)" }}>
                    <Button
                      variant="secondary"
                      onClick={() => openEditModal(game)}
                    >
                      {t("admin.games.edit")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal Edit Pengaturan Game */}
      {editingGame && (
        <Modal
          open={Boolean(editingGame)}
          title={t("admin.games.modalTitle")}
          closeLabel={t("action.close")}
          onClose={() => setEditingGame(null)}
        >
          <div className="ls-stack" style={{ gap: "var(--space-4)" }}>
            <div className="ls-stack" style={{ gap: "var(--space-2)" }}>
              <label style={{ fontSize: "var(--font-caption)", fontWeight: "var(--weight-bold)" }}>
                {t("admin.games.statusLabel")}
              </label>
              <SegmentedControl
                label={t("admin.games.statusLabel")}
                value={editStatus}
                options={[
                  { value: "active", label: t("game.status.active") },
                  { value: "maintenance", label: t("game.status.maintenance") },
                  { value: "inactive", label: t("game.status.inactive") },
                ]}
                onChange={(val) => setEditStatus(val as "active" | "maintenance" | "inactive")}
              />
            </div>

            <Input
              label={t("admin.games.maintMsgId")}
              value={editMaintId}
              onChange={(e) => setEditMaintId(e.target.value)}
              placeholder="Contoh: Sedang dalam perbaikan rutin."
            />

            <Input
              label={t("admin.games.maintMsgEn")}
              value={editMaintEn}
              onChange={(e) => setEditMaintEn(e.target.value)}
              placeholder="Example: Under scheduled maintenance."
            />

            <Input
              label={t("admin.games.badgeLabel")}
              value={editBadge}
              onChange={(e) => setEditBadge(e.target.value)}
              placeholder="Contoh: new, hot, popular"
            />

            <Input
              label={t("admin.games.orderLabel")}
              type="number"
              value={String(editOrder)}
              onChange={(e) => setEditOrder(Number(e.target.value) || 0)}
            />

            <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
              <Button variant="ghost" onClick={() => setEditingGame(null)}>
                {t("action.cancel")}
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
                {t("admin.games.save")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
