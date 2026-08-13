import * as React from "react"
import { useAppStore } from "../store"
import { useI18n } from "../i18n"
import { tokens, Button, Input } from "@fluentui/react-components"
import { Star20Regular, Star20Filled, OpenRegular, CheckmarkCircleRegular, ArrowDownloadRegular, DismissRegular, AddRegular, DocumentTextRegular, DeleteRegular } from "@fluentui/react-icons"
import { ask } from "@tauri-apps/plugin-dialog"
import type { ArticleRow } from "../bridges/feeds"
import ArticleAI from "./ArticleAI"

const S = {
    container: { maxWidth: "740px", margin: "0 auto", padding: "24px 24px 48px" } as React.CSSProperties,
    header: { marginBottom: "12px" } as React.CSSProperties,
    title: { fontSize: "var(--articleTitleSize)", fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.3px", color: tokens.colorNeutralForeground1, margin: "0 0 10px", wordBreak: "break-word" } as React.CSSProperties,
    meta: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const, fontSize: "13px", color: tokens.colorNeutralForeground3 } as React.CSSProperties,
    feedBadge: { fontSize: "12px", padding: "2px 8px", backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground2 } as React.CSSProperties,
    actions: { display: "flex", alignItems: "center", gap: "4px", marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid var(--neutralLayer3)" } as React.CSSProperties,
    content: { fontSize: "var(--articleBodySize)", lineHeight: 1.75, color: tokens.colorNeutralForeground1 } as React.CSSProperties,
    empty: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", height: "100%", color: "var(--neutralSecondary)" } as React.CSSProperties,
    tags: { display: "flex", flexWrap: "wrap" as const, gap: "6px", marginBottom: "14px" } as React.CSSProperties,
    tag: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", padding: "2px 8px", borderRadius: "4px", backgroundColor: "var(--neutralLayer3)", color: tokens.colorNeutralForeground2 } as React.CSSProperties,
    tagRemove: { cursor: "pointer", background: "none", border: "none", color: "inherit", padding: "0 0 0 2px", display: "flex", alignItems: "center", opacity: 0.6 } as React.CSSProperties,
    tagInput: { display: "flex", gap: "6px", marginBottom: "14px", alignItems: "center" } as React.CSSProperties,
}

const contentCss = `
.article-content img { max-width: 100%; height: auto; display: block; margin: 16px auto; }
.article-content a { color: ${tokens.colorBrandForeground1}; text-decoration: none; }
.article-content a:hover { text-decoration: underline; }
.article-content p { margin: 0 0 14px; }
.article-content h1,.article-content h2,.article-content h3 { margin: 24px 0 12px; font-weight: 600; }
.article-content h2 { font-size: 20px; }
.article-content h3 { font-size: 17px; }
.article-content pre { background: var(--neutralLayer3); padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.5; margin: 12px 0; }
.article-content code { background: var(--neutralLayer3); padding: 2px 5px; font-size: 13px; }
.article-content pre code { background: none; padding: 0; }
.article-content blockquote { border-left: 3px solid ${tokens.colorBrandForeground1}; margin: 12px 0; padding: 2px 16px; color: ${tokens.colorNeutralForeground2}; }
.article-content ul,.article-content ol { padding-left: 24px; margin: 8px 0; }
.article-content li { margin-bottom: 4px; }
`

interface Props { article: ArticleRow | null | undefined }

const ArticleDetail: React.FC<Props> = ({ article }) => {
    const toggleStar = useAppStore(st => st.toggleStar)
    const markRead = useAppStore(st => st.markRead)
    const deleteArticle = useAppStore(st => st.deleteArticle)
    const currentArticleTags = useAppStore(st => st.currentArticleTags)
    const loadArticleTags = useAppStore(st => st.loadArticleTags)
    const addTag = useAppStore(st => st.addTag)
    const removeTag = useAppStore(st => st.removeTag)
    const contentRef = React.useRef<HTMLDivElement>(null)
    const { t } = useI18n()
    const [tagInput, setTagInput] = React.useState("")
    const [showTagInput, setShowTagInput] = React.useState(false)
    const [fullText, setFullText] = React.useState<string | null>(null)
    const [extracting, setExtracting] = React.useState(false)
    const [extractError, setExtractError] = React.useState("")

    // Load tags when article changes
    React.useEffect(() => {
        if (!article) return
        loadArticleTags(article.id)
        setTagInput("")
        setShowTagInput(false)
        setFullText(null)
        setExtractError("")
    }, [article?.id])

    if (!article) return <div style={S.container}><div style={S.empty}>{t("page.articleNotFound")}</div></div>

    const handleExport = async (fmt: 'md' | 'html') => {
        try {
            // The native save dialog runs on the Rust side; returns the saved path or "" on cancel.
            await window.feeds.writeArticleExport(article.id, fmt)
        } catch (e) { console.error("Export:", e) }
    }

    const handleDelete = async () => {
        let ok = false
        const msg = `${t("detail.deleteConfirm")}\n\n"${article.title}"`
        try {
            ok = await ask(msg, { title: t("detail.delete"), kind: "warning" })
        } catch {
            ok = window.confirm(msg)
        }
        if (!ok) return
        try {
            await deleteArticle(article.id)
        } catch (e) { console.error("Delete:", e) }
    }

    const handleAddTag = () => {
        const name = tagInput.trim()
        if (!name) return
        addTag(article.id, name)
        setTagInput("")
    }

    const handleExtractFullText = async () => {
        if (!article.link || extracting) return
        setExtracting(true)
        setExtractError("")
        try {
            const full = await window.feeds.fetchFullText(article.id, article.link)
            setFullText(full)
        } catch (e) {
            setExtractError(typeof e === "string" ? e : t("detail.extractFailed", { err: String(e) }))
        } finally {
            setExtracting(false)
        }
    }

    return (
        <div style={S.container}>
            <style>{contentCss}</style>
            <div style={S.header}>
                <h1 style={S.title}>{article.title}</h1>
                <div style={S.meta}>
                    <span style={S.feedBadge}>{article.feed_title}</span>
                    {article.author && <span>by {article.author}</span>}
                    {article.pub_date && <span>{new Date(article.pub_date).toLocaleString()}</span>}
                </div>
            </div>

            {/* Tags */}
            <div style={S.tags}>
                {currentArticleTags.map(tag => (
                    <span key={tag.id} style={S.tag}>
                        {tag.name}
                        <button style={S.tagRemove} onClick={() => removeTag(article.id, tag.id)} title={t("detail.removeTag")}>
                            <DismissRegular fontSize={10} />
                        </button>
                    </span>
                ))}
                {showTagInput ? (
                    <div style={S.tagInput}>
                        <Input size="small" style={{ width: "120px" }} placeholder={t("detail.addTag")}
                            value={tagInput}
                            onChange={(_, d) => setTagInput(d.value)}
                            onKeyDown={e => e.key === "Enter" && handleAddTag()} />
                        <Button size="small" appearance="primary" onClick={handleAddTag}>{t("common.add")}</Button>
                        <Button size="small" appearance="subtle" onClick={() => { setShowTagInput(false); setTagInput("") }}>{t("common.cancel")}</Button>
                    </div>
                ) : (
                    <Button size="small" appearance="subtle" icon={<AddRegular />}
                        onClick={() => setShowTagInput(true)}>{t("detail.tagButton")}</Button>
                )}
            </div>

            <div style={S.actions}>
                <Button appearance="subtle" size="small" icon={<CheckmarkCircleRegular />}
                    onClick={() => markRead(article.id, !article.is_read)}
                    disabled={article.is_read === 1}>{t("detail.markRead")}</Button>
                <Button appearance="subtle" size="small"
                    icon={article.is_starred ? <Star20Filled style={{ color: tokens.colorBrandForeground1 }} /> : <Star20Regular />}
                    onClick={() => toggleStar(article.id)}>{t("detail.star")}</Button>
                <Button appearance="subtle" size="small" icon={<OpenRegular />}
                    onClick={() => article.link && window.utils.openExternal(article.link)}>{t("detail.original")}</Button>
                <Button appearance="subtle" size="small" icon={<DocumentTextRegular />}
                    onClick={handleExtractFullText}
                    disabled={!article.link || extracting}>{extracting ? t("common.extracting") : t("detail.fullText")}</Button>
                <div style={{ flex: 1 }} />
                <Button appearance="subtle" size="small" icon={<ArrowDownloadRegular />}
                    onClick={() => handleExport('md')}>{t("detail.exportMd")}</Button>
                <Button appearance="subtle" size="small" icon={<ArrowDownloadRegular />}
                    onClick={() => handleExport('html')}>{t("detail.exportHtml")}</Button>
                <Button appearance="subtle" size="small" icon={<DeleteRegular />}
                    style={{ color: "#d32f2f" }}
                    onClick={handleDelete}>{t("detail.delete")}</Button>
            </div>
            <ArticleAI articleId={article.id} />
            {extractError && (
                <div style={{ fontSize: "12px", color: "#d32f2f", margin: "0 0 10px" }}>{extractError}</div>
            )}
            <div className="article-content" style={S.content} ref={contentRef}
                dangerouslySetInnerHTML={{ __html: fullText ?? (article.content || article.summary || "") }} />
        </div>
    )
}

export default ArticleDetail
