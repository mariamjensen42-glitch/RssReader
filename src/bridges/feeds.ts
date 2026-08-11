import { invoke } from "@tauri-apps/api/core"

export interface FeedRow {
    id: number
    title: string
    url: string
    link: string
    description: string
    group_name: string
    icon_url: string
    last_updated: string
    etag: string
    last_modified: string
    error_count: number
    article_count: number
    unread_count: number
}

export interface ArticleRow {
    id: number
    feed_id: number
    title: string
    link: string
    guid: string
    author: string
    summary: string
    content: string
    image_url: string
    pub_date: string
    is_read: number
    is_starred: number
    fetched_at: string
    feed_title: string
}

export interface TagRow {
    id: number
    name: string
    article_count: number
}

export const feedsBridge = {
    // Feed management
    addFeed: (url: string, groupName: string): Promise<FeedRow> => invoke("add_feed", { url, groupName }),
    removeFeed: (id: number): Promise<void> => invoke("remove_feed", { id }),
    updateFeed: (id: number, title: string, groupName: string): Promise<void> => invoke("update_feed", { id, title, groupName }),
    listFeeds: (): Promise<FeedRow[]> => invoke("list_feeds"),
    refreshFeed: (id: number): Promise<string> => invoke("refresh_feed", { id }),
    refreshAll: (): Promise<string> => invoke("refresh_all_feeds"),

    // Articles
    getArticles: (opts?: { feedId?: number; onlyUnread?: boolean; onlyStarred?: boolean; limit?: number; offset?: number }): Promise<ArticleRow[]> =>
        invoke("get_articles", {
            feedId: opts?.feedId ?? null,
            onlyUnread: opts?.onlyUnread ?? false,
            onlyStarred: opts?.onlyStarred ?? false,
            limit: opts?.limit ?? 50,
            offset: opts?.offset ?? 0,
        }),
    getArticle: (id: number): Promise<ArticleRow | null> => invoke("get_article", { id }),
    markRead: (id: number, read: boolean): Promise<void> => invoke("mark_read", { id, read }),
    markAllRead: (feedId?: number): Promise<void> => invoke("mark_all_read", { feedId: feedId ?? null }),
    toggleStar: (id: number): Promise<boolean> => invoke("toggle_star", { id }),
    searchArticles: (query: string, limit?: number): Promise<ArticleRow[]> => invoke("search_articles", { query, limit: limit ?? 50 }),

    // Tags
    addTag: (articleId: number, tagName: string): Promise<TagRow> => invoke("add_tag", { articleId, tagName }),
    removeTag: (articleId: number, tagId: number): Promise<void> => invoke("remove_tag", { articleId, tagId }),
    getArticleTags: (articleId: number): Promise<TagRow[]> => invoke("get_article_tags", { articleId }),
    getArticlesTags: (articleIds: number[]): Promise<Record<number, TagRow[]>> => invoke("get_articles_tags", { articleIds }),
    getAllTags: (): Promise<TagRow[]> => invoke("get_all_tags"),
    getArticlesByTag: (tagId: number, limit?: number, offset?: number): Promise<ArticleRow[]> =>
        invoke("get_articles_by_tag", { tagId, limit: limit ?? 50, offset: offset ?? 0 }),

    // OPML
    importOpml: (content: string): Promise<string> => invoke("import_opml", { content }),
    exportOpml: (): Promise<string> => invoke("export_opml"),

    // Discovery & Export
    discoverFeeds: (websiteUrl: string): Promise<Array<{ url: string; title: string; type: string }>> => invoke("discover_feeds", { websiteUrl }),
    exportArticle: (id: number, format: string): Promise<string> => invoke("export_article", { id, format }),
}

export default feedsBridge
