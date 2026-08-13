use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let path = get_db_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;

        // WAL allows concurrent readers while the refresh workers write, reducing lock contention.
        // Optional optimization: a failure (e.g. read-only media) must not prevent startup.
        if let Err(e) = conn.pragma_update(None, "journal_mode", "WAL") {
            eprintln!("failed to enable WAL mode: {}", e);
        }

        conn.execute_batch(
            "            CREATE TABLE IF NOT EXISTS feeds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                link TEXT DEFAULT '',
                description TEXT DEFAULT '',
                group_name TEXT DEFAULT '',
                icon_url TEXT DEFAULT '',
                last_updated TEXT DEFAULT '',
                etag TEXT DEFAULT '',
                last_modified TEXT DEFAULT '',
                error_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feed_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                link TEXT NOT NULL,
                guid TEXT DEFAULT '',
                author TEXT DEFAULT '',
                summary TEXT DEFAULT '',
                content TEXT DEFAULT '',
                image_url TEXT DEFAULT '',
                pub_date TEXT DEFAULT '',
                is_read INTEGER DEFAULT 0,
                is_starred INTEGER DEFAULT 0,
                fetched_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
                UNIQUE(feed_id, guid)
            );
            CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
            CREATE INDEX IF NOT EXISTS idx_articles_feed_read ON articles(feed_id, is_read);
            CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date);
            CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(is_read);
            CREATE INDEX IF NOT EXISTS idx_articles_is_starred ON articles(is_starred);
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS article_tags (
                article_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (article_id, tag_id),
                FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );
            PRAGMA foreign_keys = ON;"
        ).map_err(|e| format!("Failed to create tables: {}", e))?;

        // Migrations
        conn.execute("ALTER TABLE articles ADD COLUMN image_url TEXT DEFAULT ''", []).ok();
        conn.execute("ALTER TABLE feeds ADD COLUMN etag TEXT DEFAULT ''", []).ok();
        conn.execute("ALTER TABLE feeds ADD COLUMN last_modified TEXT DEFAULT ''", []).ok();
        conn.execute("CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)", []).ok();
        conn.execute("CREATE TABLE IF NOT EXISTS article_tags (article_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (article_id, tag_id), FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE, FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE)", []).ok();

        Ok(Self { conn: Mutex::new(conn) })
    }

    // Feeds

    pub fn add_feed(&self, title: &str, url: &str, group_name: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO feeds (title, url, group_name) VALUES (?1, ?2, ?3)",
            params![title, url, group_name],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    /// Insert many feeds inside a single transaction, skipping URLs that already exist.
    /// Used by OPML import so hundreds of feeds don't pay one fsync/transaction each.
    pub fn add_feeds_batch(&self, feeds: &[(String, String, String)]) -> Result<usize, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut added = 0usize;
        for (title, url, group) in feeds {
            let exists: i64 = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM feeds WHERE url = ?1)",
                    params![url],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if exists != 0 { continue; }
            tx.execute(
                "INSERT INTO feeds (title, url, group_name) VALUES (?1, ?2, ?3)",
                params![title, url, group],
            ).map_err(|e| e.to_string())?;
            added += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(added)
    }

    pub fn remove_feed(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM articles WHERE feed_id = ?1", params![id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM feeds WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_feed(&self, id: i64, title: &str, group_name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE feeds SET title = ?1, group_name = ?2 WHERE id = ?3",
            params![title, group_name, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_feeds(&self) -> Result<Vec<FeedRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        // One grouped pass over articles instead of 2 subqueries per feed (708 feeds × 2
        // COUNT subqueries took ~42s on a large DB; this is a single indexed scan).
        let mut stats: std::collections::HashMap<i64, (i64, i64)> = std::collections::HashMap::new();
        {
            let mut stmt = conn.prepare(
                "SELECT feed_id, COUNT(*), SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END)
                 FROM articles GROUP BY feed_id"
            ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
            }).map_err(|e| e.to_string())?;
            for r in rows {
                let (fid, count, unread) = r.map_err(|e| e.to_string())?;
                stats.insert(fid, (count, unread));
            }
        }
        let mut stmt = conn.prepare(
            "SELECT f.id, f.title, f.url, f.link, f.description, f.group_name, f.icon_url, f.last_updated, f.etag, f.last_modified, f.error_count
             FROM feeds f ORDER BY f.title"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            let feed_id: i64 = row.get(0)?;
            let (article_count, unread_count) = stats.get(&feed_id).copied().unwrap_or((0, 0));
            Ok(FeedRow {
                id: feed_id,
                title: row.get(1)?,
                url: row.get(2)?,
                link: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                description: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                group_name: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                icon_url: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                last_updated: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                etag: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                last_modified: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                error_count: row.get(10)?,
                article_count,
                unread_count,
            })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_feed_after_refresh(&self, id: i64, title: &str, link: &str, description: &str, icon_url: &str, last_updated: &str, etag: &str, last_modified: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE feeds SET title = ?1, link = ?2, description = ?3, icon_url = ?4, last_updated = ?5, etag = ?6, last_modified = ?7, error_count = 0 WHERE id = ?8",
            params![title, link, description, icon_url, last_updated, etag, last_modified, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn increment_error_count(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE feeds SET error_count = error_count + 1 WHERE id = ?1",
            params![id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_article_content(&self, id: i64, content: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE articles SET content = ?1 WHERE id = ?2",
            params![content, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // Articles

    pub fn delete_article(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM articles WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_read_articles(&self) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        // Starred articles are kept even when read (user explicitly saved them)
        conn.execute("DELETE FROM articles WHERE is_read = 1 AND is_starred = 0", []).map_err(|e| e.to_string())?;
        Ok(conn.changes() as i64)
    }

    pub fn insert_article(&self, article: &NewArticle) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO articles (feed_id, title, link, guid, author, summary, content, image_url, pub_date)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![article.feed_id, article.title, article.link, article.guid,
                    article.author, article.summary, article.content, article.image_url, article.pub_date],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_articles(&self, feed_id: Option<i64>, only_unread: bool, only_starred: bool, limit: i64, offset: i64) -> Result<Vec<ArticleRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut sql = String::from(
            "SELECT a.id, a.feed_id, a.title, a.link, a.guid, a.author, a.summary, a.content,
                    a.image_url, a.pub_date, a.is_read, a.is_starred, a.fetched_at, f.title as feed_title
             FROM articles a JOIN feeds f ON a.feed_id = f.id WHERE 1=1"
        );
        let mut conditions: Vec<String> = vec![];
        if let Some(fid) = feed_id { conditions.push(format!("a.feed_id = {}", fid)); }
        if only_unread { conditions.push("a.is_read = 0".into()); }
        if only_starred { conditions.push("a.is_starred = 1".into()); }
        if !conditions.is_empty() {
            sql.push_str(" AND ");
            sql.push_str(&conditions.join(" AND "));
        }
        sql.push_str(" ORDER BY a.pub_date DESC LIMIT ?1 OFFSET ?2");

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(ArticleRow {
                id: row.get(0)?,
                feed_id: row.get(1)?,
                title: row.get(2)?,
                link: row.get(3)?,
                guid: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                author: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                summary: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                content: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                image_url: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                pub_date: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                is_read: row.get(10)?,
                is_starred: row.get(11)?,
                fetched_at: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
                feed_title: row.get(13)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_article_by_id(&self, id: i64) -> Result<Option<ArticleRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT a.id, a.feed_id, a.title, a.link, a.guid, a.author, a.summary, a.content,
                    a.image_url, a.pub_date, a.is_read, a.is_starred, a.fetched_at, f.title as feed_title
             FROM articles a JOIN feeds f ON a.feed_id = f.id WHERE a.id = ?1"
        ).map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(ArticleRow {
                id: row.get(0)?, feed_id: row.get(1)?, title: row.get(2)?, link: row.get(3)?,
                guid: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                author: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                summary: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                content: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                image_url: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                pub_date: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                is_read: row.get(10)?, is_starred: row.get(11)?,
                fetched_at: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
                feed_title: row.get(13)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.next().transpose().map_err(|e| e.to_string())
    }

    pub fn mark_read(&self, id: i64, read: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE articles SET is_read = ?1 WHERE id = ?2", params![read as i32, id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn mark_all_read(&self, feed_id: Option<i64>) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if let Some(fid) = feed_id {
            conn.execute("UPDATE articles SET is_read = 1 WHERE feed_id = ?1", params![fid])
                .map_err(|e| e.to_string())?;
        } else {
            conn.execute("UPDATE articles SET is_read = 1", []).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn toggle_star(&self, id: i64) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE articles SET is_starred = CASE WHEN is_starred = 0 THEN 1 ELSE 0 END WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        let starred: i32 = conn.query_row("SELECT is_starred FROM articles WHERE id = ?1", params![id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(starred == 1)
    }

    pub fn search_articles(&self, query: &str, limit: i64) -> Result<Vec<ArticleRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT a.id, a.feed_id, a.title, a.link, a.guid, a.author, a.summary, a.content,
                    a.image_url, a.pub_date, a.is_read, a.is_starred, a.fetched_at, f.title as feed_title
             FROM articles a JOIN feeds f ON a.feed_id = f.id
             WHERE a.title LIKE ?1 OR a.summary LIKE ?1 OR a.content LIKE ?1
             ORDER BY a.pub_date DESC LIMIT ?2"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![pattern, limit], |row| {
            Ok(ArticleRow {
                id: row.get(0)?, feed_id: row.get(1)?, title: row.get(2)?, link: row.get(3)?,
                guid: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                author: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                summary: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                content: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                image_url: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                pub_date: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                is_read: row.get(10)?, is_starred: row.get(11)?,
                fetched_at: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
                feed_title: row.get(13)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    // Tags

    pub fn add_tag(&self, article_id: i64, tag_name: &str) -> Result<TagRow, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![tag_name])
            .map_err(|e| e.to_string())?;
        let tag_id: i64 = conn.query_row(
            "SELECT id FROM tags WHERE name = ?1", params![tag_name], |row| row.get(0)
        ).map_err(|e| e.to_string())?;
        conn.execute("INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?1, ?2)", params![article_id, tag_id])
            .map_err(|e| e.to_string())?;
        let article_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM article_tags WHERE tag_id = ?1", params![tag_id], |row| row.get(0)
        ).map_err(|e| e.to_string())?;
        Ok(TagRow { id: tag_id, name: tag_name.to_string(), article_count })
    }

    pub fn remove_tag(&self, article_id: i64, tag_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM article_tags WHERE article_id = ?1 AND tag_id = ?2", params![article_id, tag_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_article_tags(&self, article_id: i64) -> Result<Vec<TagRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, (SELECT COUNT(*) FROM article_tags WHERE tag_id = t.id) as article_count
             FROM tags t JOIN article_tags at ON t.id = at.tag_id
             WHERE at.article_id = ?1 ORDER BY t.name"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![article_id], |row| {
            Ok(TagRow { id: row.get(0)?, name: row.get(1)?, article_count: row.get(2)? })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_articles_tags(&self, article_ids: &[i64]) -> Result<std::collections::HashMap<i64, Vec<TagRow>>, String> {
        if article_ids.is_empty() { return Ok(std::collections::HashMap::new()); }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let placeholders: Vec<String> = article_ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
        let sql = format!(
            "SELECT at.article_id, t.id, t.name, (SELECT COUNT(*) FROM article_tags WHERE tag_id = t.id) as article_count
             FROM tags t JOIN article_tags at ON t.id = at.tag_id
             WHERE at.article_id IN ({}) ORDER BY t.name",
            placeholders.join(",")
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params: Vec<&dyn rusqlite::types::ToSql> = article_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok((row.get::<_, i64>(0)?, TagRow { id: row.get(1)?, name: row.get(2)?, article_count: row.get(3)? }))
        }).map_err(|e| e.to_string())?;

        let mut map: std::collections::HashMap<i64, Vec<TagRow>> = std::collections::HashMap::new();
        for row in rows {
            let (article_id, tag) = row.map_err(|e| e.to_string())?;
            map.entry(article_id).or_default().push(tag);
        }
        Ok(map)
    }

    pub fn get_all_tags(&self) -> Result<Vec<TagRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, COUNT(at.article_id) as article_count
             FROM tags t LEFT JOIN article_tags at ON t.id = at.tag_id
             GROUP BY t.id ORDER BY article_count DESC"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(TagRow { id: row.get(0)?, name: row.get(1)?, article_count: row.get(2)? })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_articles_by_tag(&self, tag_id: i64, limit: i64, offset: i64) -> Result<Vec<ArticleRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT a.id, a.feed_id, a.title, a.link, a.guid, a.author, a.summary, a.content,
                    a.image_url, a.pub_date, a.is_read, a.is_starred, a.fetched_at, f.title as feed_title
             FROM articles a
             JOIN feeds f ON a.feed_id = f.id
             JOIN article_tags at ON a.id = at.article_id
             WHERE at.tag_id = ?1
             ORDER BY a.pub_date DESC LIMIT ?2 OFFSET ?3"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![tag_id, limit, offset], |row| {
            Ok(ArticleRow {
                id: row.get(0)?, feed_id: row.get(1)?, title: row.get(2)?, link: row.get(3)?,
                guid: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                author: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                summary: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                content: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                image_url: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
                pub_date: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                is_read: row.get(10)?, is_starred: row.get(11)?,
                fetched_at: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
                feed_title: row.get(13)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

fn get_db_path() -> PathBuf {
    let dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from(".")).join("rustrssreader");
    dir.join("rss.db")
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FeedRow {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub link: String,
    pub description: String,
    pub group_name: String,
    pub icon_url: String,
    pub last_updated: String,
    pub etag: String,
    pub last_modified: String,
    pub error_count: i32,
    pub article_count: i64,
    pub unread_count: i64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ArticleRow {
    pub id: i64,
    pub feed_id: i64,
    pub title: String,
    pub link: String,
    pub guid: String,
    pub author: String,
    pub summary: String,
    pub content: String,
    pub image_url: String,
    pub pub_date: String,
    pub is_read: i32,
    pub is_starred: i32,
    pub fetched_at: String,
    pub feed_title: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct TagRow {
    pub id: i64,
    pub name: String,
    pub article_count: i64,
}

#[derive(Debug)]
pub struct NewArticle {
    pub feed_id: i64,
    pub title: String,
    pub link: String,
    pub guid: String,
    pub author: String,
    pub summary: String,
    pub content: String,
    pub image_url: String,
    pub pub_date: String,
}
