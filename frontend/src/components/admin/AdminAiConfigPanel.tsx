import React, { useCallback, useEffect, useState } from "react";
import Modal from "../ui/Modal";
import PixelIcon from "../ui/PixelIcon";
import {
    adminService,
    getAdminErrorMessage,
    isUnauthorized,
    type AiKeyItem,
    type AiModelItem,
    type AiRuntimeStatus,
    type AiTestResult,
} from "../../services/adminService";
import {
    SUGGESTED_GEMINI_MODELS,
    buildPriorityMove,
    formatAiTestTime,
    validateApiKeyInput,
    validateModelNameInput,
    validatePriorityInput,
} from "./adminAiUtils";

interface AdminAiConfigPanelProps {
    onUnauthorized: () => void;
}

const AdminAiConfigPanel: React.FC<AdminAiConfigPanelProps> = ({ onUnauthorized }) => {
    const [runtime, setRuntime] = useState<AiRuntimeStatus | null>(null);
    const [keys, setKeys] = useState<AiKeyItem[]>([]);
    const [models, setModels] = useState<AiModelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [reloadSeq, setReloadSeq] = useState(0);

    const [mutatingId, setMutatingId] = useState<string | null>(null);
    const [testingKeyIds, setTestingKeyIds] = useState<number[]>([]);
    const [testingModelIds, setTestingModelIds] = useState<number[]>([]);
    const [batchTesting, setBatchTesting] = useState(false);

    const [confirmDelete, setConfirmDelete] = useState<{ kind: "key" | "model"; id: number } | null>(null);

    // Key Modal state
    const [keyModalMode, setKeyModalMode] = useState<"create" | "edit" | null>(null);
    const [editingKey, setEditingKey] = useState<AiKeyItem | null>(null);
    const [keyLabel, setKeyLabel] = useState("");
    const [keyRaw, setKeyRaw] = useState("");
    const [showKeyRaw, setShowKeyRaw] = useState(false);
    const [keyPriority, setKeyPriority] = useState("100");
    const [keyActive, setKeyActive] = useState(true);
    const [keyFormError, setKeyFormError] = useState("");
    const [keyDraftResult, setKeyDraftResult] = useState<AiTestResult | null>(null);
    const [keySaving, setKeySaving] = useState(false);
    const [keyTestingDraft, setKeyTestingDraft] = useState(false);

    // Model Modal state
    const [modelModalMode, setModelModalMode] = useState<"create" | "edit" | null>(null);
    const [editingModel, setEditingModel] = useState<AiModelItem | null>(null);
    const [modelName, setModelName] = useState("");
    const [modelDisplayName, setModelDisplayName] = useState("");
    const [modelPriority, setModelPriority] = useState("100");
    const [modelActive, setModelActive] = useState(true);
    const [modelFormError, setModelFormError] = useState("");
    const [modelDraftResult, setModelDraftResult] = useState<AiTestResult | null>(null);
    const [modelSaving, setModelSaving] = useState(false);
    const [modelTestingDraft, setModelTestingDraft] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [rt, keyList, modelList] = await Promise.all([
                adminService.getAiRuntime(),
                adminService.listAiKeys(),
                adminService.listAiModels(),
            ]);
            setRuntime(rt);
            setKeys(keyList);
            setModels(modelList);
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không tải được cấu hình AI."));
        } finally {
            setLoading(false);
        }
    }, [onUnauthorized]);

    useEffect(() => {
        void loadAll();
    }, [loadAll, reloadSeq]);

    const openCreateKey = () => {
        setKeyModalMode("create");
        setEditingKey(null);
        setKeyLabel("");
        setKeyRaw("");
        setShowKeyRaw(false);
        setKeyPriority("100");
        setKeyActive(true);
        setKeyFormError("");
        setKeyDraftResult(null);
    };

    const openEditKey = (item: AiKeyItem) => {
        setKeyModalMode("edit");
        setEditingKey(item);
        setKeyLabel(item.label ?? "");
        setKeyRaw("");
        setShowKeyRaw(false);
        setKeyPriority(String(item.priority));
        setKeyActive(item.active);
        setKeyFormError("");
        setKeyDraftResult(null);
    };

    const closeKeyModal = () => {
        if (keySaving || keyTestingDraft) return;
        setKeyModalMode(null);
        setEditingKey(null);
        setKeyRaw("");
        setKeyFormError("");
        setKeyDraftResult(null);
    };

    const handleTestDraftKey = async () => {
        const keyErr = validateApiKeyInput(keyRaw);
        if (keyErr) {
            setKeyFormError(keyErr);
            return;
        }
        setKeyFormError("");
        setKeyTestingDraft(true);
        try {
            const res = await adminService.testDraftAiKey({ apiKey: keyRaw.trim() });
            setKeyDraftResult(res);
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setKeyFormError(getAdminErrorMessage(err, "Không thể test thử API key."));
        } finally {
            setKeyTestingDraft(false);
        }
    };

    const handleSaveKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (keySaving || keyTestingDraft) return;
        const prio = validatePriorityInput(keyPriority);
        if (prio.error) {
            setKeyFormError(prio.error);
            return;
        }
        if (keyModalMode === "create") {
            const keyErr = validateApiKeyInput(keyRaw);
            if (keyErr) {
                setKeyFormError(keyErr);
                return;
            }
        }
        setKeyFormError("");
        setKeySaving(true);
        try {
            if (keyModalMode === "create") {
                await adminService.createAiKey({
                    label: keyLabel.trim() || undefined,
                    apiKey: keyRaw.trim(),
                    priority: prio.value,
                    active: keyActive,
                });
                setNotice("Đã thêm API key mới.");
            } else if (editingKey) {
                await adminService.updateAiKey(editingKey.id, {
                    label: keyLabel.trim(),
                    priority: prio.value,
                    active: keyActive,
                });
                setNotice("Đã cập nhật API key.");
            }
            setKeyModalMode(null);
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setKeyFormError(getAdminErrorMessage(err, "Không lưu được API key."));
        } finally {
            setKeySaving(false);
        }
    };

    const openCreateModel = () => {
        setModelModalMode("create");
        setEditingModel(null);
        setModelName("");
        setModelDisplayName("");
        setModelPriority("100");
        setModelActive(true);
        setModelFormError("");
        setModelDraftResult(null);
    };

    const openEditModel = (item: AiModelItem) => {
        setModelModalMode("edit");
        setEditingModel(item);
        setModelName(item.modelName);
        setModelDisplayName(item.displayName ?? "");
        setModelPriority(String(item.priority));
        setModelActive(item.active);
        setModelFormError("");
        setModelDraftResult(null);
    };

    const closeModelModal = () => {
        if (modelSaving || modelTestingDraft) return;
        setModelModalMode(null);
        setEditingModel(null);
        setModelFormError("");
        setModelDraftResult(null);
    };

    const handleTestDraftModel = async () => {
        const errText = validateModelNameInput(modelName);
        if (errText) {
            setModelFormError(errText);
            return;
        }
        setModelFormError("");
        setModelTestingDraft(true);
        try {
            const res = await adminService.testDraftAiModel({ modelName: modelName.trim() });
            setModelDraftResult(res);
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setModelFormError(getAdminErrorMessage(err, "Không thể test thử model."));
        } finally {
            setModelTestingDraft(false);
        }
    };

    const handleSaveModel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (modelSaving || modelTestingDraft) return;
        const prio = validatePriorityInput(modelPriority);
        if (prio.error) {
            setModelFormError(prio.error);
            return;
        }
        if (modelModalMode === "create") {
            const modelErr = validateModelNameInput(modelName);
            if (modelErr) {
                setModelFormError(modelErr);
                return;
            }
        }
        setModelFormError("");
        setModelSaving(true);
        try {
            if (modelModalMode === "create") {
                await adminService.createAiModel({
                    modelName: modelName.trim(),
                    displayName: modelDisplayName.trim() || undefined,
                    priority: prio.value,
                    active: modelActive,
                });
                setNotice(`Đã thêm model "${modelName.trim()}".`);
            } else if (editingModel) {
                await adminService.updateAiModel(editingModel.id, {
                    displayName: modelDisplayName.trim(),
                    priority: prio.value,
                    active: modelActive,
                });
                setNotice(`Đã cập nhật model "${editingModel.modelName}".`);
            }
            setModelModalMode(null);
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setModelFormError(getAdminErrorMessage(err, "Không lưu được model."));
        } finally {
            setModelSaving(false);
        }
    };

    const handleToggleKeyActive = async (item: AiKeyItem) => {
        setMutatingId(`key-${item.id}`);
        setError("");
        try {
            await adminService.updateAiKey(item.id, { active: !item.active });
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không đổi được trạng thái key."));
        } finally {
            setMutatingId(null);
        }
    };

    const handleMoveKey = async (index: number, direction: "up" | "down") => {
        const updates = buildPriorityMove(keys, index, direction);
        if (updates.length === 0) return;
        setMutatingId(`key-${keys[index].id}`);
        setError("");
        try {
            for (const u of updates) {
                await adminService.updateAiKey(u.id, { priority: u.priority });
            }
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không đổi được thứ tự ưu tiên."));
        } finally {
            setMutatingId(null);
        }
    };

    const handleToggleModelActive = async (item: AiModelItem) => {
        setMutatingId(`model-${item.id}`);
        setError("");
        try {
            await adminService.updateAiModel(item.id, { active: !item.active });
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không đổi được trạng thái model."));
        } finally {
            setMutatingId(null);
        }
    };

    const handleMoveModel = async (index: number, direction: "up" | "down") => {
        const updates = buildPriorityMove(models, index, direction);
        if (updates.length === 0) return;
        setMutatingId(`model-${models[index].id}`);
        setError("");
        try {
            for (const u of updates) {
                await adminService.updateAiModel(u.id, { priority: u.priority });
            }
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không đổi được thứ tự ưu tiên."));
        } finally {
            setMutatingId(null);
        }
    };

    const handleTestSavedKey = async (item: AiKeyItem) => {
        setTestingKeyIds(prev => (prev.includes(item.id) ? prev : [...prev, item.id]));
        setError("");
        try {
            const res = await adminService.testSavedAiKey(item.id);
            setNotice(
                res.ok
                    ? `${item.keyMasked}: OK (${res.latencyMs}ms · ${res.modelUsed})`
                    : `${item.keyMasked}: ${res.message}`,
            );
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không test được API key."));
        } finally {
            setTestingKeyIds(prev => prev.filter(id => id !== item.id));
        }
    };

    const handleTestSavedModel = async (item: AiModelItem) => {
        setTestingModelIds(prev => (prev.includes(item.id) ? prev : [...prev, item.id]));
        setError("");
        try {
            const res = await adminService.testSavedAiModel(item.id);
            setNotice(
                res.ok
                    ? `${item.modelName}: OK (${res.latencyMs}ms)`
                    : `${item.modelName}: ${res.message}`,
            );
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không test được model."));
        } finally {
            setTestingModelIds(prev => prev.filter(id => id !== item.id));
        }
    };

    const handleBatchTestModels = async () => {
        if (batchTesting) return;
        setBatchTesting(true);
        setError("");
        setNotice("");
        try {
            const activeIds = models.filter(m => m.active).map(m => m.id);
            const res = await adminService.testAiModelsBatch({
                modelIds: activeIds.length > 0 ? activeIds : undefined,
            });
            setNotice(`Test model: ${res.passed}/${res.total} hoạt động.`);
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không test loạt được danh sách model."));
        } finally {
            setBatchTesting(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!confirmDelete) return;
        const target = confirmDelete;
        setMutatingId(`${target.kind}-${target.id}`);
        setError("");
        try {
            if (target.kind === "key") {
                await adminService.deleteAiKey(target.id);
                setNotice("Đã xóa API key.");
            } else {
                await adminService.deleteAiModel(target.id);
                setNotice("Đã xóa model.");
            }
            setConfirmDelete(null);
            await loadAll();
        } catch (err) {
            if (isUnauthorized(err)) {
                onUnauthorized();
                return;
            }
            setError(getAdminErrorMessage(err, "Không thể xóa mục đã chọn."));
        } finally {
            setMutatingId(null);
        }
    };

    if (loading && !runtime) {
        return (
            <div className="admin-note" role="status">
                <PixelIcon name="clock" size={14} />
                Đang tải cấu hình Gemini...
            </div>
        );
    }

    if (error && !runtime) {
        return (
            <div className="admin-form">
                <div className="admin-alert admin-alert--error" role="alert">{error}</div>
                <button
                    type="button"
                    className="pbtn pbtn--sm admin-config-retry"
                    onClick={() => setReloadSeq(s => s + 1)}
                >
                    <PixelIcon name="refresh" size={14} />
                    Thử lại
                </button>
            </div>
        );
    }

    return (
        <>
            {runtime && !runtime.cryptoConfigured && (
                <div className="admin-alert admin-alert--error" role="alert">
                    Chưa cấu hình biến môi trường <code>AI_CRYPTO_KEY</code> nên chưa thể mã hóa lưu API key mới.
                </div>
            )}

            {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
            {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}

            {/* --- COMPACT TOOLBAR --- */}
            <div className="ai-top-bar">
                <div className="ai-top-chips">
                    {runtime && (
                        <>
                            <span className={`p-chip p-tiny ${runtime.activeDbKeys > 0 || runtime.envFallbackKeyMasked ? "p-chip--sage" : "p-chip--rose"}`}>
                                <PixelIcon name="key" size={12} />
                                Key bật: {runtime.activeDbKeys}
                                {runtime.envFallbackKeyMasked ? ` (+ .env ${runtime.envFallbackKeyMasked})` : ""}
                            </span>
                            <span className="p-chip p-tiny">
                                <PixelIcon name="cpu" size={12} />
                                Model bật: {runtime.activeDbModels}
                            </span>
                        </>
                    )}
                </div>

                <div className="ai-top-actions">
                    <button
                        type="button"
                        className="pbtn pbtn--primary pbtn--sm"
                        onClick={openCreateKey}
                        disabled={!runtime?.cryptoConfigured}
                    >
                        <PixelIcon name="key" size={13} />
                        Thêm API Key
                    </button>
                    <button
                        type="button"
                        className="pbtn pbtn--accent pbtn--sm"
                        onClick={openCreateModel}
                    >
                        <PixelIcon name="cpu" size={13} />
                        Thêm Model
                    </button>
                    <button
                        type="button"
                        className="pbtn pbtn--secondary pbtn--sm"
                        onClick={handleBatchTestModels}
                        disabled={batchTesting || models.length === 0}
                    >
                        <PixelIcon name={batchTesting ? "clock" : "play"} size={13} />
                        {batchTesting ? "Đang test..." : "Test tất cả model"}
                    </button>
                    <button
                        type="button"
                        className="pbtn pbtn--sm"
                        onClick={() => setReloadSeq(s => s + 1)}
                        disabled={loading}
                    >
                        <PixelIcon name="refresh" size={13} />
                        Làm mới
                    </button>
                </div>
            </div>

            {/* --- TABLE 1: API KEYS --- */}
            <div className="ai-block">
                <div className="ai-block-head">
                    <span className="pixel-label p-tiny">Gemini API Keys (số ưu tiên nhỏ chạy trước · bằng số tự xoay vòng)</span>
                </div>
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Thứ tự</th>
                                <th scope="col">Nhãn</th>
                                <th scope="col">Key</th>
                                <th scope="col">Trạng thái</th>
                                <th scope="col">Kiểm tra gần nhất</th>
                                <th scope="col">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="admin-table-empty">
                                        <PixelIcon name="key" size={15} />
                                        Chưa có API key nào. Bấm &ldquo;Thêm API Key&rdquo; ở góc trên để bật tự động chép lời.
                                    </td>
                                </tr>
                            )}
                            {keys.map((item, idx) => {
                                const isBusy = mutatingId === `key-${item.id}`;
                                const isTesting = testingKeyIds.includes(item.id);
                                const isConfirming = confirmDelete?.kind === "key" && confirmDelete.id === item.id;
                                return (
                                    <tr key={item.id} className={!item.active ? "admin-row--archived" : undefined}>
                                        <td>
                                            <div className="ai-prio-cell">
                                                <span className="p-tiny pixel-label">#{item.priority}</span>
                                                <button
                                                    type="button"
                                                    className="pbtn pbtn--sm pbtn--icon ai-mini-icon"
                                                    onClick={() => handleMoveKey(idx, "up")}
                                                    disabled={idx === 0 || isBusy}
                                                    aria-label="Đẩy key lên"
                                                >
                                                    <PixelIcon name="arrowUp" size={12} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="pbtn pbtn--sm pbtn--icon ai-mini-icon"
                                                    onClick={() => handleMoveKey(idx, "down")}
                                                    disabled={idx === keys.length - 1 || isBusy}
                                                    aria-label="Đẩy key xuống"
                                                >
                                                    <PixelIcon name="arrowDown" size={12} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="admin-cell-title">{item.label || "—"}</td>
                                        <td>
                                            <code className="ai-mono-badge">{item.keyMasked}</code>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className={`p-chip p-tiny ai-status-toggle ${item.active ? "p-chip--sage" : ""}`}
                                                onClick={() => handleToggleKeyActive(item)}
                                                disabled={isBusy}
                                            >
                                                {item.active ? "Đang bật" : "Đã tắt"}
                                            </button>
                                        </td>
                                        <td>
                                            <div className="ai-test-inline">
                                                <span
                                                    className={`p-chip p-tiny ${
                                                        item.lastTestStatus === "OK"
                                                            ? "p-chip--sage"
                                                            : item.lastTestStatus === "FAIL"
                                                              ? "p-chip--rose"
                                                              : ""
                                                    }`}
                                                >
                                                    {isTesting
                                                        ? "Đang test..."
                                                        : item.lastTestStatus === "OK"
                                                          ? "OK"
                                                          : item.lastTestStatus === "FAIL"
                                                            ? `Lỗi (${item.failCount})`
                                                            : "Chưa test"}
                                                </span>
                                                <span className="p-tiny p-muted">{formatAiTestTime(item.lastTestAt)}</span>
                                            </div>
                                            {item.lastTestMessage && item.lastTestStatus === "FAIL" && (
                                                <p className="ai-test-msg">{item.lastTestMessage}</p>
                                            )}
                                        </td>
                                        <td>
                                            <div className="admin-row-actions">
                                                {isConfirming ? (
                                                    <>
                                                        <span className="p-tiny admin-confirm-label">Xóa key?</span>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--danger pbtn--sm"
                                                            onClick={handleConfirmDelete}
                                                            disabled={isBusy}
                                                        >
                                                            Có
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--sm"
                                                            onClick={() => setConfirmDelete(null)}
                                                            disabled={isBusy}
                                                        >
                                                            Huỷ
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--secondary pbtn--sm"
                                                            onClick={() => handleTestSavedKey(item)}
                                                            disabled={isTesting || isBusy}
                                                        >
                                                            <PixelIcon name={isTesting ? "clock" : "play"} size={12} />
                                                            Test
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--accent pbtn--sm"
                                                            onClick={() => openEditKey(item)}
                                                            disabled={isBusy}
                                                        >
                                                            <PixelIcon name="edit" size={12} />
                                                            Sửa
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--sm"
                                                            onClick={() => setConfirmDelete({ kind: "key", id: item.id })}
                                                            disabled={isBusy}
                                                            aria-label={`Xóa key ${item.keyMasked}`}
                                                        >
                                                            <PixelIcon name="trash" size={12} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- TABLE 2: AI MODELS --- */}
            <div className="ai-block">
                <div className="ai-block-head">
                    <span className="pixel-label p-tiny">Danh sách Model Gemini (thử lần lượt từ trên xuống)</span>
                </div>
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Thứ tự</th>
                                <th scope="col">Mã Model</th>
                                <th scope="col">Ghi chú</th>
                                <th scope="col">Trạng thái</th>
                                <th scope="col">Kiểm tra gần nhất</th>
                                <th scope="col">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {models.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="admin-table-empty">
                                        <PixelIcon name="cpu" size={15} />
                                        Danh sách model đang trống.
                                    </td>
                                </tr>
                            )}
                            {models.map((item, idx) => {
                                const isBusy = mutatingId === `model-${item.id}`;
                                const isTesting = testingModelIds.includes(item.id);
                                const isConfirming = confirmDelete?.kind === "model" && confirmDelete.id === item.id;
                                return (
                                    <tr key={item.id} className={!item.active ? "admin-row--archived" : undefined}>
                                        <td>
                                            <div className="ai-prio-cell">
                                                <span className="p-tiny pixel-label">#{item.priority}</span>
                                                <button
                                                    type="button"
                                                    className="pbtn pbtn--sm pbtn--icon ai-mini-icon"
                                                    onClick={() => handleMoveModel(idx, "up")}
                                                    disabled={idx === 0 || isBusy}
                                                    aria-label="Đẩy model lên"
                                                >
                                                    <PixelIcon name="arrowUp" size={12} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="pbtn pbtn--sm pbtn--icon ai-mini-icon"
                                                    onClick={() => handleMoveModel(idx, "down")}
                                                    disabled={idx === models.length - 1 || isBusy}
                                                    aria-label="Đẩy model xuống"
                                                >
                                                    <PixelIcon name="arrowDown" size={12} />
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <code className="ai-mono-badge">{item.modelName}</code>
                                        </td>
                                        <td>{item.displayName || "—"}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className={`p-chip p-tiny ai-status-toggle ${item.active ? "p-chip--sage" : ""}`}
                                                onClick={() => handleToggleModelActive(item)}
                                                disabled={isBusy}
                                            >
                                                {item.active ? "Đang bật" : "Đã tắt"}
                                            </button>
                                        </td>
                                        <td>
                                            <div className="ai-test-inline">
                                                <span
                                                    className={`p-chip p-tiny ${
                                                        item.lastTestStatus === "OK"
                                                            ? "p-chip--sage"
                                                            : item.lastTestStatus === "FAIL"
                                                              ? "p-chip--rose"
                                                              : ""
                                                    }`}
                                                >
                                                    {isTesting
                                                        ? "Đang test..."
                                                        : item.lastTestStatus === "OK"
                                                          ? "OK"
                                                          : item.lastTestStatus === "FAIL"
                                                            ? "Lỗi"
                                                            : "Chưa test"}
                                                </span>
                                                <span className="p-tiny p-muted">{formatAiTestTime(item.lastTestAt)}</span>
                                            </div>
                                            {item.lastTestMessage && item.lastTestStatus === "FAIL" && (
                                                <p className="ai-test-msg">{item.lastTestMessage}</p>
                                            )}
                                        </td>
                                        <td>
                                            <div className="admin-row-actions">
                                                {isConfirming ? (
                                                    <>
                                                        <span className="p-tiny admin-confirm-label">Xóa model?</span>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--danger pbtn--sm"
                                                            onClick={handleConfirmDelete}
                                                            disabled={isBusy}
                                                        >
                                                            Có
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--sm"
                                                            onClick={() => setConfirmDelete(null)}
                                                            disabled={isBusy}
                                                        >
                                                            Huỷ
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--secondary pbtn--sm"
                                                            onClick={() => handleTestSavedModel(item)}
                                                            disabled={isTesting || isBusy}
                                                        >
                                                            <PixelIcon name={isTesting ? "clock" : "play"} size={12} />
                                                            Test
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--accent pbtn--sm"
                                                            onClick={() => openEditModel(item)}
                                                            disabled={isBusy}
                                                        >
                                                            <PixelIcon name="edit" size={12} />
                                                            Sửa
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="pbtn pbtn--sm"
                                                            onClick={() => setConfirmDelete({ kind: "model", id: item.id })}
                                                            disabled={isBusy}
                                                            aria-label={`Xóa model ${item.modelName}`}
                                                        >
                                                            <PixelIcon name="trash" size={12} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- KEY MODAL --- */}
            {keyModalMode && (
                <Modal
                    title={keyModalMode === "create" ? "Thêm Gemini API Key" : `Sửa Key ${editingKey?.keyMasked ?? ""}`}
                    icon="key"
                    onClose={closeKeyModal}
                    actions={(
                        <>
                            <button
                                type="button"
                                className="pbtn pbtn--sm"
                                onClick={closeKeyModal}
                                disabled={keySaving || keyTestingDraft}
                            >
                                Huỷ
                            </button>
                            {keyModalMode === "create" && (
                                <button
                                    type="button"
                                    className="pbtn pbtn--secondary pbtn--sm"
                                    onClick={handleTestDraftKey}
                                    disabled={keySaving || keyTestingDraft || !keyRaw.trim()}
                                >
                                    <PixelIcon name={keyTestingDraft ? "clock" : "play"} size={14} />
                                    {keyTestingDraft ? "Đang test..." : "Test thử key"}
                                </button>
                            )}
                            <button
                                type="submit"
                                form="ai-key-modal-form"
                                className="pbtn pbtn--primary pbtn--sm"
                                disabled={keySaving || keyTestingDraft}
                            >
                                <PixelIcon name={keySaving ? "clock" : "check"} size={14} />
                                {keySaving ? "Đang lưu..." : "Lưu API Key"}
                            </button>
                        </>
                    )}
                >
                    <form id="ai-key-modal-form" className="admin-form" onSubmit={handleSaveKey}>
                        <div className="p-field">
                            <label className="p-label" htmlFor="ai-key-label">
                                Nhãn tài khoản (tuỳ chọn)
                            </label>
                            <input
                                id="ai-key-label"
                                className="p-input"
                                type="text"
                                maxLength={100}
                                value={keyLabel}
                                onChange={e => setKeyLabel(e.target.value)}
                                placeholder="Ví dụ: Tài khoản #1"
                            />
                        </div>

                        {keyModalMode === "create" && (
                            <div className="p-field">
                                <label className="p-label" htmlFor="ai-key-raw">
                                    Mã Google Gemini API Key
                                </label>
                                <div className="admin-config-input">
                                    <input
                                        id="ai-key-raw"
                                        className="p-input"
                                        type={showKeyRaw ? "text" : "password"}
                                        value={keyRaw}
                                        onChange={e => {
                                            setKeyRaw(e.target.value);
                                            setKeyDraftResult(null);
                                        }}
                                        placeholder="AIzaSy..."
                                        autoComplete="off"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="pbtn pbtn--sm"
                                        onClick={() => setShowKeyRaw(s => !s)}
                                        aria-label={showKeyRaw ? "Ẩn mã key" : "Hiện mã key"}
                                    >
                                        <PixelIcon name="eye" size={14} />
                                        {showKeyRaw ? "Ẩn" : "Hiện"}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="admin-config-grid">
                            <div className="p-field">
                                <label className="p-label" htmlFor="ai-key-priority">
                                    Thứ tự ưu tiên (0–10000)
                                </label>
                                <input
                                    id="ai-key-priority"
                                    className="p-input"
                                    type="number"
                                    min={0}
                                    max={10000}
                                    value={keyPriority}
                                    onChange={e => setKeyPriority(e.target.value)}
                                />
                            </div>
                            <div className="p-field">
                                <label className="p-label" htmlFor="ai-key-active">
                                    Trạng thái
                                </label>
                                <select
                                    id="ai-key-active"
                                    className="p-input"
                                    value={keyActive ? "true" : "false"}
                                    onChange={e => setKeyActive(e.target.value === "true")}
                                >
                                    <option value="true">Đang bật</option>
                                    <option value="false">Tạm tắt</option>
                                </select>
                            </div>
                        </div>

                        {keyDraftResult && (
                            <div
                                className={`admin-alert ${keyDraftResult.ok ? "admin-alert--success" : "admin-alert--error"}`}
                                role="status"
                            >
                                <strong>{keyDraftResult.ok ? "Test thành công" : "Test thất bại"}</strong>
                                {` (${keyDraftResult.modelUsed} · ${keyDraftResult.latencyMs}ms): ${keyDraftResult.message}`}
                            </div>
                        )}
                        {keyFormError && <div className="admin-alert admin-alert--error" role="alert">{keyFormError}</div>}
                    </form>
                </Modal>
            )}

            {/* --- MODEL MODAL --- */}
            {modelModalMode && (
                <Modal
                    title={modelModalMode === "create" ? "Thêm Model Gemini" : `Sửa Model ${editingModel?.modelName ?? ""}`}
                    icon="cpu"
                    onClose={closeModelModal}
                    actions={(
                        <>
                            <button
                                type="button"
                                className="pbtn pbtn--sm"
                                onClick={closeModelModal}
                                disabled={modelSaving || modelTestingDraft}
                            >
                                Huỷ
                            </button>
                            {modelModalMode === "create" && (
                                <button
                                    type="button"
                                    className="pbtn pbtn--secondary pbtn--sm"
                                    onClick={handleTestDraftModel}
                                    disabled={modelSaving || modelTestingDraft || !modelName.trim()}
                                >
                                    <PixelIcon name={modelTestingDraft ? "clock" : "play"} size={14} />
                                    {modelTestingDraft ? "Đang test..." : "Test thử model"}
                                </button>
                            )}
                            <button
                                type="submit"
                                form="ai-model-modal-form"
                                className="pbtn pbtn--primary pbtn--sm"
                                disabled={modelSaving || modelTestingDraft}
                            >
                                <PixelIcon name={modelSaving ? "clock" : "check"} size={14} />
                                {modelSaving ? "Đang lưu..." : "Lưu Model"}
                            </button>
                        </>
                    )}
                >
                    <form id="ai-model-modal-form" className="admin-form" onSubmit={handleSaveModel}>
                        {modelModalMode === "create" && (
                            <>
                                <div className="p-field">
                                    <label className="p-label" htmlFor="ai-model-name">
                                        Mã Model
                                    </label>
                                    <input
                                        id="ai-model-name"
                                        className="p-input"
                                        type="text"
                                        maxLength={120}
                                        value={modelName}
                                        onChange={e => {
                                            setModelName(e.target.value);
                                            setModelDraftResult(null);
                                        }}
                                        placeholder="Ví dụ: gemini-2.5-flash"
                                        required
                                    />
                                </div>
                                <div className="ai-preset-chips">
                                    {SUGGESTED_GEMINI_MODELS.map(preset => (
                                        <button
                                            key={preset.name}
                                            type="button"
                                            className="p-chip ai-preset-chip"
                                            onClick={() => {
                                                setModelName(preset.name);
                                                if (!modelDisplayName) setModelDisplayName(preset.label);
                                                setModelDraftResult(null);
                                            }}
                                        >
                                            + {preset.name}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="p-field">
                            <label className="p-label" htmlFor="ai-model-display">
                                Ghi chú hiển thị
                            </label>
                            <input
                                id="ai-model-display"
                                className="p-input"
                                type="text"
                                maxLength={120}
                                value={modelDisplayName}
                                onChange={e => setModelDisplayName(e.target.value)}
                                placeholder="Ví dụ: Nghe nhạc chuẩn"
                            />
                        </div>

                        <div className="admin-config-grid">
                            <div className="p-field">
                                <label className="p-label" htmlFor="ai-model-priority">
                                    Thứ tự ưu tiên (0–10000)
                                </label>
                                <input
                                    id="ai-model-priority"
                                    className="p-input"
                                    type="number"
                                    min={0}
                                    max={10000}
                                    value={modelPriority}
                                    onChange={e => setModelPriority(e.target.value)}
                                />
                            </div>
                            <div className="p-field">
                                <label className="p-label" htmlFor="ai-model-active">
                                    Trạng thái
                                </label>
                                <select
                                    id="ai-model-active"
                                    className="p-input"
                                    value={modelActive ? "true" : "false"}
                                    onChange={e => setModelActive(e.target.value === "true")}
                                >
                                    <option value="true">Đang bật</option>
                                    <option value="false">Tạm tắt</option>
                                </select>
                            </div>
                        </div>

                        {modelDraftResult && (
                            <div
                                className={`admin-alert ${modelDraftResult.ok ? "admin-alert--success" : "admin-alert--error"}`}
                                role="status"
                            >
                                <strong>{modelDraftResult.ok ? "Test thành công" : "Test thất bại"}</strong>
                                {` (${modelDraftResult.latencyMs}ms): ${modelDraftResult.message}`}
                            </div>
                        )}
                        {modelFormError && <div className="admin-alert admin-alert--error" role="alert">{modelFormError}</div>}
                    </form>
                </Modal>
            )}
        </>
    );
};

export default AdminAiConfigPanel;
