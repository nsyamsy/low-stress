import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateErrorCode } from "@low-stress/i18n";
import { Button, Chip, Modal } from "@low-stress/ui";
import {
  deleteAdminRiotRoomApi,
  getAdminRiotRoomDetailApi,
  getAdminRiotRoomsApi,
  kickAdminRiotPlayerApi,
  resetAdminRiotRoomApi,
  type AdminRiotRoomDetail,
  type AdminRiotRoomItem,
} from "../../features/admin/api";
import type { ApiError } from "../../lib/apiFetch";

export function AdminRiotPage() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<AdminRiotRoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRiotRoomDetail | null>(null);

  const getErrorText = useCallback(
    (err: unknown): string => {
      const apiError = (err as { apiError?: ApiError })?.apiError;
      if (apiError?.code) {
        return translateErrorCode(apiError.code, apiError.params);
      }
      return t("state.error");
    },
    [t],
  );

  const loadRooms = useCallback(() => {
    setLoading(true);
    setError(null);
    getAdminRiotRoomsApi()
      .then((res) => {
        setRooms(res.items);
      })
      .catch((err: unknown) => {
        setError(getErrorText(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [getErrorText]);

  useEffect(() => {
    let mounted = true;
    getAdminRiotRoomsApi()
      .then((res) => {
        if (mounted) setRooms(res.items);
      })
      .catch((err: unknown) => {
        if (mounted) setError(getErrorText(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [getErrorText]);

  const handleInspect = async (roomId: string) => {
    try {
      const res = await getAdminRiotRoomDetailApi(roomId);
      setDetail(res);
    } catch (err: unknown) {
      setError(getErrorText(err));
    }
  };

  const handleReset = async (roomId: string) => {
    try {
      await resetAdminRiotRoomApi(roomId);
      loadRooms();
      if (detail?.room.id === roomId) {
        const res = await getAdminRiotRoomDetailApi(roomId);
        setDetail(res);
      }
    } catch (err: unknown) {
      setError(getErrorText(err));
    }
  };

  const handleDelete = async (roomId: string) => {
    try {
      await deleteAdminRiotRoomApi(roomId);
      if (detail?.room.id === roomId) {
        setDetail(null);
      }
      loadRooms();
    } catch (err: unknown) {
      setError(getErrorText(err));
    }
  };

  const handleKick = async (roomId: string, userId: string) => {
    try {
      await kickAdminRiotPlayerApi(roomId, userId);
      const res = await getAdminRiotRoomDetailApi(roomId);
      setDetail(res);
      loadRooms();
    } catch (err: unknown) {
      setError(getErrorText(err));
    }
  };

  return (
    <div className="ls-stack" style={{ gap: "var(--space-6)" }}>
      <div className="ls-row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="ls-heading-1">{t("admin.riot.title")}</h1>
          <p className="ls-text-secondary" style={{ fontSize: "var(--font-small)" }}>
            {t("admin.riot.subtitle")}
          </p>
        </div>
        <Button variant="secondary" onClick={loadRooms}>
          {t("action.retry")}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "var(--danger-bg)",
            color: "var(--danger-text)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-control)",
            fontSize: "var(--font-small)",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="ls-text-secondary">{t("state.loading")}</p>
      ) : rooms.length === 0 ? (
        <div className="ls-card" style={{ textAlign: "center", padding: "var(--space-6)" }}>
          <p className="ls-text-secondary">{t("admin.riot.empty")}</p>
        </div>
      ) : (
        <>
          <div className="ls-admin-table-container">
            <table className="ls-admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.riot.roomCode")}</th>
                  <th scope="col">{t("admin.riot.host")}</th>
                  <th scope="col">{t("admin.riot.status")}</th>
                  <th scope="col">{t("admin.riot.players")}</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    {t("admin.users.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td>
                      <strong>{room.name}</strong>
                      <div style={{ fontSize: "var(--font-caption)", color: "var(--text-muted)" }}>
                        {room.id}
                      </div>
                    </td>
                    <td>{room.hostName}</td>
                    <td>
                      <Chip tone="neutral">{room.status}</Chip>
                    </td>
                    <td>{room.playersCount}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="ls-row" style={{ justifyContent: "flex-end", gap: "var(--space-2)" }}>
                        <Button variant="secondary" onClick={() => void handleInspect(room.id)}>
                          {t("admin.riot.inspect")}
                        </Button>
                        <Button variant="secondary" onClick={() => void handleReset(room.id)}>
                          {t("admin.riot.resetRoom")}
                        </Button>
                        <Button variant="danger" onClick={() => void handleDelete(room.id)}>
                          {t("admin.riot.deleteRoom")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ls-admin-card-list">
            {rooms.map((room) => (
              <div key={room.id} className="ls-admin-mobile-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>{room.name}</strong>
                  <Chip tone="neutral">{room.status}</Chip>
                </div>
                <div style={{ fontSize: "var(--font-small)", color: "var(--text-secondary)" }}>
                  {t("admin.riot.host")}: {room.hostName} • {t("admin.riot.players")}: {room.playersCount}
                </div>
                <div className="ls-row" style={{ flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                  <Button variant="secondary" onClick={() => void handleInspect(room.id)}>
                    {t("admin.riot.inspect")}
                  </Button>
                  <Button variant="secondary" onClick={() => void handleReset(room.id)}>
                    {t("admin.riot.resetRoom")}
                  </Button>
                  <Button variant="danger" onClick={() => void handleDelete(room.id)}>
                    {t("admin.riot.deleteRoom")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {detail && (
        <Modal
          open={Boolean(detail)}
          title={`${detail.room.name} (${detail.room.id})`}
          closeLabel={t("action.close")}
          onClose={() => setDetail(null)}
        >
          <div className="ls-stack" style={{ gap: "var(--space-4)" }}>
            <div className="ls-stack" style={{ gap: "var(--space-2)" }}>
              <strong>{t("admin.riot.players")}</strong>
              {detail.players.map((p) => (
                <div
                  key={p.userId}
                  className="ls-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <span>
                    {p.displayName} (@{p.username})
                  </span>
                  <Button
                    variant="danger"
                    onClick={() => void handleKick(detail.room.id, p.userId)}
                  >
                    {t("admin.riot.kickPlayer")}
                  </Button>
                </div>
              ))}
            </div>

            <div className="ls-stack" style={{ gap: "var(--space-2)" }}>
              <strong>{t("admin.riot.matches")}</strong>
              {detail.matches.map((m) => (
                <div key={m.id} style={{ fontSize: "var(--font-small)" }}>
                  {m.id} • {m.winner ?? "—"}
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
