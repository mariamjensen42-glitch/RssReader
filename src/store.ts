import { create } from "zustand"
import { ViewType } from "./schema-types"
import type { FeedRow, ArticleRow, TagRow } from "./bridges/feeds"
import { feedsBridge } from "./bridges/feeds"

export const enum ContextMenuType { Hidden, Item, Text, View, Group, Image, MarkRead }

export interface AppState {
    // app
    locale: string | null
    menu: boolean
    refreshing: boolean
    title: string
    settingsDisplay: boolean
    contextMenu: { type: ContextMenuType; event?: string; position?: [number, number]; target?: unknown }

    // page
    feedId: number | null  // null = All Articles, number = specific feed
    viewType: ViewType
    itemId: number | null
    onlyUnread: boolean
    searchOn: boolean
    searchText: string
    tagId: number | null  // null = no tag filter
    showTagsPage: boolean
    prevIndex: number  // list index of the currently opened article (survives unread filtering)
    // pagination (infinite scroll)
    loadedCount: number
    hasMoreArticles: boolean
    loadingMore: boolean
    starredView: boolean  // whether the list is the Starred view (needed for append loads)

    // data
    feeds: FeedRow[]
    articles: ArticleRow[]
    currentArticle: ArticleRow | null
    tags: TagRow[]
    currentArticleTags: TagRow[]
    articleTags: Record<number, TagRow[]>

    // actions
    setLocale: (locale: string) => void
    toggleMenu: () => void
    setTitle: (title: string) => void
    toggleSettings: (open?: boolean) => void
    closeContextMenu: () => void
    openViewMenu: () => void
    selectAllArticles: () => void
    selectFeed: (feedId: number, title: string) => void
    selectArticle: (articleId: number) => void
    backToList: () => void
    toggleSearch: () => void
    setSearchText: (text: string) => void
    toggleUnread: () => void

    // data actions
    loadFeeds: () => Promise<void>
    loadArticles: (feedId?: number | null, opts?: { onlyUnread?: boolean; onlyStarred?: boolean; append?: boolean }) => Promise<void>
    loadMoreArticles: () => Promise<void>
    loadArticle: (id: number) => Promise<void>
    addFeed: (url: string, groupName: string) => Promise<void>
    removeFeed: (id: number) => Promise<void>
    updateFeed: (id: number, title: string, groupName: string) => Promise<void>
    refreshFeed: (id: number) => Promise<void>
    refreshAll: () => Promise<void>
    markRead: (id: number, read: boolean) => Promise<void>
    markAllRead: (feedId?: number) => Promise<void>
    toggleStar: (id: number) => Promise<void>
    deleteArticle: (id: number) => Promise<void>
    clearReadArticles: () => Promise<number>
    searchArticles: (query: string) => Promise<void>

    // tag actions
    loadAllTags: () => Promise<void>
    loadArticleTags: (articleId: number) => Promise<void>
    addTag: (articleId: number, tagName: string) => Promise<void>
    removeTag: (articleId: number, tagId: number) => Promise<void>
    selectTag: (tagId: number | null, tagName?: string) => void
    updateArticleTags: (articleId: number, tags: TagRow[]) => void
    openTagsPage: () => void
    closeTagsPage: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
    // app defaults
    locale: null,
    menu: true,
    refreshing: false,
    title: "Rust RSS Reader",
    settingsDisplay: false,
    contextMenu: { type: ContextMenuType.Hidden },

    // page defaults
    feedId: null,
    viewType: ViewType.Magazine,
    itemId: null,
    onlyUnread: false,
    searchOn: false,
    searchText: "",
    tagId: null,
    showTagsPage: false,
    prevIndex: 0,
    loadedCount: 0,
    hasMoreArticles: false,
    loadingMore: false,
    starredView: false,

    // data defaults
    feeds: [],
    articles: [],
    currentArticle: null,
    tags: [],
    currentArticleTags: [],
    articleTags: {},

    // actions
    setLocale: (locale) => set({ locale }),
    toggleMenu: () => {
        const next = !get().menu
        set({ menu: next })
        window.settings.setDefaultMenu(next)
    },
    setTitle: (title) => set({ title }),
    toggleSettings: (open = true) => set({ settingsDisplay: open }),
    closeContextMenu: () => set({
        contextMenu: { type: ContextMenuType.Hidden },
    }),
    openViewMenu: () => {
        const current = get().contextMenu.type
        set({
            contextMenu: {
                type: current === ContextMenuType.View ? ContextMenuType.Hidden : ContextMenuType.View,
                event: "#view-toggle",
            },
        })
    },
    selectAllArticles: () => {
        set({ feedId: null, itemId: null, searchOn: false, title: "All Articles", tagId: null, showTagsPage: false, starredView: false })
        get().loadArticles(null, { onlyUnread: get().onlyUnread })
    },
    selectFeed: (feedId, title) => {
        set({ feedId, itemId: null, searchOn: false, title, tagId: null, showTagsPage: false, starredView: false })
        get().loadArticles(feedId, { onlyUnread: get().onlyUnread })
    },
    selectArticle: (articleId) => {
        const idx = get().articles.findIndex(x => x.id === articleId)
        const a = idx === -1 ? null : get().articles[idx]
        set({ itemId: articleId, currentArticle: a, prevIndex: idx === -1 ? 0 : idx })
        // Auto-mark as read as soon as the article is opened
        if (a && a.is_read !== 1) get().markRead(articleId, true)
    },
    backToList: () => set({ itemId: null }),
    toggleSearch: () => set(s => ({ searchOn: !s.searchOn })),
    setSearchText: (text) => set({ searchText: text }),
    toggleUnread: () => {
        const next = !get().onlyUnread
        set({ onlyUnread: next })
        get().loadArticles(get().feedId, { onlyUnread: next })
    },

    // data actions
    loadFeeds: async () => {
        try {
            const feeds = await feedsBridge.listFeeds()
            set({ feeds })
        } catch (e) { console.error("loadFeeds:", e) }
    },
    loadArticles: async (feedId, opts) => {
        const append = opts?.append ?? false
        const offset = append ? get().loadedCount : 0
        try {
            const articles = await feedsBridge.getArticles({
                feedId: feedId ?? undefined,
                onlyUnread: opts?.onlyUnread,
                onlyStarred: opts?.onlyStarred,
                limit: 50,
                offset,
            })
            set(s => ({
                articles: append ? [...s.articles, ...articles] : articles,
                loadedCount: offset + articles.length,
                hasMoreArticles: articles.length === 50,
                loadingMore: false,
            }))
            // Batch-load tags
            if (articles.length > 0) {
                const ids = articles.map(a => a.id)
                feedsBridge.getArticlesTags(ids).then(tags => set({ articleTags: { ...get().articleTags, ...tags } })).catch(() => {})
            }
        } catch (e) { console.error("loadArticles:", e); set({ loadingMore: false }) }
    },
    loadMoreArticles: async () => {
        const s = get()
        if (!s.hasMoreArticles || s.loadingMore || s.searchOn || s.showTagsPage || s.itemId !== null) return
        set({ loadingMore: true })
        if (s.tagId !== null) {
            try {
                const arts = await feedsBridge.getArticlesByTag(s.tagId, 50, s.loadedCount)
                set(st => ({
                    articles: [...st.articles, ...arts],
                    loadedCount: s.loadedCount + arts.length,
                    hasMoreArticles: arts.length === 50,
                    loadingMore: false,
                }))
            } catch (e) { console.error("loadMore:", e); set({ loadingMore: false }) }
            return
        }
        await s.loadArticles(s.feedId, { onlyUnread: s.onlyUnread, onlyStarred: s.starredView, append: true })
    },
    loadArticle: async (id) => {
        try {
            const article = await feedsBridge.getArticle(id)
            set({ currentArticle: article })
        } catch (e) { console.error("loadArticle:", e) }
    },
    addFeed: async (url, groupName) => {
        try {
            await feedsBridge.addFeed(url, groupName)
            await get().loadFeeds()
        } catch (e) { console.error("addFeed:", e); throw e }
    },
    removeFeed: async (id) => {
        try {
            await feedsBridge.removeFeed(id)
            const s = get()
            await s.loadFeeds()
            if (s.feedId === id) s.selectAllArticles()
        } catch (e) { console.error("removeFeed:", e) }
    },
    updateFeed: async (id, title, groupName) => {
        try {
            await feedsBridge.updateFeed(id, title, groupName)
            await get().loadFeeds()
        } catch (e) { console.error("updateFeed:", e) }
    },
    refreshFeed: async (id) => {
        try {
            await feedsBridge.refreshFeed(id)
            await get().loadFeeds()
            if (get().feedId === id || get().feedId === null) {
                await get().loadArticles(get().feedId, { onlyUnread: get().onlyUnread })
            }
        } catch (e) { console.error("refreshFeed:", e) }
    },
    refreshAll: async () => {
        set({ refreshing: true })
        try {
            await feedsBridge.refreshAll()
            await get().loadFeeds()
            await get().loadArticles(get().feedId, { onlyUnread: get().onlyUnread })
        } catch (e) { console.error("refreshAll:", e) }
        finally { set({ refreshing: false }) }
    },
    markRead: async (id, read) => {
        const apply = (s: AppState) => {
            const current = s.currentArticle?.id === id
                ? { ...s.currentArticle, is_read: read ? 1 as const : 0 as const }
                : s.currentArticle
            if (read && s.onlyUnread) {
                // In the "unread only" view, drop the article as soon as it is read
                return { articles: s.articles.filter(a => a.id !== id), currentArticle: current }
            }
            if (!read && s.onlyUnread && current && current.id === id) {
                // Restore it into the unread list, sorted by date desc
                const articles = [...s.articles.filter(a => a.id !== id), current]
                    .sort((a, b) => (b.pub_date || "").localeCompare(a.pub_date || ""))
                return { articles, currentArticle: current }
            }
            return {
                articles: s.articles.map(a => a.id === id ? { ...a, is_read: read ? 1 as const : 0 as const } : a),
                currentArticle: current,
            }
        }
        // Optimistic update keeps rapid toggles (e.g. double-press "m") consistent
        set(apply)
        try {
            await feedsBridge.markRead(id, read)
            // Keep sidebar unread counts in sync
            await get().loadFeeds()
        } catch (e) { console.error("markRead:", e) }
    },
    markAllRead: async (feedId) => {
        try {
            await feedsBridge.markAllRead(feedId)
            set(s => ({
                articles: s.onlyUnread ? [] : s.articles.map(a => ({ ...a, is_read: 1 as const })),
            }))
            await get().loadFeeds()
        } catch (e) { console.error("markAllRead:", e) }
    },
    toggleStar: async (id) => {
        try {
            const starred = await feedsBridge.toggleStar(id)
            set(s => ({
                articles: s.articles.map(a => a.id === id ? { ...a, is_starred: starred ? 1 as const : 0 as const } : a),
                currentArticle: s.currentArticle?.id === id ? { ...s.currentArticle, is_starred: starred ? 1 as const : 0 as const } : s.currentArticle,
            }))
        } catch (e) { console.error("toggleStar:", e) }
    },
    deleteArticle: async (id) => {
        try {
            await feedsBridge.deleteArticle(id)
            const s = get()
            const { [id]: _removed, ...restTags } = s.articleTags
            set({
                articles: s.articles.filter(a => a.id !== id),
                articleTags: restTags,
            })
            if (s.itemId === id) s.backToList()
            // Keep sidebar unread counts in sync
            await get().loadFeeds()
        } catch (e) { console.error("deleteArticle:", e); throw e }
    },
    clearReadArticles: async () => {
        try {
            const removed = await feedsBridge.clearReadArticles()
            const s = get()
            // Drop deleted items from the current list and reset navigation
            set({
                articles: s.articles.filter(a => a.is_read !== 1),
                itemId: null,
            })
            await get().loadFeeds()
            return removed
        } catch (e) { console.error("clearReadArticles:", e); throw e }
    },
    searchArticles: async (query) => {
        try {
            const articles = await feedsBridge.searchArticles(query)
            set({ articles, searchText: query, searchOn: true })
        } catch (e) { console.error("searchArticles:", e) }
    },

    // tag actions
    loadAllTags: async () => {
        try {
            const tags = await feedsBridge.getAllTags()
            set({ tags })
        } catch (e) { console.error("loadAllTags:", e) }
    },
    loadArticleTags: async (articleId) => {
        try {
            const tags = await feedsBridge.getArticleTags(articleId)
            set({ currentArticleTags: tags })
        } catch (e) { console.error("loadArticleTags:", e) }
    },
    addTag: async (articleId, tagName) => {
        try {
            const tag = await feedsBridge.addTag(articleId, tagName)
            set(s => ({
                currentArticleTags: [...s.currentArticleTags.filter(t => t.id !== tag.id), tag],
                articleTags: {
                    ...s.articleTags,
                    [articleId]: [...(s.articleTags[articleId] ?? []).filter(t => t.id !== tag.id), tag],
                },
            }))
            get().loadAllTags()
        } catch (e) { console.error("addTag:", e) }
    },
    removeTag: async (articleId, tagId) => {
        try {
            await feedsBridge.removeTag(articleId, tagId)
            set(s => ({
                currentArticleTags: s.currentArticleTags.filter(t => t.id !== tagId),
                articleTags: {
                    ...s.articleTags,
                    [articleId]: (s.articleTags[articleId] ?? []).filter(t => t.id !== tagId),
                },
            }))
            get().loadAllTags()
        } catch (e) { console.error("removeTag:", e) }
    },
    selectTag: (tagId, tagName) => {
        set({ feedId: null, tagId, searchOn: false, showTagsPage: false, title: tagName ? `#${tagName}` : "All Articles", starredView: false, loadedCount: 0, hasMoreArticles: false })
        if (tagId) {
            feedsBridge.getArticlesByTag(tagId, 50, 0).then(articles => set({
                articles,
                loadedCount: articles.length,
                hasMoreArticles: articles.length === 50,
            })).catch(() => {})
        } else {
            get().loadArticles(null)
        }
    },
    updateArticleTags: (articleId, tags) => {
        set(s => ({ articleTags: { ...s.articleTags, [articleId]: tags } }))
        get().loadAllTags()
    },
    openTagsPage: () => set({ showTagsPage: true }),
    closeTagsPage: () => set({ showTagsPage: false, tagId: null }),
}))
