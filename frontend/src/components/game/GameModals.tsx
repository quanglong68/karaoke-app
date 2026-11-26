import type { User } from "../../types/user";
import Modal from "../ui/Modal";
import PixelIcon from "../ui/PixelIcon";

interface GameModalsProps {
    showRename: boolean;
    renameValue: string;
    onRenameValueChange: (value: string) => void;
    onCloseRename: () => void;
    onSaveRename: () => void;
    kickTarget: User | null;
    onCancelKick: () => void;
    onConfirmKick: () => void;
    removalNotice: string | null;
    onReturnHome: () => void;
}

export default function GameModals({
    showRename,
    renameValue,
    onRenameValueChange,
    onCloseRename,
    onSaveRename,
    kickTarget,
    onCancelKick,
    onConfirmKick,
    removalNotice,
    onReturnHome,
}: GameModalsProps) {
    return (
        <>
            {showRename && (
                <Modal
                    title="Đổi tên hiển thị"
                    icon="edit"
                    onClose={onCloseRename}
                    actions={(
                        <>
                            <button type="button" className="pbtn" onClick={onCloseRename}>
                                Hủy
                            </button>
                            <button type="button" className="pbtn pbtn--primary" onClick={onSaveRename}>
                                <PixelIcon name="check" size={16} />
                                Lưu
                            </button>
                        </>
                    )}
                >
                    <div className="p-field">
                        <label className="p-label" htmlFor="game-rename-input">
                            <PixelIcon name="heart" size={15} />
                            Tên hiển thị
                        </label>
                        <input
                            id="game-rename-input"
                            className="p-input"
                            value={renameValue}
                            maxLength={24}
                            onChange={(e) => onRenameValueChange(e.target.value)}
                            placeholder="Nhập tên mới"
                            autoFocus
                        />
                    </div>
                    <p className="p-muted p-tiny">Tên mới sẽ hiện với mọi người trong phòng.</p>
                </Modal>
            )}
            {kickTarget && (
                <Modal
                    title="Mời người chơi rời phòng?"
                    icon="warning"
                    onClose={onCancelKick}
                    actions={(
                        <>
                            <button type="button" className="pbtn" onClick={onCancelKick}>
                                Hủy
                            </button>
                            <button type="button" className="pbtn pbtn--danger" onClick={onConfirmKick}>
                                <PixelIcon name="door" size={16} />
                                Đồng ý
                            </button>
                        </>
                    )}
                >
                    <p className="p-muted">
                        Bạn có chắc chắn muốn mời <strong>{kickTarget.userName}</strong> ra khỏi phòng không?
                    </p>
                </Modal>
            )}
            {removalNotice && (
                <Modal
                    title="Bạn đã rời khỏi phòng"
                    icon="warning"
                    actions={(
                        <button
                            type="button"
                            className="pbtn pbtn--primary"
                            onClick={onReturnHome}
                        >
                            <PixelIcon name="home" size={16} />
                            Về trang chủ
                        </button>
                    )}
                >
                    <p className="p-muted">{removalNotice}</p>
                </Modal>
            )}
        </>
    );
}
