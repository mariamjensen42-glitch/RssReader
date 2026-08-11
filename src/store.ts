import { create } from "zustand"
import { ViewType } from "./schema-types"
import type { FeedRow, ArticleRow, TagRow } from "./bridges/feeds"
import { feedsBridge } from "./bridges/feeds"

export const enum ContextMenuType { Hidden, Item, Text, View, Group, Image, MarkRead }

export interface AppState {
    // app
    locale: string | null
    menu: boolean
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
    loadArticles: (feedId?: number | null, opts?: { onlyUnread?: boolean; onlyStarred?: boolean }) => Promise<void>
    loadArticle: (id: number) => Promise<void>
    addFeed: (url: string, groupName: string) => Promise<void>
    removeFeed: (id: number) => Promise<void>
    updateFeed: (id: number, title: string, groupName: string) => Promise<void>
    refreshFeed: (id: number) => Promise<void>
    refreshAll: () => Promise<void>
    markRead: (id: number, read: boolean) => Promise<void>
    markAllRead: (feedId?: number) => Promise<void>
    toggleStar: (id: number) => Promise<void>
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
        set({ feedId: null, itemId: null, searchOn: false, title: "All Articles", tagId: null, showTagsPage: false })
        get().loadArticles(null, { onlyUnread: get().onlyUnread })
    },
    selectFeed: (feedId, title) => {
        set({ feedId, itemId: null, searchOn: false, title, tagId: null, showTagsPage: false })
        get().loadArticles(feedId, { onlyUnread: get().onlyUnread })
    },
    selectArticle: (articleId) => set({ itemId: articleId }),
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
        try {
            const articles = await feedsBridge.getArticles({
                feedId: feedId ?? undefined,
                onlyUnread: opts?.onlyUnread,
                onlyStarred: opts?.onlyStarred,
            })
            set({ articles })
            // Batch-load tags
            if (articles.length > 0) {
                const ids = articles.map(a => a.id)
                feedsBridge.getArticlesTags(ids).then(tags => set({ articleTags: tags })).catch(() => {})
            }
        } catch (e) { console.error("loadArticles:", e) }
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
        try {
            await feedsBridge.refreshAll()
            await get().loadFeeds()
            await get().loadArticles(get().feedId, { onlyUnread: get().onlyUnread })
        } catch (e) { console.error("refreshAll:", e) }
    },
    markRead: async (id, read) => {
        try {
            await feedsBridge.markRead(id, read)
            // Update local state
            set(s => ({
                articles: s.articles.map(a => a.id === id ? { ...a, is_read: read ? 1 as const : 0 as const } : a),
                currentArticle: s.currentArticle?.id === id ? { ...s.currentArticle, is_read: read ? 1 as const : 0 as const } : s.currentArticle,
            }))
        } catch (e) { console.error("markRead:", e) }
    },
    markAllRead: async (feedId) => {
        try {
            await feedsBridge.markAllRead(feedId)
            set(s => ({
                articles: s.articles.map(a => ({ ...a, is_read: 1 as const })),
            }))
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
        set({ feedId: null, tagId, searchOn: false, showTagsPage: false, title: tagName ? `#${tagName}` : "All Articles" })
        if (tagId) {
            feedsBridge.getArticlesByTag(tagId, 50, 0).then(articles => set({ articles })).catch(() => {})
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
