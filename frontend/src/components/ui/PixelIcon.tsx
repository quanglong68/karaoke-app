import type { ReactNode } from "react";

export type PixelIconName =
    | "mic"
    | "trophy"
    | "chat"
    | "star"
    | "crown"
    | "users"
    | "gear"
    | "play"
    | "volumeOn"
    | "volumeOff"
    | "music"
    | "upload"
    | "arrowLeft"
    | "close"
    | "edit"
    | "check"
    | "clock"
    | "sparkles"
    | "door"
    | "heart"
    | "note"
    | "warning"
    | "home"
    | "menu"
    | "send"
    | "refresh";

const ICONS: Record<PixelIconName, ReactNode> = {
    mic: (
        <>
            <rect x="9" y="3" width="6" height="11" />
            <path d="M6 11v1a6 6 0 0 0 12 0v-1M12 19v3M8 22h8" />
        </>
    ),
    trophy: (
        <>
            <path d="M8 3h8v5a4 4 0 0 1-8 0z" />
            <path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4" />
            <path d="M12 12v4M9 16h6v5H9z" />
        </>
    ),
    chat: (
        <>
            <path d="M4 5h16v11H9l-5 4z" />
            <path d="M8 9h8M8 12h5" />
        </>
    ),
    star: <path d="M12 3l2.5 5.5 6 .6-4.5 4.2 1.3 5.9L12 16.4 6.7 19.2l1.3-5.9L3.5 9.1l6-.6z" />,
    crown: (
        <>
            <path d="M3 8l4.5 3L12 5l4.5 6L21 8l-1.5 10h-15z" />
            <path d="M5 20h14" />
        </>
    ),
    users: (
        <>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
            <path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 4 5v1" />
        </>
    ),
    gear: (
        <>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
        </>
    ),
    play: <path d="M7 4l13 8-13 8z" />,
    volumeOn: (
        <>
            <path d="M4 9h4l5-4v14l-5-4H4z" />
            <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
        </>
    ),
    volumeOff: (
        <>
            <path d="M4 9h4l5-4v14l-5-4H4z" />
            <path d="M16 9l5 6M21 9l-5 6" />
        </>
    ),
    music: (
        <>
            <path d="M9 18V5l10-2v13" />
            <circle cx="6.5" cy="18" r="2.5" />
            <circle cx="16.5" cy="16" r="2.5" />
        </>
    ),
    upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v3h16v-3" />,
    arrowLeft: <path d="M11 5l-7 7 7 7M4 12h16" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    edit: (
        <>
            <path d="M4 20h4L20 8l-4-4L4 16z" />
            <path d="M14 6l4 4" />
        </>
    ),
    check: <path d="M4 12l5 5L20 6" />,
    clock: (
        <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7v5l3 2" />
        </>
    ),
    sparkles: (
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    ),
    door: (
        <>
            <path d="M5 21V4h11v17M3 21h18" />
            <path d="M13 12v2" />
        </>
    ),
    heart: <path d="M12 20L4 12l2-4 3-1 3 3 3-3 3 1 2 4z" />,
    note: (
        <>
            <path d="M9 18V6l10-3v12" />
            <circle cx="6" cy="18" r="3" />
        </>
    ),
    warning: <path d="M12 3L2 21h20zM12 9v5M12 17v.5" />,
    home: (
        <>
            <path d="M3 11l9-7 9 7" />
            <path d="M5 10v10h14V10" />
            <path d="M10 20v-6h4v6" />
        </>
    ),
    send: (
        <>
            <path d="M21 3L3 10l7 3 3 7z" />
            <path d="M10 13l11-10" />
        </>
    ),
    menu: (
        <>
            <path d="M4 6h16M4 12h16M4 18h16" />
        </>
    ),
    refresh: (
        <>
            <path d="M20 12a8 8 0 1 1-2.3-5.6" />
            <path d="M20 4v5h-5" />
        </>
    ),
};

interface PixelIconProps {
    name: PixelIconName;
    size?: number;
    className?: string;
    label?: string;
}

export default function PixelIcon({ name, size = 20, className, label }: PixelIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
            shapeRendering="crispEdges"
            role={label ? "img" : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            focusable="false"
        >
            {ICONS[name]}
        </svg>
    );
}
