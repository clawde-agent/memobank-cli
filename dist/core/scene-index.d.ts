export interface SceneEntry {
    filename: string;
    summary: string;
    heat: number;
    created: string;
    updated: string;
}
export declare function readSceneIndex(memoDir: string): Promise<SceneEntry[]>;
export declare function writeSceneIndex(memoDir: string, entries: SceneEntry[]): Promise<void>;
export declare function updateSceneHeat(memoDir: string, filename: string): Promise<void>;
//# sourceMappingURL=scene-index.d.ts.map