import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error("Unhandled UI error", error, info.componentStack);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        minHeight: "100vh",
                        display: "grid",
                        placeItems: "center",
                        padding: 24,
                        background: "#fbf1de",
                        color: "#3d2b1f",
                        textAlign: "center",
                    }}
                >
                    <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
                        <h1 style={{ fontSize: 20, margin: 0 }}>Giao diện gặp lỗi</h1>
                        <p style={{ margin: 0 }}>
                            Đã xảy ra lỗi không mong muốn. Tải lại trang để tiếp tục; phiên chơi vẫn được giữ
                            trong thời gian ngắn.
                        </p>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            style={{
                                justifySelf: "center",
                                padding: "10px 18px",
                                border: "2px solid #3d2b1f",
                                borderRadius: 8,
                                background: "#ffd27a",
                                color: "#3d2b1f",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            Tải lại trang
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
