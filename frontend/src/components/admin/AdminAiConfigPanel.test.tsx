import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAiConfigPanel from "./AdminAiConfigPanel";
import { adminService } from "../../services/adminService";

vi.mock("../../services/adminService", async () => {
    const actual = await vi.importActual<typeof import("../../services/adminService")>(
        "../../services/adminService",
    );
    return {
        ...actual,
        adminService: {
            ...actual.adminService,
            getAiRuntime: vi.fn(),
            listAiKeys: vi.fn(),
            listAiModels: vi.fn(),
            createAiKey: vi.fn(),
            testDraftAiKey: vi.fn(),
            testAiModelsBatch: vi.fn(),
        },
    };
});

describe("AdminAiConfigPanel", () => {
    const onUnauthorized = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(adminService.getAiRuntime).mockResolvedValue({
            cryptoConfigured: true,
            envFallbackKeyMasked: null,
            envFallbackModel: "gemini-2.5-flash",
            activeDbKeys: 1,
            activeDbModels: 2,
        });
        vi.mocked(adminService.listAiKeys).mockResolvedValue([
            {
                id: 1,
                label: "Key Chính",
                keyMasked: "AIza••••1234",
                active: true,
                priority: 10,
                failCount: 0,
                lastTestAt: null,
                lastTestStatus: "NEVER",
                lastTestMessage: null,
                createdAt: "2026-11-26T00:00:00Z",
                updatedAt: "2026-11-26T00:00:00Z",
            },
        ]);
        vi.mocked(adminService.listAiModels).mockResolvedValue([
            {
                id: 10,
                modelName: "gemini-2.5-flash",
                displayName: "Gemini 2.5 Flash",
                active: true,
                priority: 10,
                lastTestAt: null,
                lastTestStatus: "OK",
                lastTestMessage: "Kết nối Gemini thành công",
                createdAt: "2026-11-26T00:00:00Z",
                updatedAt: "2026-11-26T00:00:00Z",
            },
        ]);
    });

    it("renders runtime status, keys and models, and supports draft testing & saving a new key", async () => {
        vi.mocked(adminService.testDraftAiKey).mockResolvedValue({
            ok: true,
            statusCode: 200,
            latencyMs: 120,
            modelUsed: "gemini-2.5-flash",
            message: "Kết nối Gemini thành công",
        });
        vi.mocked(adminService.createAiKey).mockResolvedValue({
            id: 2,
            label: "Key Phụ",
            keyMasked: "AIza••••9999",
            active: true,
            priority: 20,
            failCount: 0,
            lastTestAt: null,
            lastTestStatus: "NEVER",
            lastTestMessage: null,
            createdAt: "2026-11-26T00:00:00Z",
            updatedAt: "2026-11-26T00:00:00Z",
        });

        render(<AdminAiConfigPanel onUnauthorized={onUnauthorized} />);

        expect(await screen.findByText("Key Chính")).toBeInTheDocument();
        expect(screen.getAllByText("gemini-2.5-flash").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: "Thêm API Key" }));
        fireEvent.change(screen.getByLabelText("Nhãn tài khoản (tuỳ chọn)"), {
            target: { value: "Key Phụ" },
        });
        fireEvent.change(screen.getByLabelText("Mã Google Gemini API Key"), {
            target: { value: "AIzaSyNewTestKey9999" },
        });

        fireEvent.click(screen.getByRole("button", { name: "Test thử key" }));
        expect(await screen.findByText("Test thành công")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Lưu API Key" }));
        await waitFor(() => {
            expect(adminService.createAiKey).toHaveBeenCalledWith(
                expect.objectContaining({
                    label: "Key Phụ",
                    apiKey: "AIzaSyNewTestKey9999",
                }),
            );
        });
    });
});
