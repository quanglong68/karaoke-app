import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminSingTestModal from "./AdminSingTestModal";
import { adminService } from "../../services/adminService";

vi.mock("../../hooks/usePitchCapture", () => ({
    usePitchCapture: ({
        sendLyricsOnFinish,
        onSubmit,
    }: {
        enabled: boolean;
        sendLyricsOnFinish: boolean;
        onSubmit: (lyrics: string, pitchContour: number[]) => void;
    }) => {
        if (sendLyricsOnFinish) {
            queueMicrotask(() => {
                onSubmit("Em xin lỗi đã bỏ anh một mình", [220, 246.94, 261.63, 293.66]);
            });
        }
        return { lyricsStatus: "listening", stopCapture: vi.fn() };
    },
}));

vi.mock("../../services/adminService", async () => {
    const actual = await vi.importActual<typeof import("../../services/adminService")>(
        "../../services/adminService",
    );
    return {
        ...actual,
        adminService: {
            ...actual.adminService,
            getGameConfig: vi.fn(),
            testSongScore: vi.fn(),
        },
    };
});

describe("AdminSingTestModal", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: vi.fn().mockResolvedValue({
                    active: true,
                    getTracks: () => [{ stop: vi.fn() }],
                }),
            },
        });
        vi.mocked(adminService.getGameConfig).mockResolvedValue({
            settings: {
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
            },
            defaults: {
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
            },
            limits: {},
        });
    });

    it("walks from listen clip -> countdown -> live mic singing -> detailed score breakdown", async () => {
        vi.mocked(adminService.testSongScore).mockResolvedValue({
            toneScore: 88.5,
            lyricsScore: 96.0,
            finalScore: 91.5,
            successThreshold: 70,
            lyricsWeight: 0.4,
            lyricsUnavailable: false,
            passed: true,
            capturedSampleCount: 40,
            capturedVoicedCount: 36,
            referenceVoicedCount: 42,
            capturedLyrics: "Em xin lỗi đã bỏ anh một mình",
        });

        render(
            <AdminSingTestModal
                target={{
                    mode: "song",
                    id: "S013",
                    songName: "Không Buông",
                    videoUrl: "https://res.cloudinary.com/demo/video/upload/clip.mp4",
                    vocalUrl: "https://res.cloudinary.com/demo/video/upload/vocal.wav",
                    listenDuration: 15,
                    lyrics: "Em xin lỗi đã bỏ anh một mình",
                }}
                onClose={vi.fn()}
                onUnauthorized={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /Vào hát ngay/ }));
        const startNowBtn = await screen.findByRole("button", { name: "Bắt đầu thu ngay" });
        fireEvent.click(startNowBtn);

        const finishBtn = await screen.findByRole("button", { name: /Hát xong · Chấm điểm/ });
        fireEvent.click(finishBtn);

        await waitFor(() => {
            expect(adminService.testSongScore).toHaveBeenCalledWith(
                "S013",
                expect.objectContaining({
                    userLyrics: "Em xin lỗi đã bỏ anh một mình",
                    pitchContour: [220, 246.94, 261.63, 293.66],
                }),
            );
        });

        expect(await screen.findByText(/ĐẠT YÊU CẦU/)).toBeInTheDocument();
        expect(screen.getByText("88.5 / 100")).toBeInTheDocument();
        expect(screen.getByText("96.0 / 100")).toBeInTheDocument();
    });
});
