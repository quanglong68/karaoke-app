interface PerformancePanelProps {
    perfCountdown: number;
    lyrics: string;
    isSinger: boolean;
    onFinish: () => void;
}

export default function PerformancePanel({ perfCountdown, lyrics, isSinger, onFinish }: PerformancePanelProps) {
    return (
        <div style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--game-panel-strong)",
            padding: "20px",
            boxSizing: "border-box"
        }}>
            <div style={{ width: "100%", textAlign: "center", flexShrink: 0 }}>
                <h2 style={{ color: "#ffd166", fontSize: "26px", margin: "0 0 10px 0", animation: "pulse 1s infinite" }}>
                    🎤 HÃY HÁT THEO LỜI SAU (Còn {perfCountdown}s) 🎤
                </h2>

                <div style={{ width: "80%", height: "12px", backgroundColor: "#2f3542", borderRadius: "6px", margin: "0 auto", overflow: "hidden", border: "1px solid #747d8c" }}>
                    <div style={{
                        width: `${(perfCountdown / 60) * 100}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #00f5d4, #ff7a59)",
                        transition: "width 1s linear",
                        borderRadius: "6px"
                    }} />
                </div>
            </div>

            <div style={{
                backgroundColor: "rgba(8, 12, 26, 0.7)",
                padding: "20px",
                borderRadius: "15px",
                border: "1px solid rgba(255,255,255,0.12)",
                width: "80%",
                textAlign: "center",
                boxShadow: "0 0 20px rgba(0, 245, 212, 0.15)",
                flex: 1,
                margin: "15px 0",
                overflowY: "auto"
            }}>
                <p style={{ fontSize: "24px", color: "#fff", whiteSpace: "pre-wrap", lineHeight: "1.6", margin: 0 }}>
                    {lyrics || "Đang tải lời bài hát..."}
                </p>
            </div>

            <div style={{ width: "100%", display: "flex", justifyContent: "center", height: "55px", flexShrink: 0 }}>
                {isSinger ? (
                    <button
                        onClick={onFinish}
                        style={{
                            padding: "10px 40px",
                            fontSize: "20px",
                            fontWeight: 700,
                            background: "linear-gradient(135deg, #00f5d4, #118ab2)",
                            color: "#001219",
                            border: "none",
                            borderRadius: "40px",
                            cursor: "pointer",
                            boxShadow: "0 5px 18px rgba(0, 245, 212, 0.4)"
                        }}>
                        HÁT XONG RỒI!
                    </button>
                ) : (
                    <p style={{ color: "#a4b0be", fontSize: "16px", margin: 0 }}>Bạn đang lắng nghe ca sĩ biểu diễn...</p>
                )}
            </div>
        </div>
    );
}
