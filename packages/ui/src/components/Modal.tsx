import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";

export interface ModalProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  /** Label aksesibel untuk tombol tutup. */
  closeLabel: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal Design_System §7.6: fokus dikurung, Esc menutup, aksi destruktif
 * tetap memerlukan konfirmasi dari pemanggil.
 */
export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  closeLabel,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const panel = panelRef.current;
    const items = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    items()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = items();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel?.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="ls-modal-backdrop" onMouseDown={onBackdropClick}>
      <div
        ref={panelRef}
        className="ls-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ls-modal-title"
      >
        <div className="ls-modal__header">
          <h2 className="ls-modal__title" id="ls-modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="ls-modal__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children ? <div className="ls-modal__body">{children}</div> : null}
        {footer ? <div className="ls-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
