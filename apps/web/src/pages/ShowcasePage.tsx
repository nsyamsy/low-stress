import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Chip,
  Input,
  Modal,
  SegmentedControl,
  Toast,
} from "@low-stress/ui";
import { registeredGames } from "../games/registry";

type PreviewTheme = "light" | "dark";
type Period = "weekly" | "monthly" | "all";
type Overlay = PreviewTheme | null;

export function ShowcasePage() {
  const { t, i18n } = useTranslation();
  const [modalIn, setModalIn] = useState<Overlay>(null);
  const [toastIn, setToastIn] = useState<Overlay>(null);
  const locale = i18n.resolvedLanguage === "en" ? "en" : "id";

  return (
    <div className="ls-stack">
      <div className="ls-stack">
        <h1 className="ls-display">{t("design.title")}</h1>
        <p className="ls-text-secondary">{t("design.subtitle")}</p>
      </div>

      <section className="ls-card ls-stack">
        <h2 className="ls-heading-2">{t("design.registryTitle")}</h2>
        <p className="ls-text-secondary">{t("design.registryDescription")}</p>
        {registeredGames.length === 0 ? (
          <p className="ls-text-muted">{t("design.registryEmpty")}</p>
        ) : (
          <ul className="ls-stack">
            {registeredGames.map((game) => (
              <li key={game.id} className="ls-row">
                <span>{game.title[locale]}</span>
                <Chip tone="neutral">
                  {game.mode === "multiplayer"
                    ? t("design.registryMultiplayer")
                    : t("design.registrySolo")}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="ls-grid ls-grid--2">
        <PreviewPanel
          theme="light"
          modalOpen={modalIn === "light"}
          toastOpen={toastIn === "light"}
          onOpenModal={() => setModalIn("light")}
          onCloseModal={() => setModalIn(null)}
          onOpenToast={() => setToastIn("light")}
          onCloseToast={() => setToastIn(null)}
        />
        <PreviewPanel
          theme="dark"
          modalOpen={modalIn === "dark"}
          toastOpen={toastIn === "dark"}
          onOpenModal={() => setModalIn("dark")}
          onCloseModal={() => setModalIn(null)}
          onOpenToast={() => setToastIn("dark")}
          onCloseToast={() => setToastIn(null)}
        />
      </div>
    </div>
  );
}

interface PreviewPanelProps {
  theme: PreviewTheme;
  modalOpen: boolean;
  toastOpen: boolean;
  onOpenModal: () => void;
  onCloseModal: () => void;
  onOpenToast: () => void;
  onCloseToast: () => void;
}

function PreviewPanel({
  theme,
  modalOpen,
  toastOpen,
  onOpenModal,
  onCloseModal,
  onOpenToast,
  onCloseToast,
}: PreviewPanelProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("weekly");

  return (
    <section className="ls-preview" data-theme={theme}>
      <h2 className="ls-preview__label">
        {theme === "light" ? t("theme.light") : t("theme.dark")}
      </h2>

      <div className="ls-stack">
        <div className="ls-section">
          <h3 className="ls-heading-2">{t("design.button")}</h3>
          <div className="ls-row">
            <Button>{t("design.primary")}</Button>
            <Button variant="secondary">{t("design.secondary")}</Button>
            <Button variant="ghost">{t("design.ghost")}</Button>
            <Button variant="danger">{t("design.danger")}</Button>
            <Button loading loadingLabel={t("state.loading")}>
              {t("action.save")}
            </Button>
            <Button variant="secondary" disabled>
              {t("action.cancel")}
            </Button>
          </div>
        </div>

        <hr className="ls-divider" />

        <div className="ls-section">
          <h3 className="ls-heading-2">{t("design.input")}</h3>
          <Input
            label={t("design.inputLabel")}
            placeholder={t("design.inputPlaceholder")}
            helpText={t("design.inputHelp")}
          />
          <Input
            label={t("design.inputLabel")}
            placeholder={t("design.inputPlaceholder")}
            defaultValue="A"
            error={t("design.inputError")}
          />
        </div>

        <hr className="ls-divider" />

        <div className="ls-section">
          <h3 className="ls-heading-2">{t("design.chip")}</h3>
          <div className="ls-row">
            <Chip tone="success">{t("design.chipActive")}</Chip>
            <Chip tone="warning">{t("design.chipMaintenance")}</Chip>
            <Chip tone="danger">{t("design.chipDanger")}</Chip>
            <Chip tone="neutral">{t("design.chipNeutral")}</Chip>
          </div>
        </div>

        <hr className="ls-divider" />

        <div className="ls-section">
          <h3 className="ls-heading-2">{t("design.segmented")}</h3>
          <SegmentedControl
            label={t("design.period")}
            value={period}
            onChange={setPeriod}
            options={[
              { value: "weekly", label: t("design.weekly") },
              { value: "monthly", label: t("design.monthly") },
              { value: "all", label: t("design.allTime") },
            ]}
          />
        </div>

        <hr className="ls-divider" />

        <div className="ls-section">
          <h3 className="ls-heading-2">{t("design.modal")}</h3>
          <div className="ls-row">
            <Button variant="secondary" onClick={onOpenModal}>
              {t("design.openModal")}
            </Button>
            <Button variant="secondary" onClick={onOpenToast}>
              {t("design.showToast")}
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={t("design.modalTitle")}
        onClose={onCloseModal}
        closeLabel={t("action.close")}
        footer={
          <>
            <Button variant="secondary" onClick={onCloseModal}>
              {t("action.cancel")}
            </Button>
            <Button variant="danger" onClick={onCloseModal}>
              {t("design.danger")}
            </Button>
          </>
        }
      >
        <p>{t("design.modalBody")}</p>
      </Modal>

      <Toast
        open={toastOpen}
        message={t("design.toastSaved")}
        tone="success"
        onDismiss={onCloseToast}
        closeLabel={t("action.close")}
      />
    </section>
  );
}
