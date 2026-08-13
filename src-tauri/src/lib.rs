mod database;
mod settings;
mod ai;

use database::{Database, FeedRow, ArticleRow, NewArticle, TagRow};
use settings::SettingsStore;
use ai::{ArticleInput, ViewpointsResult};
use std::sync::{Arc, Mutex};
use tauri::{Manager, WindowEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_dialog::DialogExt;
use chrono::Utc;
use std::collections::HashMap;

struct AppState {
    settings: Mutex<SettingsStore>,
    db: Arc<Database>,
    rsshub_cache: Mutex<Option<(std::time::Instant, String)>>,
}

// ─── Date normalization ───

fn normalize_date(raw: &str) -> String {
    if raw.is_empty() { return String::new(); }
    // RFC 2822: "Mon, 01 Jan 2024 12:00:00 +0000"
    if let Ok(d) = chrono::DateTime::parse_from_rfc2822(raw) { return d.to_rfc3339(); }
    // RFC 3339 / ISO 8601
    if let Ok(d) = chrono::DateTime::parse_from_rfc3339(raw) { return d.to_rfc3339(); }
    // Fallback: try common formats
    for fmt in &["%Y-%m-%dT%H:%M:%S%.f%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"] {
        if let Ok(d) = chrono::NaiveDateTime::parse_from_str(raw, fmt) {
            return d.and_utc().to_rfc3339();
        }
    }
    raw.to_string()
}

// ─── Image extraction ───

fn extract_image(item: &rss::Item) -> String {
    if let Some(enc) = item.enclosure() {
        let mime = enc.mime_type().to_lowercase();
        let url = enc.url();
        if mime.starts_with("image/") || mime.is_empty()
            || url.ends_with(".jpg") || url.ends_with(".jpeg") || url.ends_with(".png")
            || url.ends_with(".gif") || url.ends_with(".webp") { return url.to_string(); }
    }
    for ns in &["media", "http://search.yahoo.com/mrss/"] {
        if let Some(ext) = item.extensions().get(*ns) {
            for tag in &["content", "thumbnail", "group"] {
                if let Some(entries) = ext.get(*tag) {
                    for entry in entries {
                        if let Some(url) = entry.attrs.get("url") { if !url.is_empty() { return url.clone(); } }
                        if *tag == "group" {
                            for child_tag in &["content", "thumbnail"] {
                                if let Some(kids) = entry.children.get(*child_tag) {
                                    for kid in kids { if let Some(url) = kid.attrs.get("url") { if !url.is_empty() { return url.clone(); } } }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let html = if let Some(c) = item.content() { c.to_string() } else { item.description().unwrap_or("").to_string() };
    if !html.is_empty() { if let Some(url) = first_img_src(&html) { return url; } }
    if let Some(desc) = item.description() { if let Some(url) = first_img_src(desc) { return url; } }
    String::new()
}

fn first_img_src(html: &str) -> Option<String> {
    let doc = scraper::Html::parse_fragment(html);
    let sel = scraper::Selector::parse("img").ok()?;
    for img in doc.select(&sel) {
        if let Some(src) = img.value().attr("src") { if !src.is_empty() { return Some(src.to_string()); } }
    }
    None
}

// ─── Feed icon discovery ───

fn discover_icon(channel: &rss::Channel, feed_url: &str) -> String {
    // 1. Channel image
    if let Some(img) = channel.image() {
        if !img.url().is_empty() { return img.url().to_string(); }
    }
    // 2. itunes:image
    if let Some(ext) = channel.extensions().get("itunes") {
        if let Some(entries) = ext.get("image") {
            for e in entries { if let Some(href) = e.attrs.get("href") { return href.clone(); } }
        }
    }
    // 3. Favicon from feed domain
    if let Ok(parsed) = url::Url::parse(feed_url) {
        if let Some(host) = parsed.host_str() {
            let scheme = parsed.scheme();
            return format!("{}://{}/favicon.ico", scheme, host);
        }
    }
    String::new()
}

// ─── HTTP conditional fetch ───

fn fetch_feed(url: &str, etag: &str, last_modified: &str, proxy: Option<&str>) -> Result<(reqwest::blocking::Response, String, String), String> {
    let mut req = build_client(proxy, 15)?.get(url);

    if !etag.is_empty() { req = req.header("If-None-Match", etag); }
    if !last_modified.is_empty() { req = req.header("If-Modified-Since", last_modified); }

    let resp = req.send().map_err(|e| format!("HTTP error: {}", e))?;
    let new_etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let new_lm = resp.headers().get("last-modified").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();

    if resp.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Err("304 Not Modified".into());
    }

    Ok((resp, new_etag, new_lm))
}

// ─── HTTP client & proxy ───

fn build_client(proxy: Option<&str>, timeout_secs: u64) -> Result<reqwest::blocking::Client, String> {
    let mut builder = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .user_agent("RustRSSReader/0.1");
    if let Some(p) = proxy.filter(|p| !p.is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(p).map_err(|e| format!("Invalid proxy URL: {}", e))?);
    }
    builder.build().map_err(|e| e.to_string())
}

fn get_proxy(state: &AppState) -> Option<String> {
    let s = state.settings.lock().unwrap();
    if s.get_proxy_enabled() {
        let addr = s.get_proxy_address();
        if !addr.is_empty() { return Some(addr); }
    }
    None
}

// ─── Feed commands ───

#[tauri::command]
fn add_feed(state: tauri::State<AppState>, url: String, group_name: String) -> Result<FeedRow, String> {
    let title = url.clone();
    let id = state.db.add_feed(&title, &url, &group_name)?;
    let feeds = state.db.get_feeds()?;
    feeds.into_iter().find(|f| f.id == id).ok_or("Feed not found after insert".into())
}

#[tauri::command]
fn remove_feed(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    state.db.remove_feed(id)
}

#[tauri::command]
fn update_feed(state: tauri::State<AppState>, id: i64, title: String, group_name: String) -> Result<(), String> {
    state.db.update_feed(id, &title, &group_name)
}

#[tauri::command]
fn list_feeds(state: tauri::State<AppState>) -> Result<Vec<FeedRow>, String> {
    state.db.get_feeds()
}

#[tauri::command]
fn refresh_feed(state: tauri::State<AppState>, id: i64) -> Result<String, String> {
    let proxy = get_proxy(&state);
    let feeds = state.db.get_feeds()?;
    let feed = feeds.into_iter().find(|f| f.id == id).ok_or("Feed not found".to_string())?;
    refresh_feed_internal(&state.db, id, &feed.url, &feed.etag, &feed.last_modified, proxy.as_deref())
        .map(|(msg, _)| msg)
}

#[tauri::command]
async fn refresh_all_feeds(state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<String, String> {
    let proxy = get_proxy(&state);
    let feeds = state.db.get_feeds()?;
    let db = state.db.clone();
    // Limit concurrent HTTP fetches so hundreds of feeds refresh in parallel
    // without exhausting sockets or getting rate-limited.
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(8));

    let mut tasks = Vec::new();
    for feed in feeds {
        // Acquire on the async side; the permit is moved into the task and released when it finishes.
        let permit = sem.clone().acquire_owned().await.map_err(|e| format!("Semaphore error: {}", e))?;
        let db = db.clone();
        let proxy = proxy.clone();
        let url = feed.url.clone();
        let etag = feed.etag.clone();
        let lm = feed.last_modified.clone();
        let title = feed.title.clone();
        let id = feed.id;
        tasks.push(tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let result = refresh_feed_internal(&db, id, &url, &etag, &lm, proxy.as_deref());
            (title, result)
        }));
    }

    let mut results = vec![];
    let mut new_total = 0i64;
    let mut ok_count = 0usize;
    let mut err_count = 0usize;
    for task in tasks {
        let (title, r) = task.await.map_err(|e| format!("Refresh task failed: {}", e))?;
        match r {
            Ok((msg, new_count)) => { results.push(format!("{}: {}", title, msg)); new_total += new_count; ok_count += 1; }
            Err(e) if e == "304 Not Modified" => results.push(format!("{}: unchanged", title)),
            Err(e) => { results.push(format!("{}: Error - {}", title, e)); err_count += 1; }
        }
    }

    // Desktop notification when the batch finishes (toggleable in Settings)
    let notify_on_refresh = { let s = state.settings.lock().unwrap(); s.get_notify_on_refresh() };
    if notify_on_refresh && (ok_count > 0 || err_count > 0) {
        let is_zh = { let s = state.settings.lock().unwrap(); s.get_locale().to_lowercase().starts_with("zh") };
        let (title, body) = if is_zh {
            let b = format!("成功 {} 个订阅源，新增 {} 篇文章", ok_count, new_total);
            let b = if err_count > 0 { format!("{}，失败 {} 个", b, err_count) } else { b };
            ("订阅刷新完成".to_string(), b)
        } else {
            let b = format!("{} feeds refreshed, {} new articles", ok_count, new_total);
            let b = if err_count > 0 { format!("{}, {} failed", b, err_count) } else { b };
            ("Refresh finished".to_string(), b)
        };
        let _ = app.notification().builder().title(title).body(body).show();
    }

    Ok(results.join("\n"))
}

fn refresh_feed_internal(db: &Database, id: i64, url: &str, etag: &str, last_modified: &str, proxy: Option<&str>) -> Result<(String, i64), String> {
    let (resp, new_etag, new_lm) = match fetch_feed(url, etag, last_modified, proxy) {
        Ok(v) => v,
        Err(e) => {
            // "unchanged" (304) is not an error; anything else counts as a failure
            if e != "304 Not Modified" { db.increment_error_count(id)?; }
            return Err(e);
        }
    };

    // Read content-type before consuming body
    let content_type = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();

    let body_bytes = resp.bytes().map_err(|e| e.to_string())?;
    let body_str = if !content_type.is_empty() {
        if let Some(charset) = content_type.split(';').find_map(|p| {
            let p = p.trim().to_lowercase();
            p.strip_prefix("charset=").map(|s| s.trim().trim_matches('"').to_string())
        }) {
            if let Some(enc) = encoding_rs::Encoding::for_label(charset.as_bytes()) {
                enc.decode(&body_bytes).0.into_owned()
            } else { String::from_utf8_lossy(&body_bytes).to_string() }
        } else { String::from_utf8_lossy(&body_bytes).to_string() }
    } else { String::from_utf8_lossy(&body_bytes).to_string() };

    let channel = match rss::Channel::read_from(body_str.as_bytes()) {
        Ok(c) => c,
        Err(e) => {
            db.increment_error_count(id)?;
            return Err(format!("RSS parse error: {}", e));
        }
    };

    let feed_title = channel.title().to_string();
    let feed_link = channel.link().to_string();
    let feed_desc = channel.description().to_string();
    let icon_url = discover_icon(&channel, url);
    let now = Utc::now().to_rfc3339();
    db.update_feed_after_refresh(id, &feed_title, &feed_link, &feed_desc, &icon_url, &now, &new_etag, &new_lm)?;

    let mut count = 0i64;
    for item in channel.items().iter().rev() {
        let title = item.title().unwrap_or("Untitled").to_string();
        let link = item.link().unwrap_or("").to_string();
        let guid = item.guid().map(|g| g.value().to_string()).unwrap_or_else(|| link.clone());
        let author = item.author().unwrap_or("").to_string();
        let pub_date = normalize_date(item.pub_date().unwrap_or(""));
        let summary = item.description().unwrap_or("").to_string();
        let content = item.content().unwrap_or(&summary).to_string();
        let image_url = extract_image(item);

        let article = NewArticle { feed_id: id, title, link, guid, author, summary, content, image_url, pub_date };
        let inserted = db.insert_article(&article)?;
        if inserted > 0 { count += 1; }
    }
    Ok((format!("{} articles ({} new)", channel.items().len(), count), count))
}

// ─── RSS Auto-Discovery ───

#[tauri::command]
fn discover_feeds(state: tauri::State<AppState>, website_url: String) -> Result<Vec<HashMap<String, String>>, String> {
    let proxy = get_proxy(&state);
    let client = build_client(proxy.as_deref(), 10)?;

    let resp = client.get(&website_url).send().map_err(|e| format!("HTTP error: {}", e))?;
    let body = resp.text().map_err(|e| e.to_string())?;

    let doc = scraper::Html::parse_document(&body);
    let sel = scraper::Selector::parse("link[type=\"application/rss+xml\"], link[type=\"application/atom+xml\"]").map_err(|e| e.to_string())?;

    let mut found = Vec::new();
    for el in doc.select(&sel) {
        let href = el.value().attr("href").unwrap_or("");
        let title = el.value().attr("title").unwrap_or(href);
        let r#type = el.value().attr("type").unwrap_or("application/rss+xml");

        // Resolve relative URLs
        let full_url = if href.starts_with("http") {
            href.to_string()
        } else if let Ok(base) = url::Url::parse(&website_url) {
            base.join(href).map(|u| u.to_string()).unwrap_or_else(|_| href.to_string())
        } else {
            href.to_string()
        };

        found.push(HashMap::from([
            ("url".into(), full_url),
            ("title".into(), title.to_string()),
            ("type".into(), r#type.to_string()),
        ]));
    }

    // Also check common paths
    if found.is_empty() {
        for path in &["/rss", "/feed", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"] {
            let test_url = if let Ok(base) = url::Url::parse(&website_url) {
                base.join(path).map(|u| u.to_string()).unwrap_or_default()
            } else { format!("{}{}", website_url.trim_end_matches('/'), path) };
            if test_url.is_empty() { continue; }
            match client.head(&test_url).send() {
                Ok(r) if r.status().is_success() => {
                    found.push(HashMap::from([
                        ("url".into(), test_url),
                        ("title".into(), format!("{} (auto-detected)", path)),
                        ("type".into(), "application/rss+xml".into()),
                    ]));
                }
                _ => {}
            }
        }
    }

    if found.is_empty() {
        return Err("No RSS feeds found on this page".into());
    }
    Ok(found)
}

// ─── Full-text extraction (Readability + fallback) ───

/// Naive removal of `<tag ...>...</tag>` blocks (script/style/noscript/iframe).
fn strip_blocks(mut html: String) -> String {
    for tag in ["script", "style", "noscript", "iframe"] {
        let open = format!("<{}", tag);
        let end_tag = format!("</{}>", tag);
        loop {
            let Some(start) = html.find(&open) else { break };
            let Some(open_end) = html[start..].find('>') else { break };
            let content_start = start + open_end + 1;
            let Some(rel_end) = html[content_start..].find(&end_tag) else { break };
            let end = content_start + rel_end + end_tag.len();
            html.replace_range(start..end, "");
        }
    }
    html
}

/// Primary path: Mozilla Readability algorithm (readable-readability).
/// Strips navigation, sidebars, ads and other boilerplate, keeping the main article.
fn extract_readable(html: &str, url: &str) -> Result<String, String> {
    let base = url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    let mut readability = readable_readability::Readability::new();
    readability.base_url(base);
    let (tree, _meta) = readability.parse(html);
    let content = tree.to_string();
    if content.trim().is_empty() {
        return Err("Readability returned empty content".into());
    }
    Ok(content)
}

/// Fallback: pick `<article>/<main>` or the element containing the most text.
fn extract_fallback(html: &str) -> Result<String, String> {
    let doc = scraper::Html::parse_document(html);
    let article_sel = scraper::Selector::parse("article, main").map_err(|e| e.to_string())?;
    let mut body = doc.select(&article_sel).next().map(|el| el.inner_html());

    if body.as_deref().map_or(true, |h| h.trim().is_empty()) {
        let container_sel = scraper::Selector::parse("div, section").map_err(|e| e.to_string())?;
        let mut best: Option<(String, usize)> = None;
        for el in doc.select(&container_sel) {
            let text_len = el.text().collect::<String>().chars().count();
            if text_len >= 300 && best.as_ref().map_or(true, |(_, n)| text_len > *n) {
                best = Some((el.inner_html(), text_len));
            }
        }
        body = best.map(|(h, _)| h);
    }

    let full = strip_blocks(body.unwrap_or_default()).trim().to_string();
    if full.is_empty() {
        return Err("Could not extract readable content from the page".into());
    }
    Ok(full)
}

#[tauri::command]
fn fetch_full_text(state: tauri::State<AppState>, article_id: i64, url: String) -> Result<String, String> {
    let proxy = get_proxy(&state);
    let client = build_client(proxy.as_deref(), 20)?;
    let resp = client.get(&url).send().map_err(|e| format!("HTTP error: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} while fetching the article page", resp.status()));
    }
    // Use the final URL (after redirects) so relative image/link URLs resolve correctly
    let final_url = resp.url().clone();
    let html = resp.text().map_err(|e| e.to_string())?;

    // Readability first (removes ads/nav/boilerplate); fall back to the old heuristic.
    // Log the underlying errors so extraction failures are diagnosable.
    let cleaned = match extract_readable(&html, final_url.as_str()) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("readability extraction failed for {}: {}", url, e);
            match extract_fallback(&html) {
                Ok(c) => c,
                Err(e2) => {
                    eprintln!("fallback extraction failed for {}: {}", url, e2);
                    String::new()
                }
            }
        }
    };
    let full = strip_blocks(cleaned).trim().to_string();
    if full.is_empty() {
        return Err("Could not extract readable content from the page".into());
    }

    // Persist so the full text shows next time the article is opened
    state.db.update_article_content(article_id, &full)?;
    Ok(full)
}

// ─── RSSHub routes ───

#[tauri::command]
fn fetch_rsshub_routes(state: tauri::State<AppState>, instance: String) -> Result<String, String> {
    let base = instance.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("RSSHub instance URL is required".into());
    }

    // 5-minute in-memory cache
    {
        let cache = state.rsshub_cache.lock().unwrap();
        if let Some((t, data)) = &*cache {
            if t.elapsed() < std::time::Duration::from_secs(300) && !data.is_empty() {
                return Ok(data.clone());
            }
        }
    }

    let proxy = get_proxy(&state);
    let client = build_client(proxy.as_deref(), 20)?;

    // Prefer the modern /routes endpoint, fall back to /api/routes
    let mut resp = client.get(format!("{}/routes", base)).send().map_err(|e| format!("HTTP error: {}", e))?;
    if !resp.status().is_success() {
        resp = client.get(format!("{}/api/routes", base)).send().map_err(|e| format!("HTTP error: {}", e))?;
    }
    if !resp.status().is_success() {
        return Err(format!("RSSHub instance responded with HTTP {}", resp.status()));
    }
    let text = resp.text().map_err(|e| e.to_string())?;

    *state.rsshub_cache.lock().unwrap() = Some((std::time::Instant::now(), text.clone()));
    Ok(text)
}

// ─── Article Export ───

fn render_article_export(article: &ArticleRow, format: &str) -> Result<String, String> {
    match format {
        "md" => Ok(format!(
            "# {}\n\n**Source:** {}  \n**Author:** {}  \n**Date:** {}  \n**Link:** {}\n\n---\n\n{}\n",
            article.title, article.feed_title, article.author, article.pub_date, article.link,
            article.content
        )),
        "html" => Ok(format!(
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>{}</title></head><body><h1>{}</h1><p><strong>Source:</strong> {} | <strong>Date:</strong> {} | <a href=\"{}\">Original</a></p><hr>{}</body></html>",
            article.title, article.title, article.feed_title, article.pub_date, article.link, article.content
        )),
        _ => Err("Unsupported format. Use 'md' or 'html'".into()),
    }
}

#[tauri::command]
fn export_article(state: tauri::State<AppState>, id: i64, format: String) -> Result<String, String> {
    let article = state.db.get_article_by_id(id)?.ok_or("Article not found")?;
    render_article_export(&article, &format)
}

/// Opens a native save dialog (path chosen by the user) and writes the exported
/// article there. The path never comes from the frontend, so it cannot be abused
/// to write to arbitrary locations.
#[tauri::command]
async fn export_article_dialog(app: tauri::AppHandle, state: tauri::State<'_, AppState>, id: i64, format: String) -> Result<String, String> {
    let article = state.db.get_article_by_id(id)?.ok_or("Article not found")?;
    let content = render_article_export(&article, &format)?;
    let ext = if format == "md" { "md" } else { "html" };
    let suggested = format!("{}.{}",
        article.title.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').take(50).collect::<String>(),
        ext);

    let (tx, rx) = tokio::sync::oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();
    app.dialog().file()
        .set_file_name(&suggested)
        .add_filter(if ext == "md" { "Markdown" } else { "HTML" }, &[ext])
        .save_file(move |path| { let _ = tx.send(path); });

    let chosen = rx.await.map_err(|_| "Save dialog closed unexpectedly".to_string())?;
    let Some(path) = chosen else { return Ok(String::new()) };  // user cancelled
    let path = path.into_path().map_err(|e| format!("Invalid save path: {}", e))?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

// ─── OPML Import/Export ───

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
     .replace('\'', "&apos;")
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct OpmlOutline {
    #[serde(rename = "@text")]
    text: Option<String>,
    #[serde(rename = "@title")]
    title: Option<String>,
    #[serde(rename = "@xmlUrl")]
    xml_url: Option<String>,
    #[serde(rename = "@htmlUrl")]
    html_url: Option<String>,
    #[serde(rename = "outline", default)]
    outlines: Vec<OpmlOutline>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct OpmlBody {
    #[serde(rename = "outline", default)]
    outlines: Vec<OpmlOutline>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct Opml {
    #[serde(rename = "body")]
    body: OpmlBody,
}

fn flatten_outlines(outlines: &[OpmlOutline], group: &str) -> Vec<(String, String, String)> {
    let mut feeds = vec![];
    for o in outlines {
        if let Some(ref url) = o.xml_url {
            let name = o.title.as_ref().or(o.text.as_ref()).cloned().unwrap_or_else(|| url.clone());
            feeds.push((name, url.clone(), group.to_string()));
        }
        if !o.outlines.is_empty() {
            let subgroup = o.title.as_ref().or(o.text.as_ref()).map(|s| s.as_str()).unwrap_or(group);
            feeds.extend(flatten_outlines(&o.outlines, subgroup));
        }
    }
    feeds
}

#[tauri::command]
fn import_opml(state: tauri::State<AppState>, content: String) -> Result<(i64, i64), String> {
    let opml: Opml = quick_xml::de::from_str(&content).map_err(|e| format!("OPML parse error: {}", e))?;
    let feeds = flatten_outlines(&opml.body.outlines, "");
    // Batch insert in one transaction (fast for hundreds of feeds) and skip duplicates by URL
    let added = state.db.add_feeds_batch(&feeds)?;
    let skipped = feeds.len() as i64 - added as i64;
    Ok((added as i64, skipped))
}

#[tauri::command]
fn export_opml(state: tauri::State<AppState>) -> Result<String, String> {
    let feeds = state.db.get_feeds()?;
    let mut xml = String::from(r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head><title>Rust RSS Reader Feeds</title></head>
  <body>
"#);

    let mut groups: std::collections::HashMap<String, Vec<&FeedRow>> = std::collections::HashMap::new();
    for f in &feeds {
        let key = if f.group_name.is_empty() { "Ungrouped".to_string() } else { f.group_name.clone() };
        groups.entry(key).or_default().push(f);
    }

    for (group, group_feeds) in &groups {
        if *group != "Ungrouped" { xml.push_str(&format!("    <outline text=\"{}\">\n", xml_escape(group))); }
        let indent = if *group == "Ungrouped" { "    " } else { "      " };
        for f in group_feeds {
            xml.push_str(&format!("{}<outline type=\"rss\" text=\"{}\" xmlUrl=\"{}\" htmlUrl=\"{}\"/>\n",
                indent, xml_escape(&f.title), xml_escape(&f.url), xml_escape(&f.link)));
        }
        if *group != "Ungrouped" { xml.push_str("    </outline>\n"); }
    }

    xml.push_str("  </body>\n</opml>");
    Ok(xml)
}

// ─── Article commands ───

#[tauri::command]
fn get_articles(
    state: tauri::State<AppState>, feed_id: Option<i64>, only_unread: Option<bool>,
    only_starred: Option<bool>, limit: Option<i64>, offset: Option<i64>,
) -> Result<Vec<ArticleRow>, String> {
    state.db.get_articles(feed_id, only_unread.unwrap_or(false), only_starred.unwrap_or(false), limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
fn get_article(state: tauri::State<AppState>, id: i64) -> Result<Option<ArticleRow>, String> {
    state.db.get_article_by_id(id)
}

#[tauri::command]
fn mark_read(state: tauri::State<AppState>, id: i64, read: bool) -> Result<(), String> { state.db.mark_read(id, read) }
#[tauri::command]
fn mark_all_read(state: tauri::State<AppState>, feed_id: Option<i64>) -> Result<(), String> { state.db.mark_all_read(feed_id) }
#[tauri::command]
fn toggle_star(state: tauri::State<AppState>, id: i64) -> Result<bool, String> { state.db.toggle_star(id) }
#[tauri::command]
fn delete_article(state: tauri::State<AppState>, id: i64) -> Result<(), String> { state.db.delete_article(id) }
#[tauri::command]
fn clear_read_articles(state: tauri::State<AppState>) -> Result<i64, String> { state.db.delete_read_articles() }
#[tauri::command]
fn search_articles(state: tauri::State<AppState>, query: String, limit: Option<i64>) -> Result<Vec<ArticleRow>, String> {
    state.db.search_articles(&query, limit.unwrap_or(50))
}

// ─── Tag commands ───

#[tauri::command]
fn add_tag(state: tauri::State<AppState>, article_id: i64, tag_name: String) -> Result<TagRow, String> {
    state.db.add_tag(article_id, &tag_name)
}

#[tauri::command]
fn remove_tag(state: tauri::State<AppState>, article_id: i64, tag_id: i64) -> Result<(), String> {
    state.db.remove_tag(article_id, tag_id)
}

#[tauri::command]
fn get_article_tags(state: tauri::State<AppState>, article_id: i64) -> Result<Vec<TagRow>, String> {
    state.db.get_article_tags(article_id)
}

#[tauri::command]
fn get_articles_tags(state: tauri::State<AppState>, article_ids: Vec<i64>) -> Result<std::collections::HashMap<i64, Vec<TagRow>>, String> {
    state.db.get_articles_tags(&article_ids)
}

#[tauri::command]
fn get_all_tags(state: tauri::State<AppState>) -> Result<Vec<TagRow>, String> {
    state.db.get_all_tags()
}

#[tauri::command]
fn get_articles_by_tag(state: tauri::State<AppState>, tag_id: i64, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<ArticleRow>, String> {
    state.db.get_articles_by_tag(tag_id, limit.unwrap_or(50), offset.unwrap_or(0))
}

// ─── System ───

#[tauri::command] fn greet(name: &str) -> String { format!("Hello, {}!", name) }
#[tauri::command] fn should_use_dark_colors(window: tauri::Window) -> bool { matches!(window.theme(), Ok(tauri::Theme::Dark)) }
#[tauri::command] fn get_platform() -> String { std::env::consts::OS.to_string() }
#[tauri::command] fn get_version() -> String { env!("CARGO_PKG_VERSION").to_string() }

// ─── Settings (delegated) ───

macro_rules! s_get {
    ($name:ident, $ty:ty, $m:ident) => { #[tauri::command] fn $name(s: tauri::State<AppState>) -> $ty { s.settings.lock().unwrap().$m() } };
}
macro_rules! s_set {
    ($name:ident, $ty:ty, $m:ident, $v:ident) => { #[tauri::command] fn $name(s: tauri::State<AppState>, $v: $ty) { s.settings.lock().unwrap().$m($v); } };
}

s_get!(get_theme, String, get_theme); s_set!(set_theme, String, set_theme, v);
s_get!(get_menu, bool, get_menu); s_set!(set_menu, bool, set_menu, v);
s_get!(get_view, u8, get_view); s_set!(set_view, u8, set_view, v);
s_get!(get_locale, String, get_locale); s_set!(set_locale, String, set_locale, v);
s_get!(get_font_size, u32, get_font_size); s_set!(set_font_size, u32, set_font_size, v);
s_get!(get_font_family, String, get_font_family); s_set!(set_font_family, String, set_font_family, v);
s_get!(get_fetch_interval, u32, get_fetch_interval); s_set!(set_fetch_interval, u32, set_fetch_interval, v);
s_get!(get_search_engine, u8, get_search_engine); s_set!(set_search_engine, u8, set_search_engine, v);
s_get!(get_proxy_enabled, bool, get_proxy_enabled); s_set!(set_proxy_enabled, bool, set_proxy_enabled, v);
s_get!(get_proxy_address, String, get_proxy_address); s_set!(set_proxy_address, String, set_proxy_address, v);
s_get!(get_notify_on_refresh, bool, get_notify_on_refresh); s_set!(set_notify_on_refresh, bool, set_notify_on_refresh, v);
s_get!(get_minimize_to_tray, bool, get_minimize_to_tray); s_set!(set_minimize_to_tray, bool, set_minimize_to_tray, v);
s_get!(get_filter_type, u32, get_filter_type); s_set!(set_filter_type, u32, set_filter_type, v);
s_get!(get_list_view_configs, u8, get_list_view_configs); s_set!(set_list_view_configs, u8, set_list_view_configs, v);
s_get!(get_nedb_status, bool, get_nedb_status); s_set!(set_nedb_status, bool, set_nedb_status, v);
s_get!(get_unread_sources_only, bool, get_unread_sources_only); s_set!(set_unread_sources_only, bool, set_unread_sources_only, v);
s_get!(get_source_groups, serde_json::Value, get_source_groups); s_set!(set_source_groups, serde_json::Value, set_source_groups, v);
s_get!(get_service_configs, serde_json::Value, get_service_configs); s_set!(set_service_configs, serde_json::Value, set_service_configs, v);
s_get!(get_deepseek_api_key, String, get_deepseek_api_key); s_set!(set_deepseek_api_key, String, set_deepseek_api_key, v);
s_get!(get_deepseek_model, String, get_deepseek_model); s_set!(set_deepseek_model, String, set_deepseek_model, v);

#[tauri::command] fn export_all_settings(s: tauri::State<AppState>) -> String { s.settings.lock().unwrap().export_all() }
#[tauri::command] fn import_all_settings(s: tauri::State<AppState>, json: String) -> Result<(), String> { s.settings.lock().unwrap().import_all(&json) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            app.manage(AppState { settings: Mutex::new(SettingsStore::new()), db: Arc::new(Database::new().map_err(std::io::Error::other)?), rsshub_cache: Mutex::new(None) });

            // System tray: toggle window on click, Quit from the menu
            let show_item = MenuItemBuilder::with_id("show", "Show/Hide").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Rust RSS Reader")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) { let _ = w.hide(); }
                            else { let _ = w.show(); let _ = w.set_focus(); }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) { let _ = w.hide(); }
                            else { let _ = w.show(); let _ = w.set_focus(); }
                        }
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            // Tray may be unavailable (e.g. Linux without a StatusNotifier host);
            // the app must still start, so a failure here is only logged.
            if let Err(e) = tray.build(app) {
                eprintln!("System tray unavailable: {}", e);
            }

            // Show main window after WebView has time to load its content
            let main = app.get_webview_window("main").unwrap();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(300));
                let _ = main.show();
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Close button → hide to tray instead of quitting (toggleable in Settings).
            // Only hides when a tray icon is actually present, otherwise the window
            // would become unrecoverable.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let state = window.state::<AppState>();
                    let minimize = state.settings.lock().map(|s| s.get_minimize_to_tray()).unwrap_or(false);
                    let tray_ok = window.app_handle().tray_by_id("main-tray").is_some();
                    if minimize && tray_ok {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet, should_use_dark_colors, get_platform, get_version,
            add_feed, remove_feed, update_feed, list_feeds, refresh_feed, refresh_all_feeds,
            discover_feeds, import_opml, export_opml, export_article, export_article_dialog, fetch_full_text, fetch_rsshub_routes,
            get_articles, get_article, mark_read, mark_all_read, toggle_star, delete_article, clear_read_articles, search_articles,
            add_tag, remove_tag, get_article_tags, get_articles_tags, get_all_tags, get_articles_by_tag,
            get_theme, set_theme, get_menu, set_menu, get_view, set_view, get_locale, set_locale,
            get_font_size, set_font_size, get_font_family, set_font_family,
            get_fetch_interval, set_fetch_interval, get_search_engine, set_search_engine,
            get_proxy_enabled, set_proxy_enabled, get_proxy_address, set_proxy_address,
            get_notify_on_refresh, set_notify_on_refresh,
            get_minimize_to_tray, set_minimize_to_tray,
            get_filter_type, set_filter_type, get_list_view_configs, set_list_view_configs,
            get_nedb_status, set_nedb_status, get_unread_sources_only, set_unread_sources_only,
            get_source_groups, set_source_groups, get_service_configs, set_service_configs,
            export_all_settings, import_all_settings,
            summarize_article, tag_article, translate_article, extract_viewpoints,
            get_deepseek_api_key, set_deepseek_api_key, get_deepseek_model, set_deepseek_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── AI Article Processing ───

fn get_ai_config(state: &Mutex<SettingsStore>) -> Result<(String, String), String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let api_key = s.get_deepseek_api_key();
    let api_key = if api_key.is_empty() {
        std::env::var("DEEPSEEK_API_KEY").map_err(|_| "DeepSeek API key not configured. Set it in Settings or DEEPSEEK_API_KEY env var.".to_string())?
    } else {
        api_key
    };
    let model = s.get_deepseek_model();
    Ok((api_key, model))
}

#[tauri::command]
async fn summarize_article(
    state: tauri::State<'_, AppState>,
    article_id: i64,
    model_override: Option<String>,
) -> Result<String, String> {
    let (api_key, default_model) = get_ai_config(&state.settings)?;
    let model = model_override.unwrap_or(default_model);

    let article = state.db.get_article_by_id(article_id)?.ok_or("Article not found")?;
    let input = ArticleInput {
        title: article.title,
        content: if article.content.is_empty() { article.summary } else { article.content },
    };

    ai::summarize(&api_key, &model, &input).await
}

#[tauri::command]
async fn tag_article(
    state: tauri::State<'_, AppState>,
    article_id: i64,
    model_override: Option<String>,
) -> Result<Vec<TagRow>, String> {
    let (api_key, default_model) = get_ai_config(&state.settings)?;
    let model = model_override.unwrap_or(default_model);

    let article = state.db.get_article_by_id(article_id)?.ok_or("Article not found")?;
    let input = ArticleInput {
        title: article.title,
        content: if article.content.is_empty() { article.summary } else { article.content },
    };

    // Fetch ALL existing tags for global deduplication (top 30 by usage)
    let all_tags: Vec<String> = state.db.get_all_tags()
        .unwrap_or_default()
        .into_iter()
        .take(30)
        .map(|t| t.name)
        .collect();

    let tags = ai::tag(&api_key, &model, &input, &all_tags).await?;

    // Auto-save tags and return TagRow objects
    let mut tag_rows = Vec::new();
    for tag_name in &tags {
        if let Ok(row) = state.db.add_tag(article_id, tag_name) { tag_rows.push(row); }
        // skip duplicates silently
    }

    Ok(tag_rows)
}

#[tauri::command]
async fn translate_article(
    state: tauri::State<'_, AppState>,
    article_id: i64,
    target_lang: String,
    model_override: Option<String>,
) -> Result<String, String> {
    let (api_key, default_model) = get_ai_config(&state.settings)?;
    let model = model_override.unwrap_or(default_model);

    let article = state.db.get_article_by_id(article_id)?.ok_or("Article not found")?;
    let input = ArticleInput {
        title: article.title,
        content: if article.content.is_empty() { article.summary } else { article.content },
    };

    ai::translate(&api_key, &model, &input, &target_lang).await
}

#[tauri::command]
async fn extract_viewpoints(
    state: tauri::State<'_, AppState>,
    article_id: i64,
    model_override: Option<String>,
) -> Result<ViewpointsResult, String> {
    let (api_key, default_model) = get_ai_config(&state.settings)?;
    let model = model_override.unwrap_or(default_model);

    let article = state.db.get_article_by_id(article_id)?.ok_or("Article not found")?;
    let input = ArticleInput {
        title: article.title,
        content: if article.content.is_empty() { article.summary } else { article.content },
    };

    ai::extract_viewpoints(&api_key, &model, &input).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readability_strips_ads_nav_and_scripts() {
        let html = r#"<!DOCTYPE html><html><head><title>Test</title></head><body>
            <nav>Navigation menu links here</nav>
            <div class="ad-banner">Buy our product now!</div>
            <article><h1>Article Title</h1><p>This is the real article content with useful information.</p><p>Second paragraph of the article body text.</p></article>
            <aside>Related links and ads</aside>
            <script>alert('xss')</script>
        </body></html>"#;
        let cleaned = extract_readable(html, "https://example.com/post").unwrap();
        assert!(cleaned.contains("real article content"), "main content kept");
        assert!(cleaned.contains("Second paragraph"), "second paragraph kept");
        assert!(!cleaned.contains("Buy our product"), "ad removed");
        assert!(!cleaned.contains("Navigation menu"), "nav removed");
        assert!(!cleaned.contains("Related links"), "aside removed");
        assert!(!cleaned.contains("<script"), "script removed");
    }

    #[test]
    fn extract_fallback_picks_largest_text_block() {
        // No <article>/<main>: the fallback picks the largest text block.
        let body = "Some actual article body with plenty of words. ".repeat(10);
        let html = format!(r#"<!DOCTYPE html><html><body>
            <div class="header">Site header</div>
            <div class="content"><p>{body}</p><p>More words here to reach the minimum length threshold for the heuristic.</p><p>Even more content so the heuristic selects this block and skips the footer.</p></div>
            <div class="footer">Footer links</div>
        </body></html>"#);
        let cleaned = extract_fallback(&html).unwrap();
        assert!(cleaned.contains("actual article body"), "fallback picked main content");
        assert!(!cleaned.contains("Footer links"), "footer excluded");
    }
}
