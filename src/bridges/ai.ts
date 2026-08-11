import { invoke } from "@tauri-apps/api/core"
import type { TagRow } from "./feeds"

export interface ViewpointsResult {
    viewpoints: string[]
    stance: string
}

export const aiBridge = {
    summarize: (articleId: number, modelOverride?: string): Promise<string> =>
        invoke("summarize_article", { articleId, modelOverride: modelOverride ?? null }),

    tag: (articleId: number, modelOverride?: string): Promise<TagRow[]> =>
        invoke("tag_article", { articleId, modelOverride: modelOverride ?? null }),

    translate: (articleId: number, targetLang: string, modelOverride?: string): Promise<string> =>
        invoke("translate_article", { articleId, targetLang, modelOverride: modelOverride ?? null }),

    extractViewpoints: (articleId: number, modelOverride?: string): Promise<ViewpointsResult> =>
        invoke("extract_viewpoints", { articleId, modelOverride: modelOverride ?? null }),
}

export default aiBridge
