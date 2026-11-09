import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import PixelIcon from "./PixelIcon";
import type { PixelIconName } from "./PixelIcon";

interface ModalProps {
    title: ReactNode;
    icon?: PixelIconName;
    onClose?: () => void;
    children: ReactNode;
    actions?: ReactNode;
}

export default function Modal({ title, icon, onClose, children, actions }: ModalProps) {
    const titleId = useId();

    useEffect(() => {
        if (!onClose) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="p-modal-scrim"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose?.();
            }}
        >
            <div className="p-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <div className="p-modal-head">
                    <span className="p-modal-title" id={titleId} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {icon && <PixelIcon name={icon} size={18} />}
                        {title}
                    </span>
                    {onClose && (
                        <button
                            type="button"
                            className="pbtn pbtn--sm pbtn--icon"
                            onClick={onClose}
                            aria-label="Đóng hộp thoại"
                        >
                            <PixelIcon name="close" size={16} />
                        </button>
                    )}
                </div>
                <div className="p-modal-body">{children}</div>
                {actions && <div className="p-modal-actions">{actions}</div>}
            </div>
        </div>
    );
}
