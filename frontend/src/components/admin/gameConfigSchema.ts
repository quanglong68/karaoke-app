import type { GameConfigLimit } from "../../services/adminService";
import type { GameSettings } from "../../types/room";

export type GameConfigFieldKey = keyof GameSettings;

export interface GameConfigFieldDef {
    key: GameConfigFieldKey;
    label: string;
    hint: string;
    unit: string;
}

export interface GameConfigFieldGroup {
    title: string;
    icon: "trophy" | "clock" | "star";
    fields: GameConfigFieldDef[];
}

const MIN_PERFORMANCE_BUFFER_SECONDS = 5;

export const GAME_CONFIG_FIELD_GROUPS: GameConfigFieldGroup[] = [
    {
        title: "Trận đấu",
        icon: "trophy",
        fields: [
            {
                key: "maxRounds",
                label: "Số vòng tối đa",
                hint: "Trận kết thúc khi hết số vòng này hoặc hết bài hát.",
                unit: "vòng",
            },
            {
                key: "maxPlayers",
                label: "Số người tối đa",
                hint: "Áp dụng cho phòng tạo mới sau khi lưu.",
                unit: "người",
            },
        ],
    },
    {
        title: "Thời gian từng pha",
        icon: "clock",
        fields: [
            {
                key: "buzzerSeconds",
                label: "Giành quyền hát",
                hint: "Thời gian mọi người bấm giành quyền hát.",
                unit: "giây",
            },
            {
                key: "countdownSeconds",
                label: "Đếm ngược trước khi hát",
                hint: "Đếm 3-2-1 trước khi vào phần biểu diễn.",
                unit: "giây",
            },
            {
                key: "performanceSeconds",
                label: "Thời gian biểu diễn",
                hint: "Tổng thời gian một lượt hát.",
                unit: "giây",
            },
            {
                key: "minPerformanceSeconds",
                label: "Thời gian hát tối thiểu",
                hint: "Người hát chỉ được kết thúc sớm sau mốc này, và phải cách tổng thời gian ít nhất 5 giây.",
                unit: "giây",
            },
            {
                key: "evaluationSeconds",
                label: "Chờ chấm điểm",
                hint: "Thời gian tối đa chờ chấm điểm sau khi hát xong.",
                unit: "giây",
            },
            {
                key: "nextPhaseDelaySeconds",
                label: "Nghỉ giữa các pha",
                hint: "Khoảng nghỉ ngắn trước khi sang pha tiếp theo.",
                unit: "giây",
            },
            {
                key: "endGameDelaySeconds",
                label: "Chờ trước khi tổng kết",
                hint: "Thời gian hiện bảng điểm trước khi công bố kết quả cuối.",
                unit: "giây",
            },
        ],
    },
    {
        title: "Chấm điểm",
        icon: "star",
        fields: [
            {
                key: "successScore",
                label: "Điểm đạt",
                hint: "Điểm tối thiểu để người hát được cộng 1 điểm.",
                unit: "điểm",
            },
            {
                key: "lyricsWeight",
                label: "Trọng số điểm lời",
                hint: "0.4 nghĩa là 40% điểm lời, 60% điểm nốt. Không nhận diện được lời thì chấm theo nốt.",
                unit: "",
            },
        ],
    },
];

export const GAME_CONFIG_FIELD_KEYS = GAME_CONFIG_FIELD_GROUPS.flatMap(
    group => group.fields.map(field => field.key),
);

export function settingsToFormValues(settings: GameSettings): Record<GameConfigFieldKey, string> {
    const values = {} as Record<GameConfigFieldKey, string>;
    GAME_CONFIG_FIELD_KEYS.forEach(key => {
        values[key] = String(settings[key]);
    });
    return values;
}

export function formValuesToSettings(values: Record<GameConfigFieldKey, string>): GameSettings {
    return {
        maxRounds: Number(values.maxRounds),
        maxPlayers: Number(values.maxPlayers),
        buzzerSeconds: Number(values.buzzerSeconds),
        countdownSeconds: Number(values.countdownSeconds),
        performanceSeconds: Number(values.performanceSeconds),
        minPerformanceSeconds: Number(values.minPerformanceSeconds),
        evaluationSeconds: Number(values.evaluationSeconds),
        nextPhaseDelaySeconds: Number(values.nextPhaseDelaySeconds),
        endGameDelaySeconds: Number(values.endGameDelaySeconds),
        successScore: Number(values.successScore),
        lyricsWeight: Number(values.lyricsWeight),
    };
}

export function validateGameConfigValues(
    values: Record<GameConfigFieldKey, string>,
    limits: Record<string, GameConfigLimit>,
): Partial<Record<GameConfigFieldKey, string>> {
    const errors: Partial<Record<GameConfigFieldKey, string>> = {};
    const numbers: Partial<Record<GameConfigFieldKey, number>> = {};

    GAME_CONFIG_FIELD_KEYS.forEach(key => {
        const raw = values[key].trim();
        const limit = limits[key];
        if (raw === "" || !Number.isFinite(Number(raw))) {
            errors[key] = "Nhập một số hợp lệ.";
            return;
        }
        const value = Number(raw);
        if (limit && limit.step >= 1 && !Number.isInteger(value)) {
            errors[key] = "Nhập một số nguyên hợp lệ.";
            return;
        }
        numbers[key] = value;
        if (limit && (value < limit.min || value > limit.max)) {
            errors[key] = `Cho phép ${limit.min}–${limit.max}.`;
        }
    });

    const performance = numbers.performanceSeconds;
    const minPerformance = numbers.minPerformanceSeconds;
    if (!errors.minPerformanceSeconds && performance !== undefined && minPerformance !== undefined
        && minPerformance > performance - MIN_PERFORMANCE_BUFFER_SECONDS) {
        errors.minPerformanceSeconds = `Phải nhỏ hơn hoặc bằng ${performance - MIN_PERFORMANCE_BUFFER_SECONDS} giây.`;
    }
    return errors;
}
