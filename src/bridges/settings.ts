import { invoke } from "@tauri-apps/api/core"
import { SourceGroup, ViewType, ThemeSettings, ServiceConfigs, ViewConfigs, SearchEngines } from "../schema-types"

export const settingsBridge = {
    saveGroups: (groups: SourceGroup[]) => invoke("set_source_groups", { groups }),
    loadGroups: (): Promise<SourceGroup[]> => invoke("get_source_groups"),

    getDefaultMenu: (): Promise<boolean> => invoke("get_menu"),
    setDefaultMenu: (state: boolean) => invoke("set_menu", { state }),

    getProxyStatus: (): Promise<boolean> => invoke("get_proxy_enabled"),
    setProxyEnabled: (flag: boolean) => invoke("set_proxy_enabled", { v: flag }),
    toggleProxyStatus: () => invoke("set_proxy_enabled", { v: true }),
    getProxy: (): Promise<string> => invoke("get_proxy_address"),
    setProxy: (address: string) => invoke("set_proxy_address", { v: address }),

    getNotifyOnRefresh: (): Promise<boolean> => invoke("get_notify_on_refresh"),
    setNotifyOnRefresh: (flag: boolean) => invoke("set_notify_on_refresh", { v: flag }),

    getDefaultView: (): Promise<ViewType> => invoke("get_view"),
    setDefaultView: (viewType: ViewType) => invoke("set_view", { v: viewType }),

    getThemeSettings: (): Promise<ThemeSettings> => invoke("get_theme"),
    setThemeSettings: (theme: ThemeSettings) => invoke("set_theme", { theme }),
    shouldUseDarkColors: (): Promise<boolean> => invoke("should_use_dark_colors"),
    addThemeUpdateListener: (callback: (shouldDark: boolean) => void) => {
        const mql = window.matchMedia("(prefers-color-scheme: dark)")
        const handler = (e: MediaQueryListEvent) => callback(e.matches)
        mql.addEventListener("change", handler)
    },

    setLocaleSettings: (option: string) => invoke("set_locale", { v: option }),
    getLocaleSettings: (): Promise<string> => invoke("get_locale"),
    getCurrentLocale: async (): Promise<string> => {
        const setting = await invoke<string>("get_locale")
        if (setting === "default") return navigator.language
        return setting
    },

    getFontSize: (): Promise<number> => invoke("get_font_size"),
    setFontSize: (size: number) => invoke("set_font_size", { v: size }),
    getFont: (): Promise<string> => invoke("get_font_family"),
    setFont: (font: string) => invoke("set_font_family", { v: font }),

    getFetchInterval: (): Promise<number> => invoke("get_fetch_interval"),
    setFetchInterval: (interval: number) => invoke("set_fetch_interval", { v: interval }),

    getSearchEngine: (): Promise<SearchEngines> => invoke("get_search_engine"),
    setSearchEngine: (engine: SearchEngines) => invoke("set_search_engine", { v: engine }),

    getServiceConfigs: (): Promise<ServiceConfigs> => invoke("get_service_configs"),
    setServiceConfigs: (configs: ServiceConfigs) => invoke("set_service_configs", { v: configs }),

    getFilterType: (): Promise<number> => invoke("get_filter_type"),
    setFilterType: (filterType: number) => invoke("set_filter_type", { v: filterType }),

    getViewConfigs: (view: ViewType): Promise<ViewConfigs> => invoke("get_list_view_configs"),
    setViewConfigs: (view: ViewType, configs: ViewConfigs) => invoke("set_list_view_configs", { v: configs }),

    getNeDBStatus: (): Promise<boolean> => invoke("get_nedb_status"),
    setNeDBStatus: (flag: boolean) => invoke("set_nedb_status", { v: flag }),

    getUnreadSourcesOnly: (): Promise<boolean> => invoke("get_unread_sources_only"),
    setUnreadSourcesOnly: (flag: boolean) => invoke("set_unread_sources_only", { v: flag }),

    getAll: (): Promise<object> => invoke("export_all_settings"),
    setAll: (configs: object) => invoke("import_all_settings", { json: JSON.stringify(configs) }),
}

export default settingsBridge
