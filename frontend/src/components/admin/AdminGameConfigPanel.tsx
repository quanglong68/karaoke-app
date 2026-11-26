import React, { useEffect, useMemo, useState } from "react";
import PixelIcon from "../ui/PixelIcon";
import {
    adminService,
    getAdminErrorMessage,
    isUnauthorized,
    type AdminGameConfig,
} from "../../services/adminService";
import {
    formValuesToSettings,
    GAME_CONFIG_FIELD_GROUPS,
    GAME_CONFIG_FIELD_KEYS,
    settingsToFormValues,
    validateGameConfigValues,
    type GameConfigFieldKey,
} from "./gameConfigSchema";

interface AdminGameConfigPanelProps {
    onUnauthorized: () => void;
}

const AdminGameConfigPanel: React.FC<AdminGameConfigPanelProps> = ({ onUnauthorized }) => {
    const [config, setConfig] = useState<AdminGameConfig | null>(null);
    const [values, setValues] = useState<Record<GameConfigFieldKey, string> | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [confirmReset, setConfirmReset] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        adminService.getGameConfig()
            .then(result => {
                if (cancelled) return;
                setConfig(result);
                setValues(settingsToFormValues(result.settings));
            })
            .catch(loadError => {
                if (cancelled) return;
                if (isUnauthorized(loadError)) {
                    onUnauthorized();
                    return;
                }
                setError(getAdminErrorMessage(loadError, "Không tải được cấu hình game."));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [reloadKey, onUnauthorized]);

    const fieldErrors = useMemo(
        () => (config && values ? validateGameConfigValues(values, config.limits) : {}),
        [config, values],
    );
    const hasErrors = Object.keys(fieldErrors).length > 0;
    const changed = useMemo(() => {
        if (!config || !values) return false;
        return GAME_CONFIG_FIELD_KEYS.some(key => Number(values[key]) !== config.settings[key]);
    }, [config, values]);

    const handleChange = (key: GameConfigFieldKey, value: string) => {
        setValues(prev => (prev ? { ...prev, [key]: value } : prev));
        setNotice("");
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!values || hasErrors || saving || resetting) return;
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const saved = await adminService.updateGameConfig(formValuesToSettings(values));
            setConfig(prev => (prev ? { ...prev, settings: saved } : prev));
            setValues(settingsToFormValues(saved));
            setNotice("Đã lưu cấu hình. Phòng mới sẽ áp dụng ngay từ lượt tạo kế tiếp.");
        } catch (saveError) {
            if (isUnauthorized(saveError)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(saveError, "Không lưu được cấu hình game."));
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (saving || resetting) return;
        setResetting(true);
        setError("");
        setNotice("");
        try {
            const saved = await adminService.resetGameConfig();
            setConfig(prev => (prev ? { ...prev, settings: saved } : prev));
            setValues(settingsToFormValues(saved));
            setConfirmReset(false);
            setNotice("Đã khôi phục cấu hình mặc định.");
        } catch (resetError) {
            if (isUnauthorized(resetError)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(resetError, "Không khôi phục được cấu hình."));
        } finally {
            setResetting(false);
        }
    };

    return (
        <>
            <p className="p-muted p-tiny">
                Cấu hình áp dụng cho <strong>phòng tạo mới</strong>. Phòng đang chơi giữ nguyên thiết lập lúc mở phòng.
                Thời lượng phát nhạc được đặt riêng cho từng bài và không chỉnh ở đây.
            </p>

            {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
            {error && !config && !loading && (
                <button
                    type="button"
                    className="pbtn pbtn--sm admin-config-retry"
                    onClick={() => setReloadKey(key => key + 1)}
                >
                    <PixelIcon name="refresh" size={14} />
                    Thử lại
                </button>
            )}
            {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}

            {loading || !config || !values ? (
                <div className="admin-note">
                    <PixelIcon name="clock" size={14} />
                    Đang tải cấu hình game...
                </div>
            ) : (
                <form className="admin-form" onSubmit={handleSave}>
                    {GAME_CONFIG_FIELD_GROUPS.map(group => (
                        <section key={group.title} className="admin-section">
                            <h2 className="admin-config-group-title">
                                <PixelIcon name={group.icon} size={16} />
                                {group.title}
                            </h2>
                            <div className="admin-config-grid">
                                {group.fields.map(field => {
                                    const limit = config.limits[field.key];
                                    const fieldError = fieldErrors[field.key];
                                    const hintId = `cfg-hint-${field.key}`;
                                    const errorId = `cfg-error-${field.key}`;
                                    return (
                                        <div className="p-field admin-config-field" key={field.key}>
                                            <label className="p-label" htmlFor={`cfg-${field.key}`}>
                                                {field.label}
                                            </label>
                                            <div className="admin-config-input">
                                                <input
                                                    id={`cfg-${field.key}`}
                                                    className={`p-input${fieldError ? " admin-config-input--invalid" : ""}`}
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={limit?.min}
                                                    max={limit?.max}
                                                    step={limit?.step ?? 1}
                                                    value={values[field.key]}
                                                    onChange={e => handleChange(field.key, e.target.value)}
                                                    aria-invalid={fieldError ? true : undefined}
                                                    aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
                                                />
                                                {field.unit && <span className="admin-config-unit">{field.unit}</span>}
                                            </div>
                                            <span id={hintId} className="admin-config-hint">
                                                {limit
                                                    ? `Giới hạn ${limit.min}–${limit.max}${field.unit ? ` ${field.unit}` : ""}. `
                                                    : ""}
                                                {field.hint}
                                            </span>
                                            {fieldError && (
                                                <span id={errorId} className="admin-config-error" role="alert">
                                                    {fieldError}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}

                    <div className="admin-config-actions">
                        {confirmReset ? (
                            <>
                                <span className="admin-confirm-label admin-config-confirm-label">
                                    Khôi phục toàn bộ về mặc định?
                                </span>
                                <button
                                    type="button"
                                    className="pbtn pbtn--danger pbtn--sm"
                                    onClick={handleReset}
                                    disabled={resetting || saving}
                                >
                                    <PixelIcon name={resetting ? "clock" : "refresh"} size={14} />
                                    {resetting ? "Đang khôi phục..." : "Khôi phục"}
                                </button>
                                <button
                                    type="button"
                                    className="pbtn pbtn--sm"
                                    onClick={() => setConfirmReset(false)}
                                    disabled={resetting || saving}
                                >
                                    Huỷ
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="pbtn pbtn--sm"
                                    onClick={() => setConfirmReset(true)}
                                    disabled={loading || saving || resetting}
                                >
                                    <PixelIcon name="refresh" size={14} />
                                    Khôi phục mặc định
                                </button>
                                <button
                                    type="submit"
                                    className="pbtn pbtn--primary pbtn--sm"
                                    disabled={!changed || hasErrors || saving || resetting}
                                >
                                    <PixelIcon name={saving ? "clock" : "check"} size={14} />
                                    {saving ? "Đang lưu..." : "Lưu cấu hình"}
                                </button>
                            </>
                        )}
                    </div>
                    {!changed && !hasErrors && (
                        <p className="p-muted p-tiny admin-config-idle">
                            Chưa có thay đổi nào cần lưu.
                        </p>
                    )}
                </form>
            )}
        </>
    );
};

export default AdminGameConfigPanel;
