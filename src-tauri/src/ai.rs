use serde::{Deserialize, Serialize};

const API_URL: &str = "https://api.deepseek.com/v1/chat/completions";

// ─── API types ───

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: String,
}

// ─── Prompt builders ───

fn build_summary_prompt(article: &ArticleInput) -> (String, String) {
    let system = "你是一个专业的文章摘要助手。用3-5句话提取文章核心内容，不要添加原文没有的信息。输出纯文本，不要用markdown格式。".to_string();
    let user = format!(
        "标题：{}\n\n正文：\n{}",
        article.title,
        truncate(&article.content, 8000)
    );
    (system, user)
}

fn build_tag_prompt(article: &ArticleInput, existing_tags: &[String]) -> (String, String) {
    let existing_str = if existing_tags.is_empty() {
        String::new()
    } else {
        format!("\n\n已存在的标签（不要生成与这些语义重复的标签）：{}", existing_tags.join("、"))
    };
    let system = "\
你是一个精准的文章分类助手。严格遵守以下规则：

1. 只输出 1-3 个标签，绝对不能超过 3 个
2. 每个标签 2-6 个字，尽可能精炼
3. 标签必须高度具体，能区分这篇文章的独特主题
4. 不生成与「已存在的标签」语义相同或高度近似的标签
5. 只输出纯 JSON 数组，不要其他任何文字

反面示例（不要生成这类过于宽泛的标签）：
❌ 科技、互联网、新闻、评论、分析、观点、社会、经济

正面示例（具体、有区分度）：
✅ Rust编程、前端架构、性能优化、开源协议、LLM微调".to_string();
    let user = format!(
        "标题：{}\n\n正文：{}{}",
        article.title,
        truncate(&article.content, 6000),
        existing_str
    );
    (system, user)
}

fn build_translate_prompt(article: &ArticleInput, target_lang: &str) -> (String, String) {
    let system = format!(
        "你是一个专业翻译助手。将以下文章翻译成{}。保持原文格式和语气，准确传达原意。输出纯翻译文本。",
        target_lang
    );
    let user = format!(
        "标题：{}\n\n正文：\n{}",
        article.title,
        truncate(&article.content, 8000)
    );
    (system, user)
}

fn build_viewpoint_prompt(article: &ArticleInput) -> (String, String) {
    let system = "\
你是一个精准的文章分析助手。从文章中提取作者的核心论点和立场。

规则：
1. 每个观点必须引用或概括文章中的具体论述，不能是泛泛而谈
2. 观点要反映作者的真实态度，而非你的推测
3. stance 用一到两句话总结作者的总体立场
4. 严格按以下JSON格式输出：{\"viewpoints\":[\"观点1\",\"观点2\"],\"stance\":\"作者立场概述\"}

反面示例（太泛）：
❌ {\"viewpoints\":[\"技术发展迅速\"],\"stance\":\"作者持积极态度\"}

正面示例（具体有据）：
✅ {\"viewpoints\":[\"Rust的所有权模型比传统垃圾回收更高效\",\"异步编程在系统级语言中仍有改进空间\"],\"stance\":\"作者看好Rust在系统编程中的前景但认为生态成熟度不足\"}"
    .to_string();
    let user = format!(
        "标题：{}\n\n正文：\n{}",
        article.title,
        truncate(&article.content, 8000)
    );
    (system, user)
}

// ─── Core API call ───

async fn chat_completion(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_message: &str,
    temperature: f64,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request = ChatRequest {
        model: model.to_string(),
        messages: vec![
            ChatMessage { role: "system".to_string(), content: system_prompt.to_string() },
            ChatMessage { role: "user".to_string(), content: user_message.to_string() },
        ],
        temperature,
        max_tokens,
    };

    let response = client
        .post(API_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    let status = response.status();
    let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        if let Ok(err) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(msg) = err["error"]["message"].as_str() {
                return Err(format!("API error: {}", msg));
            }
        }
        return Err(format!("API error: HTTP {} - {}", status, truncate(&body, 200)));
    }

    let chat_response: ChatResponse =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse response: {}", e))?;

    chat_response
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "Empty response from API".to_string())
}

// ─── Article input ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArticleInput {
    pub title: String,
    pub content: String,
}

// ─── Public API ───

pub async fn summarize(
    api_key: &str,
    model: &str,
    article: &ArticleInput,
) -> Result<String, String> {
    let (system, user) = build_summary_prompt(article);
    chat_completion(api_key, model, &system, &user, 0.3, 300).await
}

pub async fn tag(
    api_key: &str,
    model: &str,
    article: &ArticleInput,
    existing_tags: &[String],
) -> Result<Vec<String>, String> {
    let (system, user) = build_tag_prompt(article, existing_tags);
    let raw = chat_completion(api_key, model, &system, &user, 0.1, 200).await?;
    // Parse JSON array from response
    let trimmed = raw.trim();
    let json_str = if trimmed.starts_with('[') {
        trimmed
    } else if let Some(start) = trimmed.find('[') {
        let end = trimmed.rfind(']').unwrap_or(trimmed.len());
        &trimmed[start..=end]
    } else {
        return Err("Failed to parse tags from response".to_string());
    };
    let mut tags: Vec<String> = serde_json::from_str(json_str)
        .map_err(|e| format!("Invalid tag format: {}", e))?;

    // Hard cap: max 3 tags
    tags.truncate(3);

    // Deduplicate against existing tags (case-insensitive)
    let existing_lower: Vec<String> = existing_tags.iter().map(|t| t.to_lowercase()).collect();
    tags.retain(|t| !existing_lower.contains(&t.to_lowercase()));

    Ok(tags)
}

pub async fn translate(
    api_key: &str,
    model: &str,
    article: &ArticleInput,
    target_lang: &str,
) -> Result<String, String> {
    let (system, user) = build_translate_prompt(article, target_lang);
    chat_completion(api_key, model, &system, &user, 0.2, 4096).await
}

pub async fn extract_viewpoints(
    api_key: &str,
    model: &str,
    article: &ArticleInput,
) -> Result<ViewpointsResult, String> {
    let (system, user) = build_viewpoint_prompt(article);
    let raw = chat_completion(api_key, model, &system, &user, 0.2, 500).await?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse viewpoints: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewpointsResult {
    pub viewpoints: Vec<String>,
    pub stance: String,
}

// ─── Helpers ───

fn truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        s.chars().take(max_chars).collect::<String>() + "\n\n[内容已截断...]"
    }
}
