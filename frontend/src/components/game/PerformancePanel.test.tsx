import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PerformancePanel from "./PerformancePanel";

function renderPanel(
    perfCountdown: number,
    onFinish = vi.fn(),
    totalSeconds = 60,
    minSeconds = 15,
) {
    render(
        <PerformancePanel
            perfCountdown={perfCountdown}
            totalSeconds={totalSeconds}
            minSeconds={minSeconds}
            lyrics="la la la"
            isSinger
            singerName="Host"
            onFinish={onFinish}
        />,
    );
    return onFinish;
}

describe("PerformancePanel", () => {
    it("disables the finish button until the minimum has elapsed", () => {
        const onFinish = renderPanel(60);

        const button = screen.getByRole("button", { name: /Hát xong rồi/ });
        expect(button).toBeDisabled();
        expect(screen.getByText(/Có thể kết thúc sau 15s/)).toBeInTheDocument();
        fireEvent.click(button);
        expect(onFinish).not.toHaveBeenCalled();
    });

    it("enables the finish button once the remaining time reaches the minimum", () => {
        const onFinish = renderPanel(45);

        const button = screen.getByRole("button", { name: /Hát xong rồi/ });
        expect(button).toBeEnabled();
        expect(screen.queryByText(/Có thể kết thúc sau/)).not.toBeInTheDocument();
        fireEvent.click(button);
        expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it("follows the room settings instead of the old fixed 60/15 defaults", () => {
        const onFinish = renderPanel(75, vi.fn(), 90, 20);

        const button = screen.getByRole("button", { name: /Hát xong rồi/ });
        expect(button).toBeDisabled();
        expect(screen.getByText(/Có thể kết thúc sau 5s/)).toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "90");
        fireEvent.click(button);
        expect(onFinish).not.toHaveBeenCalled();
    });

    it("does not offer the finish button to listeners", () => {
        render(
            <PerformancePanel
                perfCountdown={60}
                totalSeconds={60}
                minSeconds={15}
                lyrics="la la la"
                isSinger={false}
                singerName="Host"
                onFinish={vi.fn()}
            />,
        );

        expect(screen.queryByRole("button", { name: /Hát xong rồi/ })).not.toBeInTheDocument();
    });
});
