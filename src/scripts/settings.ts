import { ThemeSettings } from "../schema-types"

export function getFontFamilyForLocale(locale: string): string {
    switch (locale) {
        case "zh-CN":
            return '"Segoe UI", "Source Han Sans SC Regular", "Microsoft YaHei", sans-serif'
        case "zh-TW":
            return '"Segoe UI", "Source Han Sans TC Regular", "Microsoft JhengHei", sans-serif'
        case "ja":
            return '"Segoe UI", "Source Han Sans JP Regular", "Yu Gothic UI", sans-serif'
        case "ko":
            return '"Segoe UI", "Source Han Sans KR Regular", "Malgun Gothic", sans-serif'
        default:
            return '"Segoe UI", "Source Han Sans Regular", sans-serif'
    }
}

export function setThemeSettings(theme: ThemeSettings) {
    window.settings.setThemeSettings(theme)
}
export async function getThemeSettings(): Promise<ThemeSettings> {
    return window.settings.getThemeSettings()
}
