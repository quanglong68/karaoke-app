type PeerConnectionLike = Pick<RTCPeerConnection, "remoteDescription" | "addIceCandidate" | "setRemoteDescription">;

const MAX_PENDING_CANDIDATES = 100;
const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

/**
 * Candidates that arrive before the remote description is applied are rejected by
 * the browser. Keep them until setRemoteDescription has landed, then flush.
 */
export function queueIceCandidate(peerId: string, pc: PeerConnectionLike, candidate: RTCIceCandidateInit): void {
    if (pc.remoteDescription) {
        void pc.addIceCandidate(candidate).catch((error) => console.error("Lỗi ICE candidate:", error));
        return;
    }
    const pending = pendingCandidates.get(peerId) ?? [];
    if (pending.length >= MAX_PENDING_CANDIDATES) {
        return;
    }
    pending.push(candidate);
    pendingCandidates.set(peerId, pending);
}

export async function applyRemoteDescription(
    peerId: string,
    pc: PeerConnectionLike,
    description: RTCSessionDescriptionInit,
): Promise<void> {
    await pc.setRemoteDescription(description);
    const pending = pendingCandidates.get(peerId);
    if (!pending) {
        return;
    }
    pendingCandidates.delete(peerId);
    for (const candidate of pending) {
        await pc.addIceCandidate(candidate).catch((error) => console.error("Lỗi ICE candidate:", error));
    }
}

export function clearPendingIceCandidates(peerId: string): void {
    pendingCandidates.delete(peerId);
}

export function pendingIceCandidateCount(peerId: string): number {
    return pendingCandidates.get(peerId)?.length ?? 0;
}
