import * as React from "react"
import { useEffect } from "react"
import { useAppStore } from "../store"
import { ViewType } from "../schema-types"
import ArticleDetail from "./ArticleDetail"
import TagPage from "./TagPage"
import { tokens, Button, Spinner, Input } from "@fluentui/react-components"
import { Star20Regular, Star20Filled, DismissRegular, ArrowLeftRegular } from "@fluentui/react-icons"
import type { ArticleRow, TagRow } from "../bridges/feeds"

// ─── Styles ───

const S = {
    main: {
        paddingTop: "var(--navHeight)", height: "100%", overflow: "auto",
        backgroundColor: "var(--neutralLayer2)",
        boxSizing: "border-box" as const, transition: "margin-left 0.2s",
    } as React.CSSProperties,
    mainMenuOn: { marginLeft: "240px" } as React.CSSProperties,
    empty: {
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%",
        color: tokens.colorNeutralForeground4, gap: "10px",
        userSelect: "none",
    } as React.CSSProperties,
    emptyTitle: { fontSize: "16px", fontWeight: 500 } as React.CSSProperties,
    emptyHint: { fontSize: "13px" } as React.CSSProperties,

    // Card view
    listCard: { margin: "16px auto", maxWidth: "720px", paddingBottom: "32px" } as React.CSSProperties,
    card: {
        backgroundColor: "var(--neutralLayer1)", marginBottom: "8px",
        cursor: "pointer", overflow: "hidden",
        transition: "background 0.1s",
    } as React.CSSProperties,
    cardHover: { backgroundColor: "var(--neutralLayer1Hover)" } as React.CSSProperties,
    cardCover: {
        width: "100%", height: "200px", objectFit: "cover" as const,
        backgroundColor: "var(--neutralLayer3)", display: "block",
    } as React.CSSProperties,
    cardBody: { padding: "16px 20px" } as React.CSSProperties,
    cardTitle: {
        fontSize: "17px", fontWeight: 600, lineHeight: 1.4,
        color: tokens.colorNeutralForeground1, marginBottom: "6px",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        overflow: "hidden",
    } as React.CSSProperties,
    cardSummary: {
        fontSize: "13px", lineHeight: 1.55, color: tokens.colorNeutralForeground2,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        overflow: "hidden", marginBottom: "10px",
    } as React.CSSProperties,
    cardMeta: {
        display: "flex", alignItems: "center", gap: "8px",
        fontSize: "12px", color: tokens.colorNeutralForeground4,
    } as React.CSSProperties,
    tagsRow: {
        display: "flex", flexWrap: "wrap" as const, gap: "4px", marginTop: "6px",
    } as React.CSSProperties,
    tagBadge: {
        fontSize: "10px", padding: "1px 6px", borderRadius: "3px",
        backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground2,
    } as React.CSSProperties,
    feedBadge: {
        fontSize: "11px", padding: "1px 6px",
        backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground2,
    } as React.CSSProperties,
    starBtn: {
        marginLeft: "auto", minWidth: "28px", height: "28px", padding: 0,
        color: tokens.colorBrandForeground1, cursor: "pointer",
        background: "none", border: "none",
    } as React.CSSProperties,

    // List view
    listItem: {
        backgroundColor: "var(--neutralLayer1)", cursor: "pointer",
        marginBottom: "1px", padding: "8px 20px", display: "flex", gap: "12px",
        alignItems: "center", transition: "background 0.08s",
    } as React.CSSProperties,
    listThumb: {
        width: "48px", height: "48px", objectFit: "cover" as const, flexShrink: 0,
        backgroundColor: "var(--neutralLayer3)",
    } as React.CSSProperties,
    listContent: { flex: 1, minWidth: 0 } as React.CSSProperties,
    listTitle: {
        fontSize: "13px", fontWeight: 500, color: tokens.colorNeutralForeground1,
        whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
    } as React.CSSProperties,
    listMeta: {
        fontSize: "11px", color: tokens.colorNeutralForeground4, marginTop: "2px",
    } as React.CSSProperties,

    // Grid view
    gridContainer: {
        margin: "16px auto", maxWidth: "1080px", paddingBottom: "32px",
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "16px", padding: "0 16px",
    } as React.CSSProperties,
    gridItem: {
        backgroundColor: "var(--neutralLayer1)", cursor: "pointer", overflow: "hidden",
        transition: "background 0.1s",
    } as React.CSSProperties,
    gridCover: {
        width: "100%", height: "160px", objectFit: "cover" as const,
        backgroundColor: "var(--neutralLayer3)", display: "block",
    } as React.CSSProperties,
    gridBody: { padding: "12px 14px" } as React.CSSProperties,
    gridTitle: {
        fontSize: "13px", fontWeight: 600, lineHeight: 1.4,
        color: tokens.colorNeutralForeground1,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        overflow: "hidden", marginBottom: "4px",
    } as React.CSSProperties,
    gridMeta: {
        display: "flex", alignItems: "center", gap: "6px",
        fontSize: "11px", color: tokens.colorNeutralForeground4,
    } as React.CSSProperties,

    // Read state
    read: { opacity: 0.5 } as React.CSSProperties,

    // Three-column layout
    threeCol: {
        display: "flex", height: "100%",
    } as React.CSSProperties,
    threeList: {
        width: "320px", flexShrink: 0, overflowY: "auto" as const,
        borderRight: "1px solid var(--neutralLayer3)",
        backgroundColor: "var(--neutralLayer1)",
    } as React.CSSProperties,
    threeDetail: {
        flex: 1, overflowY: "auto" as const,
        backgroundColor: "var(--neutralLayer2)",
    } as React.CSSProperties,
    threeItem: {
        padding: "10px 14px", cursor: "pointer",
        borderBottom: "1px solid var(--neutralLayer3)",
        transition: "background 0.08s",
    } as React.CSSProperties,
    threeItemActive: {
        backgroundColor: tokens.colorSubtleBackgroundSelected,
    } as React.CSSProperties,
    threeTitle: {
        fontSize: "13px", fontWeight: 500, color: tokens.colorNeutralForeground1,
        lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical" as const, overflow: "hidden",
        marginBottom: "3px",
    } as React.CSSProperties,
    threeMeta: {
        fontSize: "11px", color: tokens.colorNeutralForeground4,
        display: "flex", gap: "6px",
    } as React.CSSProperties,
    // Search
    searchBar: {
        margin: "16px auto", maxWidth: "720px", display: "flex", gap: "8px", padding: "0 20px",
    } as React.CSSProperties,
}

// ─── Helpers ───

const formatDate = (dateStr: string): string => {
    if (!dateStr) return ""
    try {
        const d = new Date(dateStr)
        const now = new Date()
        const diff = now.getTime() - d.getTime()
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
        return d.toLocaleDateString()
    } catch { return dateStr }
}

const stripHtml = (html: string): string =>
    html ? html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim() : ""

const getCoverImage = (article: ArticleRow): string => {
    if (article.image_url) return article.image_url
    const m = (article.content || article.summary || "").match(/<img[^>]+src=["']([^"']+)["']/i)
    return m ? m[1] : ""
}

// ─── Article Card ───

const ArticleCard: React.FC<{
    article: ArticleRow; viewType: number; onSelect: () => void; onStar: (e: React.MouseEvent) => void
    tags: TagRow[]
}> = ({ article, viewType, onSelect, onStar, tags }) => {
    const isRead = article.is_read === 1
    const [hover, setHover] = React.useState(false)
    const cover = getCoverImage(article)
    const tagsEl = tags.length > 0 ? (
        <div style={S.tagsRow}>{tags.map(t => <span key={t.id} style={S.tagBadge}>{t.name}</span>)}</div>
    ) : null

    // List view
    if (viewType === ViewType.List) {
        return (
            <div style={{ ...S.listItem, ...(isRead ? S.read : {}), ...(hover && !isRead ? { backgroundColor: "var(--neutralLayer1Hover)" } : {}) }}
                onClick={onSelect}
                onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
                {cover
                    ? <img style={S.listThumb} src={cover} alt="" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                    : <div style={S.listThumb} />}
                <div style={S.listContent}>
                    <div style={S.listTitle}>{article.title}</div>
                    <div style={S.listMeta}>{article.feed_title} &middot; {formatDate(article.pub_date)}</div>
                    {tagsEl}
                </div>
                <button style={S.starBtn} onClick={onStar} tabIndex={-1}>
                    {article.is_starred ? <Star20Filled /> : <Star20Regular />}
                </button>
            </div>
        )
    }

    // Grid view
    if (viewType === ViewType.Magazine) {
        return (
            <div style={{ ...S.gridItem, ...(hover && !isRead ? { backgroundColor: "var(--neutralLayer1Hover)" } : {}) }}
                onClick={onSelect}
                onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
                {cover
                    ? <img style={S.gridCover} src={cover} alt="" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                    : <div style={S.gridCover} />}
                <div style={S.gridBody}>
                    <div style={{ ...S.gridTitle, ...(isRead ? S.read : {}) }}>{article.title}</div>
                    <div style={S.gridMeta}>
                        <span>{article.feed_title}</span>
                        <span>{formatDate(article.pub_date)}</span>
                        <button style={S.starBtn} onClick={onStar} tabIndex={-1}>
                            {article.is_starred ? <Star20Filled /> : <Star20Regular />}
                        </button>
                    </div>
                    {tagsEl}
                </div>
            </div>
        )
    }

    // Card view (default)
    return (
        <div style={{ ...S.card, ...(hover && !isRead ? S.cardHover : {}) }}
            onClick={onSelect}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {cover
                ? <img style={S.cardCover} src={cover} alt="" loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                : <div style={S.cardCover} />}
            <div style={S.cardBody}>
                <div style={{ ...S.cardTitle, ...(isRead ? S.read : {}) }}>{article.title}</div>
                {article.summary && <div style={S.cardSummary}>{stripHtml(article.summary)}</div>}
                {tagsEl}
                <div style={S.cardMeta}>
                    <span style={S.feedBadge}>{article.feed_title}</span>
                    {article.author && <span>{article.author}</span>}
                    <span>{formatDate(article.pub_date)}</span>
                    <button style={S.starBtn} onClick={onStar} tabIndex={-1}>
                        {article.is_starred ? <Star20Filled /> : <Star20Regular />}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Page Component ───

const Page: React.FC = () => {
    const menuOn = useAppStore(st => st.menu)
    const itemId = useAppStore(st => st.itemId)
    const articles = useAppStore(st => st.articles)
    const viewType = useAppStore(st => st.viewType)
    const feeds = useAppStore(st => st.feeds)
    const searchOn = useAppStore(st => st.searchOn)
    const selectArticle = useAppStore(st => st.selectArticle)
    const toggleStar = useAppStore(st => st.toggleStar)
    const loadFeeds = useAppStore(st => st.loadFeeds)
    const loadArticles = useAppStore(st => st.loadArticles)
    const feedId = useAppStore(st => st.feedId)
    const searchArticles = useAppStore(st => st.searchArticles)
    const toggleSearch = useAppStore(st => st.toggleSearch)
    const onlyUnread = useAppStore(st => st.onlyUnread)
    const articleTags = useAppStore(st => st.articleTags)
    const showTagsPage = useAppStore(st => st.showTagsPage)
    const closeTagsPage = useAppStore(st => st.closeTagsPage)
    const tagId = useAppStore(st => st.tagId)
    const [loading, setLoading] = React.useState(true)
    const [query, setQuery] = React.useState("")
    const mainRef = React.useRef<HTMLDivElement>(null)
    const scrollPositions = React.useRef<Record<number, number>>({})

    // Apply saved font size on mount
    useEffect(() => {
        window.settings.getFontSize().then(sz => {
            document.documentElement.style.setProperty('--articleBodySize', `${sz}px`)
            document.documentElement.style.setProperty('--articleTitleSize', `${Math.round(sz * 1.5)}px`)
        })
    }, [])

    useEffect(() => {
        loadFeeds()
        loadArticles(feedId, { onlyUnread: useAppStore.getState().onlyUnread }).finally(() => setLoading(false))
    }, [])

    // Save/restore scroll position per article
    useEffect(() => {
        if (itemId !== null && mainRef.current) {
            const saved = scrollPositions.current[itemId]
            mainRef.current.scrollTop = saved ?? 0
        }
    }, [itemId])
    useEffect(() => {
        if (itemId === null && mainRef.current) {
            mainRef.current.scrollTop = 0
        }
    }, [feedId])

    const handleArticleSelect = (id: number) => {
        if (mainRef.current && itemId !== null) {
            scrollPositions.current[itemId] = mainRef.current.scrollTop
        }
        selectArticle(id)
    }

    // Tags page
    if (showTagsPage) {
        return (
            <div ref={mainRef} style={{ ...S.main, ...(menuOn ? S.mainMenuOn : {}) }}>
                <TagPage />
            </div>
        )
    }

    // Three-column layout
    if (viewType === ViewType.Compact && !searchOn) {
        const activeArticle = itemId ? articles.find(a => a.id === itemId) : null
        return (
            <div style={{ ...S.main, ...(menuOn ? S.mainMenuOn : {}), ...S.threeCol }}>
                <div style={S.threeList}>
                    {articles.map(a => (
                        <div key={a.id}
                            style={{ ...S.threeItem, ...(a.id === itemId ? S.threeItemActive : {}), ...(a.is_read ? S.read : {}) }}
                            onClick={() => handleArticleSelect(a.id)}>
                            <div style={S.threeTitle}>{a.title}</div>
                            <div style={S.threeMeta}>
                                <span>{a.feed_title}</span>
                                <span>{formatDate(a.pub_date)}</span>
                            </div>
                        </div>
                    ))}
                </div>
                <div style={S.threeDetail}>
                    {activeArticle ? <ArticleDetail article={activeArticle} /> : (
                        <div style={{ ...S.empty, marginTop: 0 }}>
                            <div style={S.emptyHint}>Select an article to read</div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Article detail (full page, non-three-column)
    if (itemId !== null) {
        const article = articles.find(a => a.id === itemId)
        return <div ref={mainRef} style={{ ...S.main, ...(menuOn ? S.mainMenuOn : {}) }}>
            <ArticleDetail article={article} />
        </div>
    }

    const hasFeeds = feeds.length > 0
    const hasArticles = articles.length > 0

    return (
        <div ref={mainRef} style={{ ...S.main, ...(menuOn ? S.mainMenuOn : {}) }} data-scroll-container>
            {loading && <div style={S.empty}><Spinner size="medium" /></div>}

            {!loading && (
                <>
                    {searchOn && (
                        <div style={S.searchBar}>
                            <Input style={{ flex: 1 }} placeholder="Search articles..." value={query}
                                onChange={(_, d) => setQuery(d.value)}
                                onKeyDown={(e) => e.key === "Enter" && query.trim() && searchArticles(query.trim())} />
                            <Button appearance="primary" onClick={() => query.trim() && searchArticles(query.trim())}>Search</Button>
                            <Button appearance="subtle" icon={<DismissRegular />}
                                onClick={() => { toggleSearch(); loadArticles(feedId, { onlyUnread }); setQuery("") }} />
                        </div>
                    )}

                    {!searchOn && hasFeeds && articles.length > 0 && (
                        <div style={{ margin: "12px auto", maxWidth: "720px", padding: "0 20px", display: "flex" }}>
                            <span style={{ fontSize: "12px", color: tokens.colorNeutralForeground4, marginLeft: "auto" }}>
                                {articles.length} article{articles.length !== 1 ? "s" : ""}
                            </span>
                        </div>
                    )}

                    {!hasFeeds && !searchOn && (
                        <div style={S.empty}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={tokens.colorNeutralForeground4} strokeWidth="1" opacity="0.5">
                                <path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16" strokeLinecap="round" />
                                <circle cx="5" cy="19" r="1.5" fill={tokens.colorNeutralForeground4} />
                            </svg>
                            <div style={S.emptyTitle}>Welcome to RSS Reader</div>
                            <div style={S.emptyHint}>Open Settings to add your first feed</div>
                        </div>
                    )}

                    {hasFeeds && !hasArticles && !searchOn && (
                        <div style={S.empty}>
                            <div style={S.emptyTitle}>No articles yet</div>
                            <div style={S.emptyHint}>Click the refresh button to fetch latest articles</div>
                        </div>
                    )}

                    {hasArticles && (
                        (viewType === ViewType.Magazine)
                            ? <div style={S.gridContainer}>
                                {articles.map(a => (
                                    <ArticleCard key={a.id} article={a} viewType={viewType}
                                        tags={articleTags[a.id] ?? []}
                                        onSelect={() => handleArticleSelect(a.id)}
                                        onStar={(e) => { e.stopPropagation(); toggleStar(a.id) }} />
                                ))}
                            </div>
                            : <div style={S.listCard}>
                                {articles.map(a => (
                                    <ArticleCard key={a.id} article={a} viewType={viewType}
                                        tags={articleTags[a.id] ?? []}
                                        onSelect={() => handleArticleSelect(a.id)}
                                        onStar={(e) => { e.stopPropagation(); toggleStar(a.id) }} />
                                ))}
                            </div>
                    )}
                </>
            )}
        </div>
    )
}

export default Page
