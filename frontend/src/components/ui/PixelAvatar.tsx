const PALETTES = [
    { fur: "#d98c8c", blush: "#e79a9a" },
    { fur: "#8fa88b", blush: "#a8bfa2" },
    { fur: "#c9a66b", blush: "#ddb980" },
    { fur: "#9c8fb5", blush: "#b3a8c9" },
    { fur: "#7fa6b5", blush: "#95b8c5" },
];

const HASH_LIMIT = 4294967296;

const hashSeed = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) % HASH_LIMIT;
    }
    return hash;
};

interface PixelAvatarProps {
    seed: string;
    size?: number;
    className?: string;
    label?: string;
}

export default function PixelAvatar({ seed, size = 40, className, label }: PixelAvatarProps) {
    const hash = hashSeed(seed || "meo-con");
    const palette = PALETTES[hash % PALETTES.length];
    const accessory = Math.floor(hash / 17) % 3;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className={className}
            shapeRendering="crispEdges"
            role={label ? "img" : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            focusable="false"
        >
            <rect width="24" height="24" fill={palette.fur} />
            <rect width="24" height="24" fill="#fff4de" opacity="0.35" />
            <rect x="4" y="3" width="4" height="5" fill={palette.fur} />
            <rect x="16" y="3" width="4" height="5" fill={palette.fur} />
            <rect x="5" y="4" width="2" height="2" fill="#f3d3cd" />
            <rect x="17" y="4" width="2" height="2" fill="#f3d3cd" />
            <rect x="4" y="6" width="16" height="13" fill={palette.fur} />
            <rect x="4" y="6" width="16" height="2" fill="#fff4de" opacity="0.35" />
            <rect x="8" y="10" width="2" height="3" fill="#43313d" />
            <rect x="14" y="10" width="2" height="3" fill="#43313d" />
            <rect x="6" y="14" width="2" height="2" fill={palette.blush} />
            <rect x="16" y="14" width="2" height="2" fill={palette.blush} />
            <rect x="10" y="14" width="4" height="4" fill="#fff4de" />
            <rect x="11" y="14" width="2" height="2" fill="#b56576" />
            <rect x="11" y="16" width="1" height="1" fill="#43313d" />
            <rect x="12" y="17" width="1" height="1" fill="#43313d" />
            <rect x="13" y="16" width="1" height="1" fill="#43313d" />
            {accessory === 0 && (
                <>
                    <rect x="17" y="2" width="2" height="2" fill="#e8b86d" />
                    <rect x="19" y="3" width="2" height="2" fill="#e8b86d" />
                    <rect x="17" y="4" width="2" height="2" fill="#e8b86d" />
                    <rect x="18" y="3" width="1" height="1" fill="#b56576" />
                </>
            )}
            {accessory === 1 && (
                <>
                    <rect x="4" y="2" width="3" height="2" fill="#b56576" />
                    <rect x="7" y="3" width="2" height="2" fill="#b56576" />
                </>
            )}
            {accessory === 2 && (
                <rect x="18" y="5" width="3" height="2" fill="#5f7a66" />
            )}
            <rect x="4.5" y="6.5" width="15" height="12" fill="none" stroke="#43313d" strokeWidth="1" />
        </svg>
    );
}
