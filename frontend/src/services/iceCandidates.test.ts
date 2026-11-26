import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    applyRemoteDescription,
    clearPendingIceCandidates,
    pendingIceCandidateCount,
    queueIceCandidate,
} from "./iceCandidates";

interface FakePeerConnection {
    remoteDescription: RTCSessionDescription | null;
    addIceCandidate: ReturnType<typeof vi.fn>;
    setRemoteDescription: ReturnType<typeof vi.fn>;
    added: RTCIceCandidateInit[];
}

function fakePeerConnection(): FakePeerConnection {
    const connection: FakePeerConnection = {
        remoteDescription: null,
        added: [],
        addIceCandidate: vi.fn(async (candidate: RTCIceCandidateInit) => {
            connection.added.push(candidate);
        }),
        setRemoteDescription: vi.fn(async () => {
            connection.remoteDescription = { type: "offer", sdp: "remote" } as RTCSessionDescription;
        }),
    };
    return connection;
}

describe("iceCandidates", () => {
    beforeEach(() => {
        clearPendingIceCandidates("peer-a");
        clearPendingIceCandidates("peer-b");
    });

    it("buffers candidates until the remote description is applied", () => {
        const pc = fakePeerConnection();
        const first = { candidate: "candidate:1" };
        const second = { candidate: "candidate:2" };

        queueIceCandidate("peer-a", pc as unknown as RTCPeerConnection, first);
        queueIceCandidate("peer-a", pc as unknown as RTCPeerConnection, second);

        expect(pc.addIceCandidate).not.toHaveBeenCalled();
        expect(pendingIceCandidateCount("peer-a")).toBe(2);
    });

    it("flushes buffered candidates after setRemoteDescription", async () => {
        const pc = fakePeerConnection();
        const first = { candidate: "candidate:1" };
        const second = { candidate: "candidate:2" };
        queueIceCandidate("peer-a", pc as unknown as RTCPeerConnection, first);
        queueIceCandidate("peer-a", pc as unknown as RTCPeerConnection, second);

        await applyRemoteDescription("peer-a", pc as unknown as RTCPeerConnection, { type: "offer", sdp: "remote" });

        expect(pc.setRemoteDescription).toHaveBeenCalledTimes(1);
        expect(pc.added).toEqual([first, second]);
        expect(pendingIceCandidateCount("peer-a")).toBe(0);
    });

    it("applies candidates immediately once the remote description exists", () => {
        const pc = fakePeerConnection();
        pc.remoteDescription = { type: "answer", sdp: "remote" } as RTCSessionDescription;

        queueIceCandidate("peer-b", pc as unknown as RTCPeerConnection, { candidate: "candidate:3" });

        expect(pc.addIceCandidate).toHaveBeenCalledTimes(1);
        expect(pendingIceCandidateCount("peer-b")).toBe(0);
    });

    it("drops buffered candidates when the peer is torn down", () => {
        const pc = fakePeerConnection();
        queueIceCandidate("peer-a", pc as unknown as RTCPeerConnection, { candidate: "candidate:1" });

        clearPendingIceCandidates("peer-a");

        expect(pendingIceCandidateCount("peer-a")).toBe(0);
    });
});
