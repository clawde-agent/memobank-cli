export interface PlatformItem {
    label: string;
    value: string;
    hint?: string;
    disabled?: boolean;
}
/** Detect git repo name from cwd */
export declare function detectProjectName(): string;
/** Detect which platforms are installed */
export declare function detectPlatforms(): PlatformItem[];
//# sourceMappingURL=platform-detector.d.ts.map