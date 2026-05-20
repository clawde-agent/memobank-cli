export interface StudyOptions {
    if?: string;
    list?: boolean;
    repo?: string;
    auto?: boolean;
    silent?: boolean;
}
export interface StudyAutoOptions {
    silent?: boolean;
}
export declare function studyAutoCommand(repoRoot: string, options: StudyAutoOptions): Promise<void>;
export declare function studyCommand(lessonName: string | undefined, options: StudyOptions): Promise<void>;
//# sourceMappingURL=study.d.ts.map