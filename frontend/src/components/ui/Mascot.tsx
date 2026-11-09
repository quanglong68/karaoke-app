import { useCallback, useEffect, useRef, useState } from "react";

const INK = "#43313d";
const FUR = "#f6e3bd";
const CREAM = "#fff4de";
const EYE = "#fffaf0";
const BLUSH = "#e79a9a";
const ROSE = "#b56576";
const MUSTARD = "#e8b86d";
const SKY = "#cfe3dd";
const SKY_2 = "#8fb3ae";

interface MascotProps {
    size?: number;
    className?: string;
    label?: string;
    pokeable?: boolean;
    headOnly?: boolean;
}

export default function Mascot({ size = 64, className, label, pokeable = true, headOnly = false }: MascotProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const pokeTimer = useRef<number | undefined>(undefined);
    const [glance, setGlance] = useState({ x: 0, y: 0 });
    const [blink, setBlink] = useState(false);
    const [poked, setPoked] = useState(false);

    useEffect(() => {
        if (!window.matchMedia("(pointer: fine)").matches) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        let frame = 0;
        const handleMove = (event: PointerEvent) => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => {
                frame = 0;
                const element = svgRef.current;
                if (!element) return;
                const rect = element.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const dx = event.clientX - (rect.left + rect.width / 2);
                const dy = event.clientY - (rect.top + rect.height / 2);
                const nextX = Math.max(-1, Math.min(1, Math.round(dx / (rect.width * 0.7))));
                const nextY = Math.max(-1, Math.min(1, Math.round(dy / (rect.height * 0.7))));
                setGlance((prev) => (prev.x === nextX && prev.y === nextY ? prev : { x: nextX, y: nextY }));
            });
        };

        window.addEventListener("pointermove", handleMove, { passive: true });
        return () => {
            window.removeEventListener("pointermove", handleMove);
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, []);

    useEffect(() => {
        let openTimer = 0;
        let blinkTimer = 0;
        const schedule = () => {
            blinkTimer = window.setTimeout(() => {
                setBlink(true);
                openTimer = window.setTimeout(() => {
                    setBlink(false);
                    schedule();
                }, 150);
            }, 2600 + Math.random() * 3400);
        };
        schedule();
        return () => {
            window.clearTimeout(openTimer);
            window.clearTimeout(blinkTimer);
        };
    }, []);

    useEffect(() => () => window.clearTimeout(pokeTimer.current), []);

    const eyeShift = size >= 96 ? 2 : 1;

    const handlePoke = useCallback(() => {
        if (!pokeable) return;
        setBlink(true);
        setPoked(false);
        window.clearTimeout(pokeTimer.current);
        window.requestAnimationFrame(() => setPoked(true));
        pokeTimer.current = window.setTimeout(() => {
            setPoked(false);
            setBlink(false);
        }, 520);
    }, [pokeable]);

    return (
        <span
            className={`mascot-shell${pokeable ? " is-interactive" : ""}${poked ? " is-poked" : ""}${className ? ` ${className}` : ""}`}
            onClick={pokeable ? handlePoke : undefined}
            aria-hidden={label ? undefined : true}
        >
            <svg
                ref={svgRef}
                className={`mascot${size >= 64 ? " mascot--idle" : ""}`}
                width={headOnly ? size : size * 1.25}
                height={size}
                viewBox={headOnly ? "7 3 25 25" : "0 0 40 32"}
                shapeRendering="crispEdges"
                role={label ? "img" : undefined}
                aria-label={label}
                aria-hidden={label ? undefined : true}
                focusable="false"
            >
                {!headOnly && (
                    <>
                        <rect x="7" y="21" width="3" height="7" fill={INK} />
                        <rect x="8" y="22" width="1" height="4" fill={FUR} />
                        <rect x="7" y="26" width="7" height="2" fill={INK} />
                        <rect x="8" y="26" width="5" height="1" fill={FUR} />

                        <rect x="13" y="20" width="14" height="9" fill={INK} />
                        <rect x="14" y="21" width="12" height="7" fill={FUR} />
                    </>
                )}

                <rect x="8" y="8" width="24" height="15" fill={INK} />
                <rect x="9" y="9" width="22" height="13" fill={FUR} />
                <rect x="15" y="15" width="10" height="6" fill={CREAM} />
                <rect x="10" y="17" width="3" height="2" fill={BLUSH} />
                <rect x="27" y="17" width="3" height="2" fill={BLUSH} />

                {blink ? (
                    <>
                        <rect x="13" y="15" width="4" height="1" fill={INK} />
                        <rect x="23" y="15" width="4" height="1" fill={INK} />
                    </>
                ) : (
                    <g transform={`translate(${glance.x * eyeShift} ${glance.y * eyeShift})`}>
                        <rect x="13" y="12" width="4" height="5" fill={INK} />
                        <rect x="14" y="13" width="1" height="1" fill={EYE} />
                        <rect x="23" y="12" width="4" height="5" fill={INK} />
                        <rect x="24" y="13" width="1" height="1" fill={EYE} />
                    </g>
                )}

                <rect x="19" y="17" width="2" height="2" fill={ROSE} />
                <rect x="18" y="19" width="1" height="1" fill={INK} />
                <rect x="19" y="20" width="2" height="1" fill={INK} />
                <rect x="21" y="19" width="1" height="1" fill={INK} />

                <rect x="10" y="4" width="5" height="5" fill={INK} />
                <rect x="11" y="5" width="3" height="4" fill={FUR} />
                <rect x="12" y="5" width="1" height="2" fill={BLUSH} />
                <rect x="25" y="4" width="5" height="5" fill={INK} />
                <rect x="26" y="5" width="3" height="4" fill={FUR} />
                <rect x="27" y="5" width="1" height="2" fill={BLUSH} />

                <rect x="12" y="22" width="16" height="1" fill={MUSTARD} />
                <rect x="12" y="23" width="16" height="2" fill={ROSE} />
                <rect x="18" y="25" width="4" height="1" fill={ROSE} />
                <rect x="19" y="26" width="2" height="1" fill={ROSE} />

                {!headOnly && (
                    <>
                        <rect x="33" y="15" width="3" height="1" fill={INK} />
                        <rect x="32" y="16" width="5" height="4" fill={INK} />
                        <rect x="33" y="20" width="3" height="1" fill={INK} />
                        <rect x="33" y="16" width="3" height="4" fill={SKY} />
                        <rect x="33" y="16" width="1" height="1" fill={CREAM} />
                        <rect x="33" y="18" width="3" height="1" fill={INK} />
                        <rect x="33" y="21" width="3" height="6" fill={INK} />
                        <rect x="34" y="22" width="1" height="4" fill={SKY_2} />
                        <rect x="25" y="24" width="5" height="3" fill={INK} />
                        <rect x="26" y="25" width="3" height="1" fill={FUR} />
                        <rect x="28" y="23" width="6" height="5" fill={INK} />
                        <rect x="29" y="24" width="4" height="3" fill={FUR} />
                    </>
                )}
            </svg>
        </span>
    );
}
