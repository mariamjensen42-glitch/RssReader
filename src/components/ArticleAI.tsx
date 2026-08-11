import * as React from "react"
import { Button, Spinner, tokens, Dropdown, Option } from "@fluentui/react-components"
import {
    DocumentTextRegular, TagMultipleRegular, TranslateRegular,
    LightbulbFilamentRegular, DismissRegular, ArrowSyncRegular
} from "@fluentui/react-icons"
import type { ViewpointsResult } from "../bridges/ai"
import type { TagRow } from "../bridges/feeds"
import { useAppStore } from "../store"

const S = {
    panel: { maxWidth: "740px", margin: "0 auto", padding: "0 24px 32px", borderTop: "1px solid var(--neutralLayer3)" } as React.CSSProperties,
    buttons: { display: "flex", gap: "6px", padding: "12px 0" } as React.CSSProperties,
    btnRow: { position: "relative" as const, display: "inline-flex" } as React.CSSProperties,
    dot: {
        position: "absolute" as const, top: "-2px", right: "-2px",
        width: "8px", height: "8px", borderRadius: "50%",
        backgroundColor: "#479ef5", zIndex: 1, pointerEvents: "none" as const,
    } as React.CSSProperties,
    result: { padding: "14px 16px", backgroundColor: "var(--neutralLayer3)", borderRadius: "6px", fontSize: "13px", lineHeight: 1.6, color: tokens.colorNeutralForeground1, marginTop: "10px", maxHeight: "300px", overflowY: "auto" as const } as React.CSSProperties,
    resultHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", fontWeight: 600 } as React.CSSProperties,
    resultActions: { display: "flex", gap: "4px" } as React.CSSProperties,
    loading: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", fontSize: "13px", color: tokens.colorNeutralForeground3 } as React.CSSProperties,
    tag: { display: "inline-block", fontSize: "12px", padding: "2px 8px", borderRadius: "4px", marginRight: "6px", marginBottom: "6px", backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground2 } as React.CSSProperties,
    langRow: { display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" } as React.CSSProperties,
    viewpoint: { marginBottom: "10px" } as React.CSSProperties,
    viewpointBullet: { color: "#479ef5", fontWeight: 600, marginRight: "6px" } as React.CSSProperties,
}

type AIAction = "summary" | "tags" | "translate" | "viewpoints"

interface Props { articleId: number | null }

const LANG_OPTIONS = [
    { key: "中文", label: "中文" }, { key: "English", label: "English" },
    { key: "日文", label: "日文" }, { key: "韩文", label: "韩文" },
    { key: "法文", label: "法文" }, { key: "德文", label: "德文" },
]

type CachedItem = {
    summary?: string; tags?: TagRow[]; translate?: string; viewpoints?: ViewpointsResult
}

const ArticleAI: React.FC<Props> = ({ articleId }) => {
    // All results live in this map — single source of truth
    const [cacheMap, setCacheMap] = React.useState<Record<number, CachedItem>>({})
    const [activeAction, setActiveAction] = React.useState<AIAction | null>(null)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string>("")
    const [targetLang, setTargetLang] = React.useState("中文")
    const updateArticleTags = useAppStore(s => s.updateArticleTags)

    const cached = articleId ? (cacheMap[articleId] ?? {}) : {}

    const putCache = (item: CachedItem) => {
        if (!articleId) return
        setCacheMap(prev => ({ ...prev, [articleId]: { ...prev[articleId], ...item } }))
    }

    const regenerate = async (a: AIAction) => {
        if (!articleId) return
        setActiveAction(a); setLoading(true); setError("")
        try {
            switch (a) {
                case "summary": {
                    const r = await window.ai.summarize(articleId)
                    putCache({ summary: r })
                    break
                }
                case "tags": {
                    const t = await window.ai.tag(articleId)
                    putCache({ tags: t })
                    updateArticleTags(articleId, t)
                    break
                }
                case "translate": {
                    const r = await window.ai.translate(articleId, targetLang)
                    putCache({ translate: r })
                    break
                }
                case "viewpoints": {
                    const v = await window.ai.extractViewpoints(articleId)
                    putCache({ viewpoints: v })
                    break
                }
            }
        } catch (e: any) {
            setError(typeof e === "string" ? e : e?.message ?? String(e))
        } finally { setLoading(false) }
    }

    const hasCached = (a: AIAction): boolean => {
        switch (a) {
            case "summary": return !!cached.summary
            case "tags": return (cached.tags?.length ?? 0) > 0
            case "translate": return !!cached.translate
            case "viewpoints": return !!cached.viewpoints
        }
    }

    const handleClick = (a: AIAction) => {
        if (loading) return
        if (hasCached(a)) {
            setError("")
            setActiveAction(prev => prev === a ? null : a)
        } else {
            regenerate(a)
        }
    }

    const dismiss = () => setActiveAction(null)

    if (!articleId) return null

    const isActive = (a: AIAction) => activeAction === a

    return (
        <div style={S.panel}>
            <div style={S.buttons}>
                <Btn label="Summary" icon={<DocumentTextRegular />} active={isActive("summary")} hasData={hasCached("summary")} loading={loading}
                    onClick={() => handleClick("summary")} />
                <Btn label="Auto Tags" icon={<TagMultipleRegular />} active={isActive("tags")} hasData={hasCached("tags")} loading={loading}
                    onClick={() => handleClick("tags")} />
                <Btn label="Translate" icon={<TranslateRegular />} active={isActive("translate")} hasData={hasCached("translate")} loading={loading}
                    onClick={() => handleClick("translate")} />
                <Btn label="Viewpoints" icon={<LightbulbFilamentRegular />} active={isActive("viewpoints")} hasData={hasCached("viewpoints")} loading={loading}
                    onClick={() => handleClick("viewpoints")} />
            </div>

            {loading && (
                <div style={S.loading}>
                    <Spinner size="extra-tiny" />
                    <span>{activeAction === "summary" ? "Generating summary..." : activeAction === "tags" ? "Analyzing tags..." : activeAction === "translate" ? "Translating..." : "Extracting viewpoints..."}</span>
                </div>
            )}

            {error && (
                <div style={{ ...S.result, color: "var(--colorPaletteRedForeground1)", backgroundColor: "transparent", border: "1px solid var(--neutralLayer3)" }}>
                    <div style={S.resultHeader}><span>Error</span><Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={dismiss} /></div>
                    {error}
                </div>
            )}

            {isActive("summary") && cached.summary && (
                <ResultPanel title="Summary" onRegenerate={() => regenerate("summary")} onDismiss={dismiss}>{cached.summary}</ResultPanel>
            )}
            {isActive("translate") && cached.translate && (
                <ResultPanel title="Translation" onRegenerate={() => regenerate("translate")} onDismiss={dismiss}>{cached.translate}</ResultPanel>
            )}
            {isActive("tags") && (cached.tags?.length ?? 0) > 0 && (
                <div style={S.result}>
                    <div style={S.resultHeader}>
                        <span>Tags ({cached.tags!.length})</span>
                        <div style={S.resultActions}>
                            <Button appearance="subtle" size="small" icon={<ArrowSyncRegular />} onClick={() => regenerate("tags")} title="Regenerate" />
                            <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={dismiss} />
                        </div>
                    </div>
                    {cached.tags!.map((t, i) => <span key={i} style={S.tag}>{t.name}</span>)}
                </div>
            )}
            {isActive("viewpoints") && cached.viewpoints && (
                <div style={S.result}>
                    <div style={S.resultHeader}>
                        <span>Viewpoints</span>
                        <div style={S.resultActions}>
                            <Button appearance="subtle" size="small" icon={<ArrowSyncRegular />} onClick={() => regenerate("viewpoints")} title="Regenerate" />
                            <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={dismiss} />
                        </div>
                    </div>
                    <div style={S.viewpoint}><strong>Stance:</strong> {(cached.viewpoints as ViewpointsResult).stance}</div>
                    {(cached.viewpoints as ViewpointsResult).viewpoints.map((v, i) => (
                        <div key={i} style={S.viewpoint}><span style={S.viewpointBullet}>{i + 1}.</span>{v}</div>
                    ))}
                </div>
            )}

            {activeAction === "translate" && !cached.translate && !loading && !error && (
                <div style={S.langRow}>
                    <span style={{ fontSize: "13px", color: tokens.colorNeutralForeground3 }}>Target language:</span>
                    <Dropdown size="small" style={{ width: "120px" }} value={targetLang}
                        onOptionSelect={(_, d) => setTargetLang(d.optionValue ?? "中文")}
                        selectedOptions={[targetLang]}>
                        {LANG_OPTIONS.map(o => <Option key={o.key}>{o.label}</Option>)}
                    </Dropdown>
                </div>
            )}
        </div>
    )
}

// ─── Button with indicator dot ───

const Btn: React.FC<{
    label: string; icon: React.ReactElement; active: boolean; hasData: boolean; loading: boolean; onClick: () => void
}> = ({ label, icon, active, hasData, loading, onClick }) => (
    <div style={S.btnRow}>
        <Button appearance={active ? "primary" : "subtle"} size="small" icon={icon}
            onClick={onClick} disabled={loading}>{label}</Button>
        {hasData && <span style={S.dot} />}
    </div>
)

const ResultPanel: React.FC<{
    title: string; onRegenerate: () => void; onDismiss: () => void; children: React.ReactNode
}> = ({ title, onRegenerate, onDismiss, children }) => (
    <div style={S.result}>
        <div style={S.resultHeader}>
            <span>{title}</span>
            <div style={S.resultActions}>
                <Button appearance="subtle" size="small" icon={<ArrowSyncRegular />} onClick={onRegenerate} title="Regenerate" />
                <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={onDismiss} />
            </div>
        </div>
        {children}
    </div>
)

export default ArticleAI
