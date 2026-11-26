import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUploadPanel from "./AdminUploadPanel";
import { adminService } from "../../services/adminService";

vi.mock("../../services/adminService", async () => {
    const actual = await vi.importActual<typeof import("../../services/adminService")>(
        "../../services/adminService",
    );
    return {
        ...actual,
        adminService: {
            ...actual.adminService,
            createYoutubeDraft: vi.fn(),
            analyzeSongDraft: vi.fn(),
            commitSongDraft: vi.fn(),
            deleteSongDraft: vi.fn(),
        },
    };
});

describe("AdminUploadPanel", () => {
    const onUnauthorized = vi.fn();
    const onOpenAiConfig = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("completes the 3-step YouTube smart draft -> analyze -> commit workflow", async () => {
        vi.mocked(adminService.createYoutubeDraft).mockResolvedValue({
            draftId: "11111111-2222-3333-4444-555555555555",
            suggestedTitle: "Không Buông",
            totalDuration: 180,
            hasOfficialSubtitles: false,
            sourceStreamUrl: "/api/admin/song-drafts/11111111-2222-3333-4444-555555555555/media/source",
        });

        vi.mocked(adminService.analyzeSongDraft).mockResolvedValue({
            draftId: "11111111-2222-3333-4444-555555555555",
            listenDuration: 15,
            singDuration: 20,
            pitchSampleCount: 100,
            voicedSampleCount: 72,
            suggestedTitle: "Không Buông",
            lyrics: "Em cũng có nỗi niềm của riêng mình\nEm xin lỗi đã bỏ anh một mình",
            lyricsSource: "GEMINI_AUDIO (gemini-2.5-flash)",
            lyricsWarning: null,
            listenClipUrl: "/api/admin/song-drafts/11111111-2222-3333-4444-555555555555/media/listen-clip?v=1",
            vocalPreviewUrl: "/api/admin/song-drafts/11111111-2222-3333-4444-555555555555/media/vocal-preview?v=1",
        });

        vi.mocked(adminService.commitSongDraft).mockResolvedValue({
            id: "S013",
            title: "Không Buông",
        });

        render(<AdminUploadPanel onUnauthorized={onUnauthorized} onOpenAiConfig={onOpenAiConfig} />);

        const urlInput = screen.getByLabelText("Link YouTube bài hát");
        fireEvent.change(urlInput, { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
        fireEvent.click(screen.getByRole("button", { name: "Nạp video" }));

        const listenEndInput = await screen.findByLabelText("Giây kết thúc đoạn nghe mồi");
        // Simulate typing multi-digit decimal seconds ("4" -> "44." -> "44.5") naturally
        fireEvent.focus(listenEndInput);
        fireEvent.change(listenEndInput, { target: { value: "4" } });
        fireEvent.change(listenEndInput, { target: { value: "44." } });
        fireEvent.change(listenEndInput, { target: { value: "44.5" } });
        fireEvent.blur(listenEndInput);

        expect(screen.getByLabelText("Giây bắt đầu đoạn nghe mồi")).toHaveValue("20.0");
        expect(listenEndInput).toHaveValue("44.5");
        expect(screen.getByLabelText("Giây bắt đầu đoạn hát")).toHaveValue("44.5");

        fireEvent.click(
            screen.getByRole("button", {
                name: /Tách giọng & Lấy lời/,
            }),
        );

        expect(await screen.findByText(/Vocal đã tách/)).toBeInTheDocument();
        const sentFormData = vi.mocked(adminService.analyzeSongDraft).mock.calls[0][1];
        expect(sentFormData.get("listenStart")).toBe("20");
        expect(sentFormData.get("listenEnd")).toBe("44.5");
        expect(sentFormData.get("singStart")).toBe("44.5");

        expect(screen.getByDisplayValue("Không Buông")).toBeInTheDocument();
        expect(
            screen.getByDisplayValue(/Em cũng có nỗi niềm của riêng mình/),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Lưu vào thư viện" }));

        await waitFor(() => {
            expect(adminService.commitSongDraft).toHaveBeenCalledWith(
                "11111111-2222-3333-4444-555555555555",
                expect.objectContaining({
                    title: "Không Buông",
                }),
                expect.anything(),
            );
        });
        expect(await screen.findByText(/Đã lưu "Không Buông" \(S013\)/)).toBeInTheDocument();
    });

    it("clears stale lyrics when re-analyzing onto an empty/instrumental segment", async () => {
        vi.mocked(adminService.createYoutubeDraft).mockResolvedValue({
            draftId: "22222222-2222-3333-4444-555555555555",
            suggestedTitle: "Bài Test",
            totalDuration: 120,
            hasOfficialSubtitles: false,
            sourceStreamUrl: "/api/admin/song-drafts/22222222-2222-3333-4444-555555555555/media/source",
        });

        vi.mocked(adminService.analyzeSongDraft)
            .mockResolvedValueOnce({
                draftId: "22222222-2222-3333-4444-555555555555",
                listenDuration: 15,
                singDuration: 20,
                pitchSampleCount: 100,
                voicedSampleCount: 60,
                suggestedTitle: "Bài Test",
                lyrics: "Câu lời lần 1",
                lyricsSource: "GEMINI_AUDIO",
                lyricsWarning: null,
                listenClipUrl: "/clip?v=1",
                vocalPreviewUrl: "/vocal?v=1",
            })
            .mockResolvedValueOnce({
                draftId: "22222222-2222-3333-4444-555555555555",
                listenDuration: 15,
                singDuration: 20,
                pitchSampleCount: 100,
                voicedSampleCount: 2,
                suggestedTitle: "Bài Test",
                lyrics: "",
                lyricsSource: "MANUAL_REQUIRED",
                lyricsWarning: "Đoạn không lời",
                listenClipUrl: "/clip?v=2",
                vocalPreviewUrl: "/vocal?v=2",
            });

        render(<AdminUploadPanel onUnauthorized={onUnauthorized} onOpenAiConfig={onOpenAiConfig} />);

        fireEvent.change(screen.getByLabelText("Link YouTube bài hát"), {
            target: { value: "https://youtu.be/dQw4w9WgXcQ" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Nạp video" }));
        await screen.findByLabelText("Giây kết thúc đoạn nghe mồi");

        fireEvent.click(screen.getByRole("button", { name: /Tách giọng & Lấy lời/ }));
        expect(await screen.findByDisplayValue("Câu lời lần 1")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Tách lại/ }));
        await screen.findByText(/Đoạn không lời/);
        expect(screen.queryByDisplayValue("Câu lời lần 1")).not.toBeInTheDocument();
    });
});
