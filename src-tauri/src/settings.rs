use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub menu_on: bool,
    pub view: u8,
    pub locale_setting: String,
    pub font_size: u32,
    pub font_family: String,
    pub fetch_interval: u32,
    pub search_engine: u8,
    pub filter_type: u32,
    pub list_view_configs: u8,
    pub use_nedb: bool,
    pub menu_unread_sources_only: bool,
    pub source_groups: serde_json::Value,
    pub proxy_address: String,
    pub proxy_enabled: bool,
    #[serde(default = "default_true")]
    pub notify_on_refresh: bool,
    pub service_configs: serde_json::Value,
    pub deepseek_api_key: String,
    pub deepseek_model: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            menu_on: true,
            view: 2u8,
            locale_setting: "default".to_string(),
            font_size: 16,
            font_family: String::new(),
            fetch_interval: 0,
            search_engine: 0u8,
            filter_type: u32::MAX,
            list_view_configs: 1u8,
            use_nedb: true,
            menu_unread_sources_only: false,
            source_groups: serde_json::Value::Array(vec![]),
            proxy_address: String::new(),
            proxy_enabled: false,
            notify_on_refresh: true,
            service_configs: serde_json::json!({"type": 0}),
            deepseek_api_key: String::new(),
            deepseek_model: "deepseek-chat".to_string(),
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    data: AppSettings,
}

impl SettingsStore {
    pub fn new() -> Self {
        let path = get_settings_path();
        let data = if path.exists() {
            let content = fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            let default = AppSettings::default();
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).ok();
            }
            fs::write(&path, serde_json::to_string_pretty(&default).unwrap_or_default()).ok();
            default
        };
        Self { path, data }
    }

    fn save(&mut self) {
        fs::write(&self.path, serde_json::to_string_pretty(&self.data).unwrap_or_default()).ok();
    }

    pub fn get_theme(&self) -> String { self.data.theme.clone() }
    pub fn set_theme(&mut self, v: String) { self.data.theme = v; self.save(); }

    pub fn get_menu(&self) -> bool { self.data.menu_on }
    pub fn set_menu(&mut self, v: bool) { self.data.menu_on = v; self.save(); }

    pub fn get_view(&self) -> u8 { self.data.view }
    pub fn set_view(&mut self, v: u8) { self.data.view = v; self.save(); }

    pub fn get_locale(&self) -> String { self.data.locale_setting.clone() }
    pub fn set_locale(&mut self, v: String) { self.data.locale_setting = v; self.save(); }

    pub fn get_font_size(&self) -> u32 { self.data.font_size }
    pub fn set_font_size(&mut self, v: u32) { self.data.font_size = v; self.save(); }

    pub fn get_font_family(&self) -> String { self.data.font_family.clone() }
    pub fn set_font_family(&mut self, v: String) { self.data.font_family = v; self.save(); }

    pub fn get_fetch_interval(&self) -> u32 { self.data.fetch_interval }
    pub fn set_fetch_interval(&mut self, v: u32) { self.data.fetch_interval = v; self.save(); }

    pub fn get_search_engine(&self) -> u8 { self.data.search_engine }
    pub fn set_search_engine(&mut self, v: u8) { self.data.search_engine = v; self.save(); }

    pub fn get_proxy_enabled(&self) -> bool { self.data.proxy_enabled }
    pub fn set_proxy_enabled(&mut self, v: bool) { self.data.proxy_enabled = v; self.save(); }
    pub fn get_proxy_address(&self) -> String { self.data.proxy_address.clone() }
    pub fn set_proxy_address(&mut self, v: String) { self.data.proxy_address = v; self.save(); }

    pub fn get_notify_on_refresh(&self) -> bool { self.data.notify_on_refresh }
    pub fn set_notify_on_refresh(&mut self, v: bool) { self.data.notify_on_refresh = v; self.save(); }

    pub fn get_filter_type(&self) -> u32 { self.data.filter_type }
    pub fn set_filter_type(&mut self, v: u32) { self.data.filter_type = v; self.save(); }

    pub fn get_list_view_configs(&self) -> u8 { self.data.list_view_configs }
    pub fn set_list_view_configs(&mut self, v: u8) { self.data.list_view_configs = v; self.save(); }

    pub fn get_nedb_status(&self) -> bool { self.data.use_nedb }
    pub fn set_nedb_status(&mut self, v: bool) { self.data.use_nedb = v; self.save(); }

    pub fn get_unread_sources_only(&self) -> bool { self.data.menu_unread_sources_only }
    pub fn set_unread_sources_only(&mut self, v: bool) { self.data.menu_unread_sources_only = v; self.save(); }

    pub fn get_source_groups(&self) -> serde_json::Value { self.data.source_groups.clone() }
    pub fn set_source_groups(&mut self, v: serde_json::Value) { self.data.source_groups = v; self.save(); }

    pub fn get_service_configs(&self) -> serde_json::Value { self.data.service_configs.clone() }
    pub fn set_service_configs(&mut self, v: serde_json::Value) { self.data.service_configs = v; self.save(); }

    pub fn get_deepseek_api_key(&self) -> String { self.data.deepseek_api_key.clone() }
    pub fn set_deepseek_api_key(&mut self, v: String) { self.data.deepseek_api_key = v; self.save(); }
    pub fn get_deepseek_model(&self) -> String { self.data.deepseek_model.clone() }
    pub fn set_deepseek_model(&mut self, v: String) { self.data.deepseek_model = v; self.save(); }

    pub fn export_all(&self) -> String {
        serde_json::to_string(&self.data).unwrap_or_default()
    }
    pub fn import_all(&mut self, json: &str) -> Result<(), String> {
        let new_data: AppSettings = serde_json::from_str(json).map_err(|e| e.to_string())?;
        self.data = new_data;
        self.save();
        Ok(())
    }
}

fn default_true() -> bool { true }

fn get_settings_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("rustrssreader");
    dir.join("settings.json")
}
