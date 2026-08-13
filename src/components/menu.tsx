import * as React from "react"
import { useEffect } from "react"
import { useAppStore } from "../store"
import { useI18n } from "../i18n"
import { tokens, Button, Input } from "@fluentui/react-components"
import { DocumentOnePageMultiple16Regular, Star16Regular, DismissRegular, EditRegular, CheckmarkRegular, ArrowSyncRegular, TagRegular, DeleteRegular } from "@fluentui/react-icons"
import { ask } from "@tauri-apps/plugin-dialog"

const S: Record<string, React.CSSProperties> = {
    sidebar: {
        position: "fixed", left: 0, top: "var(--navHeight)", bottom: 0,
        width: "240px", zIndex: 4,
        backgroundColor: "var(--neutralLayer1)",
        borderRight: "1px solid var(--neutralLayer2)",
        display: "flex", flexDirection: "column",
    },
    scroll: { flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: "12px" },
    sectionTitle: {
        fontSize: "11px", fontWeight: 600, letterSpacing: "0.5px",
        color: tokens.colorNeutralForeground4, textTransform: "uppercase" as const,
        padding: "16px 16px 6px", userSelect: "none" as const,
    },
    item: {
        display: "flex", alignItems: "center", gap: "8px",
        padding: "6px 12px", margin: "1px 6px", borderRadius: "4px",
        cursor: "pointer", userSelect: "none" as const, fontSize: "13px",
        color: tokens.colorNeutralForeground2, transition: "background 0.1s",
    },
    itemActive: {
        backgroundColor: tokens.colorSubtleBackgroundSelected,
        color: tokens.colorNeutralForeground1, fontWeight: 600,
    },
    itemHover: { backgroundColor: tokens.colorNeutralBackground1Hover },
    itemIcon: { flexShrink: 0, color: tokens.colorNeutralForeground3, fontSize: "16px" },
    itemLabel: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
    badge: {
        fontSize: "11px", fontWeight: 500, padding: "1px 5px", borderRadius: "8px",
        backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1,
        flexShrink: 0, minWidth: "18px", textAlign: "center" as const,
    },
    errorBadge: {
        fontSize: "10px", fontWeight: 600, padding: "1px 5px", borderRadius: "8px",
        backgroundColor: "#d32f2f22", color: "#d32f2f",
        flexShrink: 0, minWidth: "16px", textAlign: "center" as const,
    },
    count: { fontSize: "11px", color: tokens.colorNeutralForeground4, flexShrink: 0 },
    empty: { fontSize: "12px", color: tokens.colorNeutralForeground4, padding: "4px 16px", userSelect: "none" as const },
    groupLabel: { fontSize: "12px", fontWeight: 500, color: tokens.colorNeutralForeground2, padding: "4px 16px", userSelect: "none" as const, cursor: "default" },
    ctxMenu: {
        position: "fixed", zIndex: 30, backgroundColor: "var(--neutralLayer1)",
        border: "1px solid var(--neutralLayer3)", borderRadius: "6px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)", minWidth: "160px", padding: "4px",
    },
    ctxItem: {
        display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px",
        fontSize: "13px", cursor: "pointer", borderRadius: "4px",
        color: tokens.colorNeutralForeground1,
    },
    ctxItemDanger: { color: "#d32f2f" },
    ctxSep: { height: "1px", backgroundColor: "var(--neutralLayer3)", margin: "4px 0" },
}

const SidebarItem: React.FC<{
    label: string; active?: boolean; icon?: React.ReactNode;
    badge?: React.ReactNode; count?: string; indent?: boolean; error?: number;
    onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void;
}> = ({ label, active, icon, badge, count, indent, error, onClick, onContextMenu }) => {
    const [hover, setHover] = React.useState(false)
    const { t } = useI18n()
    return (
        <div
            style={{
                ...S.item,
                ...(active ? S.itemActive : {}),
                ...(hover && !active ? S.itemHover : {}),
                ...(indent ? { paddingLeft: "28px" } : {}),
            }}
            onClick={onClick}
            onContextMenu={onContextMenu}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {icon}
            <span style={S.itemLabel}>{label}</span>
            {count && <span style={S.count}>{count}</span>}
            {error ? (
                <span style={S.errorBadge} title={t("menu.failedRefresh", { count: error })}>!{error}</span>
            ) : null}
            {badge}
        </div>
    )
}

export const Menu: React.FC = () => {
    const display = useAppStore(s => s.menu)
    const feedId = useAppStore(s => s.feedId)
    const feeds = useAppStore(s => s.feeds)
    const selectAllArticles = useAppStore(s => s.selectAllArticles)
    const selectFeed = useAppStore(s => s.selectFeed)
    const loadFeeds = useAppStore(s => s.loadFeeds)
    const loadArticles = useAppStore(s => s.loadArticles)
    const setTitle = useAppStore(s => s.setTitle)
    const updateFeed = useAppStore(s => s.updateFeed)
    const removeFeed = useAppStore(s => s.removeFeed)
    const markAllRead = useAppStore(s => s.markAllRead)
    const refreshFeed = useAppStore(s => s.refreshFeed)
    const clearReadArticles = useAppStore(s => s.clearReadArticles)
    const tags = useAppStore(s => s.tags)
    const showTagsPage = useAppStore(s => s.showTagsPage)
    const openTagsPage = useAppStore(s => s.openTagsPage)
    const closeTagsPage = useAppStore(s => s.closeTagsPage)
    const loadAllTags = useAppStore(s => s.loadAllTags)
    const { t } = useI18n()

    const [ctxMenu, setCtxMenu] = React.useState<{ x: number; y: number; feed: typeof feeds[0] } | null>(null)
    const [editingFeed, setEditingFeed] = React.useState<number | null>(null)
    const [editTitle, setEditTitle] = React.useState("")
    const [editGroup, setEditGroup] = React.useState("")

    useEffect(() => { loadFeeds(); loadAllTags() }, [])

    const totalUnread = React.useMemo(() =>
        feeds.reduce((s, f) => s + f.unread_count, 0), [feeds])

    const groupedFeeds = React.useMemo(() => {
        const groups = new Map<string, typeof feeds>()
        for (const feed of feeds) {
            const key = feed.group_name || ""
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(feed)
        }
        const entries = Array.from(groups.entries())
        entries.sort(([a], [b]) => {
            if (a === "" && b !== "") return -1
            if (a !== "" && b === "") return 1
            return a.localeCompare(b)
        })
        return entries
    }, [feeds])

    const handleCtxMenu = (e: React.MouseEvent, feed: typeof feeds[0]) => {
        e.preventDefault()
        setCtxMenu({ x: e.clientX, y: e.clientY, feed })
    }

    const handleClearRead = async () => {
        let ok = false
        const msg = t("menu.clearReadConfirm")
        try {
            ok = await ask(msg, { title: t("menu.clearRead"), kind: "warning" })
        } catch {
            ok = window.confirm(msg)
        }
        if (!ok) return
        try {
            await clearReadArticles()
        } catch (e) { console.error("clearRead:", e) }
    }

    // Close context menu on any click
    useEffect(() => {
        const h = () => setCtxMenu(null)
        document.addEventListener("click", h)
        return () => document.removeEventListener("click", h)
    }, [])

    if (!display) return null

    return (
        <div style={S.sidebar}>
            <div style={S.scroll}>
                <SidebarItem
                    label={t("menu.allArticles")} active={feedId === null}
                    icon={<DocumentOnePageMultiple16Regular />}
                    count={totalUnread > 0 ? totalUnread.toString() : undefined}
                    onClick={() => { selectAllArticles(); closeTagsPage() }}
                />
                <SidebarItem
                    label={t("menu.starred")}
                    icon={<Star16Regular />}
                    onClick={() => { useAppStore.setState({ starredView: true, tagId: null }); loadArticles(null, { onlyStarred: true }); setTitle(t("menu.starred")); closeTagsPage() }}
                />
                <SidebarItem
                    label={t("menu.tags")}
                    active={showTagsPage}
                    icon={<TagRegular />}
                    count={tags.length > 0 ? tags.length.toString() : undefined}
                    onClick={openTagsPage}
                />

                <div style={{ ...S.item, ...{ color: "#d32f2f", marginTop: "12px" } }}
                    onClick={handleClearRead}
                    title={t("menu.clearReadTitle")}>
                    <DeleteRegular fontSize={14} />
                    <span style={S.itemLabel}>{t("menu.clearRead")}</span>
                </div>

                <div style={S.sectionTitle}>{t("menu.feeds")}</div>

                {feeds.length === 0 && (
                    <div style={S.empty}>{t("menu.noFeeds")}</div>
                )}

                {groupedFeeds.map(([group, groupFeeds]) => (
                    <React.Fragment key={group || "__ungrouped"}>
                        {group && <div style={S.groupLabel}>{group}</div>}
                        {groupFeeds.map(feed => (
                            editingFeed === feed.id ? (
                                <div key={feed.id} style={{ padding: "6px 12px", margin: "1px 6px" }}>
                                    <Input size="small" placeholder={t("menu.editTitle")} value={editTitle}
                                        style={{ marginBottom: 4 }}
                                        onChange={(_, d) => setEditTitle(d.value)} />
                                    <Input size="small" placeholder={t("menu.group")} value={editGroup}
                                        style={{ marginBottom: 4 }}
                                        onChange={(_, d) => setEditGroup(d.value)} />
                                    <div style={{ display: "flex", gap: 4 }}>
                                        <Button size="small" appearance="primary" icon={<CheckmarkRegular />}
                                            onClick={() => {
                                                updateFeed(feed.id, editTitle || feed.title, editGroup || feed.group_name)
                                                setEditingFeed(null)
                                            }}>{t("common.save")}</Button>
                                        <Button size="small" appearance="subtle"
                                            onClick={() => setEditingFeed(null)}>{t("common.cancel")}</Button>
                                    </div>
                                </div>
                            ) : (
                                <SidebarItem
                                    key={feed.id}
                                    label={feed.title || feed.url}
                                    active={feedId === feed.id}
                                    indent={!!group}
                                    error={feed.error_count > 0 ? feed.error_count : undefined}
                                    badge={feed.unread_count > 0
                                        ? <span style={S.badge}>{feed.unread_count}</span>
                                        : undefined}
                                    onClick={() => selectFeed(feed.id, feed.title || feed.url)}
                                    onContextMenu={(e) => handleCtxMenu(e, feed)}
                                />
                            )
                        ))}
                    </React.Fragment>
                ))}
            </div>

            {ctxMenu && (
                <div style={{ ...S.ctxMenu, left: ctxMenu.x, top: ctxMenu.y }}>
                    <div style={S.ctxItem} onClick={() => {
                        setEditingFeed(ctxMenu.feed.id)
                        setEditTitle(ctxMenu.feed.title)
                        setEditGroup(ctxMenu.feed.group_name)
                        setCtxMenu(null)
                    }}>
                        <EditRegular fontSize={14} /> {t("menu.rename")}
                    </div>
                    <div style={S.ctxItem} onClick={() => {
                        markAllRead(ctxMenu.feed.id)
                        setCtxMenu(null)
                    }}>
                        <CheckmarkRegular fontSize={14} /> {t("menu.markAllRead")}
                    </div>
                    <div style={S.ctxSep} />
                    <div style={{ fontSize: "11px", color: tokens.colorNeutralForeground4, padding: "4px 12px 2px", fontWeight: 600, letterSpacing: "0.3px" }}>{t("menu.moveToGroup")}</div>
                    {(() => {
                        const groups = [...new Set(feeds.map(f => f.group_name).filter(Boolean))].sort()
                        return groups.map(g => (
                            <div key={g} style={S.ctxItem} onClick={() => {
                                updateFeed(ctxMenu.feed.id, ctxMenu.feed.title, g)
                                setCtxMenu(null)
                            }}>
                                {g}
                            </div>
                        ))
                    })()}
                    {ctxMenu.feed.group_name && (
                        <div style={S.ctxItem} onClick={() => {
                            updateFeed(ctxMenu.feed.id, ctxMenu.feed.title, "")
                            setCtxMenu(null)
                        }}>
                            <DismissRegular fontSize={12} style={{ opacity: 0.5 }} /> {t("menu.ungrouped")}
                        </div>
                    )}
                    <div style={S.ctxSep} />
                    <div style={S.ctxItem} onClick={() => {
                        refreshFeed(ctxMenu.feed.id)
                        setCtxMenu(null)
                    }}>
                        <ArrowSyncRegular fontSize={14} /> {t("common.refresh")}
                    </div>
                    <div style={S.ctxSep} />
                    <div style={{ ...S.ctxItem, ...S.ctxItemDanger }} onClick={() => {
                        removeFeed(ctxMenu.feed.id)
                        setCtxMenu(null)
                    }}>
                        <DismissRegular fontSize={14} /> {t("menu.unsubscribe")}
                    </div>
                </div>
            )}
        </div>
    )
}
