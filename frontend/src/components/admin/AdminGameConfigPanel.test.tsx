import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminGameConfigPanel from "./AdminGameConfigPanel";
import { adminService, type AdminGameConfig } from "../../services/adminService";
import type { GameSettings } from "../../types/room";

vi.mock("../../services/adminService", async () => {
    const actual = await vi.importActual<typeof import("../../services/adminService")>("../../services/adminService");
    return {
        ...actual,
        adminService: {
            ...actual.adminService,
            getGameConfig: vi.fn(),
            updateGameConfig: vi.fn(),
            resetGameConfig: vi.fn(),
        },
    };
});

const DEFAULTS: GameSettings = {
    maxRounds: 3,
    maxPlayers: 5,
    buzzerSeconds: 5,
    countdownSeconds: 3,
    performanceSeconds: 60,
    minPerformanceSeconds: 15,
    evaluationSeconds: 15,
    nextPhaseDelaySeconds: 3,
    endGameDelaySeconds: 5,
    successScore: 70,
    lyricsWeight: 0.4,
};

const CONFIG_PAYLOAD: AdminGameConfig = {
    settings: DEFAULTS,
    defaults: DEFAULTS,
    limits: {
        maxRounds: { min: 1, max: 10, step: 1 },
        maxPlayers: { min: 2, max: 8, step: 1 },
        buzzerSeconds: { min: 3, max: 10, step: 1 },
        countdownSeconds: { min: 2, max: 5, step: 1 },
        performanceSeconds: { min: 30, max: 180, step: 5 },
        minPerformanceSeconds: { min: 5, max: 175, step: 1 },
        evaluationSeconds: { min: 10, max: 30, step: 1 },
        nextPhaseDelaySeconds: { min: 1, max: 10, step: 1 },
        endGameDelaySeconds: { min: 3, max: 15, step: 1 },
        successScore: { min: 50, max: 100, step: 1 },
        lyricsWeight: { min: 0.1, max: 0.9, step: 0.05 },
    },
};

describe("AdminGameConfigPanel", () => {
    const onUnauthorized = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(adminService.getGameConfig).mockResolvedValue(CONFIG_PAYLOAD);
    });

    it("validates minPerformanceSeconds against performanceSeconds and saves valid updates", async () => {
        const updated: GameSettings = { ...DEFAULTS, maxPlayers: 7 };
        vi.mocked(adminService.updateGameConfig).mockResolvedValue(updated);

        render(<AdminGameConfigPanel onUnauthorized={onUnauthorized} />);

        const minPerfInput = await screen.findByLabelText("Thời gian hát tối thiểu");
        fireEvent.change(minPerfInput, { target: { value: "58" } });

        expect(await screen.findByText("Phải nhỏ hơn hoặc bằng 55 giây.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Lưu cấu hình" })).toBeDisabled();

        fireEvent.change(minPerfInput, { target: { value: "15" } });

        const maxPlayersInput = screen.getByLabelText("Số người tối đa");
        fireEvent.change(maxPlayersInput, { target: { value: "7" } });

        const saveBtn = screen.getByRole("button", { name: "Lưu cấu hình" });
        expect(saveBtn).toBeEnabled();
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(adminService.updateGameConfig).toHaveBeenCalledWith(updated);
        });
        expect(await screen.findByText(/Đã lưu cấu hình/)).toBeInTheDocument();
    });

    it("resets configuration after confirmation", async () => {
        vi.mocked(adminService.resetGameConfig).mockResolvedValue(DEFAULTS);

        render(<AdminGameConfigPanel onUnauthorized={onUnauthorized} />);

        await screen.findByLabelText("Số vòng tối đa");
        fireEvent.click(screen.getByRole("button", { name: "Khôi phục mặc định" }));
        fireEvent.click(screen.getByRole("button", { name: "Khôi phục" }));

        await waitFor(() => {
            expect(adminService.resetGameConfig).toHaveBeenCalledTimes(1);
        });
        expect(await screen.findByText("Đã khôi phục cấu hình mặc định.")).toBeInTheDocument();
    });
});
