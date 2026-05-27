export default function GameStyles() {
    return (
        <style>
            {`
            :root {
                --game-bg: linear-gradient(145deg, #0b0f1d 0%, #151a2e 45%, #1a2140 100%);
                --game-panel: rgba(22, 28, 48, 0.92);
                --game-panel-strong: rgba(30, 38, 64, 0.96);
                --game-accent: #00f5d4;
                --game-accent-2: #ff7a59;
            }
            @keyframes floatIn {
                0% { opacity: 0; transform: translateY(12px) scale(0.99); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
            @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-track { background: rgba(19, 24, 42, 0.9); }
            ::-webkit-scrollbar-thumb { background: rgba(90, 105, 150, 0.8); border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: rgba(120, 140, 190, 0.9); }
            `}
        </style>
    );
}
