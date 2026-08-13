import * as React from "react"
import { useEffect, useState } from "react"
import { useAppStore } from "../store"
import { useI18n } from "../i18n"
import { ThemeSettings } from "../schema-types"
import { Select, RadioGroup, Radio, Button, Input, Switch, Slider, Spinner, tokens } from "@fluentui/react-components"
import { ArrowLeftRegular, DismissRegular, AddRegular, ArrowSyncRegular, SearchRegular, FolderRegular } from "@fluentui/react-icons"

// ═══ Styles ═══
const S = {
    page: {
        position: "fixed" as const, zIndex: 10, inset: 0,
        backgroundColor: "var(--neutralLayer2)", display: "flex", flexDirection: "column" as const,
    },
    header: {
        display: "flex", alignItems: "center", gap: "12px",
        height: "44px", padding: "0 12px", flexShrink: 0,
        backgroundColor: "var(--neutralLayer1)",
        borderBottom: "1px solid var(--neutralLayer3)",
    },
    headerTitle: { fontSize: "14px", fontWeight: 600, color: tokens.colorNeutralForeground1 },
    content: {
        flex: 1, overflowY: "auto" as const, padding: "28px 36px 48px",
        width: "100%", boxSizing: "border-box" as const,
    },
    // Section
    sectionTitle: {
        fontSize: "11px", fontWeight: 600, letterSpacing: "0.5px",
        color: tokens.colorNeutralForeground4, textTransform: "uppercase" as const,
        marginBottom: "16px",
    },
    field: { marginBottom: "24px" },
    label: { display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 600, color: tokens.colorNeutralForeground1 },
    hint: { fontSize: "12px", color: tokens.colorNeutralForeground4, marginTop: "4px" },
    row: { display: "flex", alignItems: "center", gap: "12px" },
    // Feeds
    addForm: { display: "flex", gap: "8px", marginBottom: "8px" },
    discoverResult: {
        padding: "10px 12px", border: "1px solid var(--neutralLayer3)", marginBottom: "12px",
        display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
    },
    feedItem: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--neutralLayer3)" },
    feedInfo: { flex: 1, minWidth: 0 },
    feedTitle: { fontSize: "13px", fontWeight: 500, color: tokens.colorNeutralForeground1 },
    feedUrl: { fontSize: "12px", color: tokens.colorNeutralForeground4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
    feedCount: { fontSize: "12px", color: tokens.colorNeutralForeground3 },
    // General
    sliderRow: { display: "flex", alignItems: "center", gap: "12px" },
    sliderVal: { fontSize: "13px", fontWeight: 600, minWidth: "36px", textAlign: "center" as const, color: tokens.colorNeutralForeground1 },
    // About
    aboutTitle: { fontSize: "18px", fontWeight: 700, marginBottom: 4, color: tokens.colorNeutralForeground1 },
    aboutVer: { fontSize: "13px", color: tokens.colorNeutralForeground4, marginBottom: 20 },
    aboutText: { fontSize: "13px", lineHeight: 1.7, color: tokens.colorNeutralForeground2, marginBottom: 16 },
    aboutTech: { fontSize: "12px", color: tokens.colorNeutralForeground4 },
}

const fetchIntervals = [
    { value: "0", label: "Never" }, { value: "5", label: "5 min" },
    { value: "10", label: "10 min" }, { value: "15", label: "15 min" },
    { value: "30", label: "30 min" }, { value: "60", label: "1 hour" },
]

const languages = [
    { value: "default", label: "Follow System" },
    { value: "en-US", label: "English" }, { value: "zh-CN", label: "中文（简体）" },
    { value: "zh-TW", label: "中文（繁體）" }, { value: "ja", label: "日本語" }, { value: "ko", label: "한글" },
]

// ═══ Feeds Tab ═══
const FeedsTab: React.FC = () => {
    const feeds = useAppStore(s => s.feeds)
    const addFeed = useAppStore(s => s.addFeed)
    const removeFeed = useAppStore(s => s.removeFeed)
    const refreshFeed = useAppStore(s => s.refreshFeed)
    const refreshAll = useAppStore(s => s.refreshAll)
    const updateFeed = useAppStore(s => s.updateFeed)
    const { t } = useI18n()

    const existingGroups = React.useMemo(() => {
        const groups = new Set(feeds.map(f => f.group_name).filter(Boolean))
        return Array.from(groups).sort()
    }, [feeds])

    const [url, setUrl] = useState("")
    const [groupName, setGroupName] = useState("")
    const [adding, setAdding] = useState(false)
    const [importing, setImporting] = useState(false)
    const [error, setError] = useState("")
    const [importResult, setImportResult] = useState("")
    const [discovering, setDiscovering] = useState(false)
    const [discoveredFeeds, setDiscoveredFeeds] = useState<Array<{ url: string; title: string; type: string }>>([])
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const handleAdd = async () => {
        if (!url.trim()) return
        setAdding(true); setError("")
        try {
            await addFeed(url.trim(), groupName.trim())
            setUrl(""); setGroupName("")
            const f = useAppStore.getState().feeds; if (f.length) refreshFeed(f[f.length - 1].id)
        } catch (e) { setError(String(e)) }
        setAdding(false)
    }

    const handleDiscover = async () => {
        if (!url.trim()) return
        setDiscovering(true); setError(""); setDiscoveredFeeds([])
        try { setDiscoveredFeeds(await window.feeds.discoverFeeds(url.trim())) }
        catch (e) { setError(String(e)) }
        setDiscovering(false)
    }

    const handleAddDiscovered = async (feedUrl: string) => {
        setAdding(true); setError("")
        try {
            await addFeed(feedUrl, groupName.trim())
            setDiscoveredFeeds([]); setUrl(""); setGroupName("")
            const f = useAppStore.getState().feeds; if (f.length) refreshFeed(f[f.length - 1].id)
        } catch (e) { setError(String(e)) }
        setAdding(false)
    }

    const handleOpmlImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setImporting(true)
        try {
            const [added, skipped] = await window.feeds.importOpml(await file.text())
            setError("")
            setImportResult(t("settings.importResult", { added, skipped }))
            await useAppStore.getState().loadFeeds()
        } catch (err) {
            setError(t("settings.importFailed", { err: String(err) }))
            setImportResult("")
        }
        finally {
            setImporting(false)
            e.target.value = ""
        }
    }

    const handleOpmlExport = async () => {
        const opml = await window.feeds.exportOpml()
        const blob = new Blob([opml], { type: "text/xml" })
        const u = URL.createObjectURL(blob)
        const a = document.createElement("a"); a.href = u; a.download = "feeds.opml"
        a.click(); URL.revokeObjectURL(u)
    }

    return (
        <>
            <div style={S.sectionTitle}>{t("settings.addFeed")}</div>
            <div style={S.addForm}>
                <Input style={{ flex: "1 1 240px" }} placeholder={t("settings.feedUrlPlaceholder")} value={url} onChange={(_, d) => setUrl(d.value)} />
                {existingGroups.length > 0 ? (
                    <select value={groupName} onChange={e => setGroupName(e.target.value)}
                        style={{ flex: "0 0 150px", fontSize: "13px", padding: "0 8px", borderRadius: "4px",
                            border: "1px solid var(--neutralLayer3)", backgroundColor: "var(--neutralLayer1)",
                            color: tokens.colorNeutralForeground1, cursor: "pointer", height: "32px" }}>
                        <option value="">{t("settings.noGroup")}</option>
                        {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                        <option value="__new__">{t("settings.newGroup")}</option>
                    </select>
                ) : (
                    <Input style={{ flex: "0 0 150px" }} placeholder={t("settings.groupOptional")} value={groupName}
                        onChange={(_, d) => setGroupName(d.value)} />
                )}
                {groupName === "__new__" && (
                    <Input style={{ flex: "0 0 120px" }} placeholder={t("settings.groupName")}
                        onChange={(_, d) => setGroupName(d.value)}
                        onKeyDown={e => e.key === "Enter" && handleAdd()} autoFocus />
                )}
                <Button appearance="primary" icon={<AddRegular />} onClick={handleAdd} disabled={adding || !url.trim()}>
                    {adding ? "..." : t("common.add")}
                </Button>
            </div>
            <div style={S.addForm}>
                <Button appearance="subtle" size="small" icon={<SearchRegular />} onClick={handleDiscover}
                    disabled={discovering || !url.trim()}>{discovering ? t("common.scanning") : t("settings.discover")}</Button>
            </div>
            {discoveredFeeds.map((f, i) => (
                <div key={i} style={S.discoverResult} onClick={() => handleAddDiscovered(f.url)}>
                    <div style={{ flex: 1 }}>
                        <div style={S.feedTitle}>{f.title}</div>
                        <div style={S.feedUrl}>{f.url}</div>
                    </div>
                    <Button appearance="primary" size="small" icon={<AddRegular />}>{t("common.add")}</Button>
                </div>
            ))}
            {error && <div style={{ ...S.hint, color: "var(--red)", marginBottom: 12 }}>{error}</div>}
            {importResult && <div style={{ ...S.hint, color: "#2e7d32", marginBottom: 12 }}>{importResult}</div>}

            {feeds.length > 0 && (
                <>
                    <div style={{ display: "flex", alignItems: "center", marginTop: "32px", marginBottom: "12px" }}>
                        <div style={{ ...S.sectionTitle, marginBottom: 0 }}>{t("settings.subscriptions")}</div>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: "12px", color: tokens.colorNeutralForeground4, marginRight: "12px" }}>
                            {t("settings.feedCount", { count: feeds.length })}
                        </span>
                        <Button appearance="subtle" icon={<ArrowSyncRegular />} size="small" onClick={refreshAll}>{t("settings.refreshAll")}</Button>
                        <input ref={fileInputRef} type="file" accept=".opml,.xml" style={{ display: "none" }} onChange={handleOpmlImport} />
                        <Button appearance="subtle" size="small" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                            {importing ? t("common.importing") : t("common.import")}
                        </Button>
                        <Button appearance="subtle" size="small" onClick={handleOpmlExport}>{t("common.export")}</Button>
                    </div>
                    {(() => {
                        const grouped = new Map<string, typeof feeds>()
                        for (const f of feeds) {
                            const key = f.group_name || t("settings.ungrouped")
                            if (!grouped.has(key)) grouped.set(key, [])
                            grouped.get(key)!.push(f)
                        }
                        const entries = Array.from(grouped.entries())
                        entries.sort(([a], [b]) => {
                            if (a === t("settings.ungrouped") && b !== t("settings.ungrouped")) return -1
                            if (a !== t("settings.ungrouped") && b === t("settings.ungrouped")) return 1
                            return a.localeCompare(b)
                        })
                        return entries.map(([group, groupFeeds]) => (
                            <div key={group}>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: tokens.colorNeutralForeground3, marginTop: "16px", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <FolderRegular fontSize={14} /> {group}
                                    <span style={{ fontWeight: 400, color: tokens.colorNeutralForeground4 }}>({groupFeeds.length})</span>
                                </div>
                                {groupFeeds.map(f => (
                                    <div key={f.id} style={S.feedItem}>
                                        <div style={S.feedInfo}>
                                            <div style={S.feedTitle}>{f.title || f.url}</div>
                                            <div style={S.feedUrl}>{f.url}</div>
                                            <div style={S.feedCount}>{t("settings.articleCount", { count: f.article_count })}{f.unread_count > 0 ? ` (${t("page.unreadCount", { count: f.unread_count })})` : ""}{f.error_count > 0 ? ` · ${t("settings.errors", { count: f.error_count })}` : ""}</div>
                                        </div>
                                        <select value={f.group_name} onChange={e => updateFeed(f.id, f.title, e.target.value)}
                                            style={{ fontSize: "12px", padding: "2px 6px", borderRadius: "4px",
                                                border: "1px solid var(--neutralLayer3)", backgroundColor: "var(--neutralLayer2)",
                                                color: tokens.colorNeutralForeground2, cursor: "pointer", maxWidth: "100px" }}>
                                            <option value="">{t("settings.ungrouped")}</option>
                                            {existingGroups.filter(g => g !== f.group_name).map(g => <option key={g} value={g}>{g}</option>)}
                                            {f.group_name && !existingGroups.includes(f.group_name) && (
                                                <option value={f.group_name}>{f.group_name}</option>
                                            )}
                                        </select>
                                        <Button appearance="subtle" size="small" onClick={() => refreshFeed(f.id)}>{t("common.refresh")}</Button>
                                        <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={() => removeFeed(f.id)} />
                                    </div>
                                ))}
                            </div>
                        ))
                    })()}
                </>
            )}

            {feeds.length === 0 && !adding && (
                <div style={{ textAlign: "center", color: tokens.colorNeutralForeground4, padding: "40px 0", fontSize: "13px" }}>
                    {t("settings.pasteHint")}
                </div>
            )}
        </>
    )
}

// ═══ General Tab ═══
const GeneralTab: React.FC = () => {
    const [theme, setTheme] = useState("system")
    const [fetchInterval, setFetchInterval] = useState("0")
    const [language, setLanguage] = useState("default")
    const [fontSize, setFontSize] = useState(16)
    const [proxyEnabled, setProxyEnabled] = useState(false)
    const [proxyUrl, setProxyUrl] = useState("")
    const [notifyOnRefresh, setNotifyOnRefresh] = useState(true)
    const [minimizeToTray, setMinimizeToTray] = useState(true)
    const { t, setLocale } = useI18n()

    useEffect(() => {
        window.settings.getThemeSettings().then(setTheme)
        window.settings.getFetchInterval().then(v => setFetchInterval(String(v)))
        window.settings.getLocaleSettings().then(setLanguage)
        window.settings.getFontSize().then(v => setFontSize(v))
        window.settings.getProxyStatus().then(setProxyEnabled)
        window.settings.getProxy().then(setProxyUrl)
        window.settings.getNotifyOnRefresh().then(setNotifyOnRefresh)
        window.settings.getMinimizeToTray().then(setMinimizeToTray)
    }, [])

    return (
        <>
            <div style={S.sectionTitle}>{t("settings.appearance")}</div>
            <div style={S.field}>
                <div style={S.label}>{t("settings.language")}</div>
                <Select value={language} onChange={(_, d) => { setLanguage(d.value); window.settings.setLocaleSettings(d.value); setLocale(d.value) }}>
                    {languages.map(l => <option key={l.value} value={l.value}>{l.value === "default" ? t("settings.followSystem") : l.label}</option>)}
                </Select>
            </div>
            <div style={S.field}>
                <div style={S.label}>{t("settings.theme")}</div>
                <RadioGroup value={theme} onChange={(_, d) => { setTheme(d.value); window.settings.setThemeSettings(d.value as ThemeSettings) }}>
                    <Radio value="system" label={t("settings.themeSystem")} />
                    <Radio value="light" label={t("settings.themeLight")} />
                    <Radio value="dark" label={t("settings.themeDark")} />
                </RadioGroup>
            </div>
            <div style={S.field}>
                <div style={S.label}>{t("settings.readingFontSize")}</div>
                <div style={S.sliderRow}>
                    <div style={S.sliderVal}>{fontSize}px</div>
                    <div style={{ flex: 1 }}>
                        <Slider min={12} max={28} step={1} value={fontSize}
                            onChange={(_, d) => {
                                const v = d.value as number
                                setFontSize(v)
                                window.settings.setFontSize(v)
                                applyFontSize(v)
                            }} />
                    </div>
                </div>
                <div style={S.hint}>{t("settings.fontHint", { title: Math.round(fontSize * 1.5), body: fontSize })}</div>
            </div>

            <div style={{ ...S.sectionTitle, marginTop: "32px" }}>{t("settings.updates")}</div>
            <div style={S.field}>
                <div style={S.label}>{t("settings.autoRefresh")}</div>
                <Select value={fetchInterval} onChange={(_, d) => { setFetchInterval(d.value); window.settings.setFetchInterval(Number(d.value)) }}>
                    {fetchIntervals.map(o => <option key={o.value} value={o.value}>{o.value === "0" ? t("common.never") : o.label}</option>)}
                </Select>
            </div>
            <div style={S.field}>
                <div style={S.label}>{t("settings.refreshNotifications")}</div>
                <Switch checked={notifyOnRefresh} label={notifyOnRefresh ? t("common.on") : t("common.off")}
                    onChange={(_, d) => { setNotifyOnRefresh(d.checked); window.settings.setNotifyOnRefresh(d.checked) }} />
                <div style={S.hint}>{t("settings.refreshNotificationsHint")}</div>
            </div>
            <div style={S.field}>
                <div style={S.label}>{t("settings.minimizeToTray")}</div>
                <Switch checked={minimizeToTray} label={minimizeToTray ? t("common.on") : t("common.off")}
                    onChange={(_, d) => { setMinimizeToTray(d.checked); window.settings.setMinimizeToTray(d.checked) }} />
                <div style={S.hint}>{t("settings.minimizeToTrayHint")}</div>
            </div>

            <div style={{ ...S.sectionTitle, marginTop: "32px" }}>{t("settings.network")}</div>
            <div style={S.field}>
                <div style={S.label}>{t("settings.pacProxy")}</div>
                <Switch checked={proxyEnabled} label={proxyEnabled ? t("common.on") : t("common.off")}
                    onChange={(_, d) => { setProxyEnabled(d.checked); window.settings.setProxyEnabled(d.checked) }} />
                {proxyEnabled && (
                    <div style={{ ...S.row, marginTop: 8 }}>
                        <Input style={{ flex: 1 }} placeholder={t("settings.proxyUrlPlaceholder")} value={proxyUrl} onChange={(_, d) => setProxyUrl(d.value)} />
                        <Button size="small" onClick={() => window.settings.setProxy(proxyUrl)}>{t("common.apply")}</Button>
                    </div>
                )}
            </div>
        </>
    )
}

// ═══ RSSHub Tab ═══
interface RssRoute { path: string; name?: string; docs?: string; parameters?: Record<string, string> }
interface RssSite { routes: RssRoute[] }

const RssHubTab: React.FC = () => {
    const addFeed = useAppStore(s => s.addFeed)
    const { t } = useI18n()
    const [instance, setInstance] = useState("https://rsshub.app")
    const [sites, setSites] = useState<Record<string, RssSite>>({})
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [search, setSearch] = useState("")
    const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set())
    const [expandedRoute, setExpandedRoute] = useState<string | null>(null)
    const [paramVals, setParamVals] = useState<Record<string, string>>({})
    const [addedMsg, setAddedMsg] = useState("")

    const loadRoutes = async () => {
        if (!instance.trim()) return
        setLoading(true); setError(""); setAddedMsg("")
        try {
            const text = await window.rsshub.fetchRoutes(instance.trim())
            const data = JSON.parse(text).data
            const norm: Record<string, RssSite> = {}
            for (const [site, info] of Object.entries<unknown>(data)) {
                const rec = info as { routes?: unknown; name?: string }
                const raw = Array.isArray(info) ? info : (rec?.routes ?? [])
                norm[site] = {
                    routes: (raw as unknown[]).map(r => typeof r === "string" ? { path: r as string } : r as RssRoute),
                }
            }
            setSites(norm)
        } catch (e) { setError(String(e)) }
        setLoading(false)
    }

    const siteEntries = React.useMemo(() => {
        const q = search.trim().toLowerCase()
        const entries = Object.entries(sites)
        if (!q) return entries
        return entries.filter(([site, s]) =>
            site.toLowerCase().includes(q) ||
            s.routes.some(r => r.path.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q))
        )
    }, [sites, search])

    const routeParams = (path: string): string[] => {
        const names: string[] = []
        const re = /:([a-zA-Z0-9_]+)\??/g
        let m: RegExpExecArray | null
        while ((m = re.exec(path))) if (!names.includes(m[1])) names.push(m[1])
        return names
    }

    const buildUrl = (path: string): string => {
        let url = `${instance.trim().replace(/\/+$/, "")}${path}`
        for (const [k, v] of Object.entries(paramVals)) {
            if (v) url = url.replace(new RegExp(`:${k}\\??`, "g"), encodeURIComponent(v))
        }
        return url
    }

    const toggleSite = (site: string) => {
        setExpandedSites(prev => {
            const next = new Set(prev)
            if (next.has(site)) next.delete(site); else next.add(site)
            return next
        })
    }

    const toggleRoute = (path: string) => {
        if (expandedRoute === path) { setExpandedRoute(null); return }
        setExpandedRoute(path)
        const vals: Record<string, string> = {}
        for (const p of routeParams(path)) vals[p] = ""
        setParamVals(vals)
    }

    const handleAdd = async (path: string) => {
        const url = buildUrl(path)
        if (url.includes(":")) { setError(t("settings.fillParams")); return }
        setError(""); setAddedMsg("")
        try {
            await addFeed(url, "RSSHub")
            setAddedMsg(t("settings.added", { url }))
            setExpandedRoute(null)
        } catch (e) { setError(String(e)) }
    }

    const totalRoutes = React.useMemo(() =>
        Object.values(sites).reduce((n, s) => n + s.routes.length, 0), [sites])

    return (
        <>
            <div style={S.sectionTitle}>{t("settings.rsshub")}</div>
            <div style={S.hint}>{t("settings.rsshubHint")}</div>

            <div style={{ ...S.row, margin: "12px 0" }}>
                <Input style={{ flex: 1 }} placeholder={t("settings.rsshubInstance")}
                    value={instance} onChange={(_, d) => setInstance(d.value)} />
                <Button appearance="primary" icon={<ArrowSyncRegular />} onClick={loadRoutes}
                    disabled={loading || !instance.trim()}>{loading ? t("common.loading") : t("settings.loadRoutes")}</Button>
            </div>

            {error && <div style={{ fontSize: "12px", color: "#d32f2f", margin: "4px 0 10px" }}>{error}</div>}
            {addedMsg && <div style={{ fontSize: "12px", color: "#2e7d32", margin: "4px 0 10px" }}>{addedMsg}</div>}

            {Object.keys(sites).length > 0 && (
                <>
                    <div style={{ ...S.row, margin: "14px 0 10px" }}>
                        <Input style={{ flex: 1 }} placeholder={t("settings.searchRoutes")} contentBefore={<SearchRegular />}
                            value={search} onChange={(_, d) => setSearch(d.value)} />
                        <span style={{ fontSize: "12px", color: tokens.colorNeutralForeground4 }}>
                            {t("settings.sitesRoutes", { sites: siteEntries.length, routes: totalRoutes })}
                        </span>
                    </div>

                    {siteEntries.length === 0 && <div style={S.hint}>{t("settings.noRoutes")}</div>}

                    {siteEntries.map(([site, s]) => {
                        const isOpen = expandedSites.has(site)
                        return (
                            <div key={site} style={{ marginBottom: "2px" }}>
                                <div style={{
                                    display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px",
                                    cursor: "pointer", borderRadius: "4px", fontSize: "13px", fontWeight: 600,
                                    color: tokens.colorNeutralForeground1, backgroundColor: "var(--neutralLayer1)",
                                    border: "1px solid var(--neutralLayer3)",
                                }} onClick={() => toggleSite(site)}>
                                    <FolderRegular fontSize={14} style={{ color: tokens.colorNeutralForeground3 }} />
                                    <span style={{ flex: 1 }}>{site}</span>
                                    <span style={{ fontSize: "11px", color: tokens.colorNeutralForeground4 }}>{s.routes.length}</span>
                                    <span style={{ fontSize: "11px", transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform 0.1s" }}>›</span>
                                </div>

                                {isOpen && (
                                    <div style={{ padding: "2px 0 6px 12px" }}>
                                        {s.routes.map(r => {
                                            const ps = routeParams(r.path)
                                            const isRouteOpen = expandedRoute === r.path
                                            const url = buildUrl(r.path)
                                            return (
                                                <div key={r.path} style={{ borderBottom: "1px solid var(--neutralLayer3)" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 8px", cursor: "pointer" }}
                                                        onClick={() => toggleRoute(r.path)}>
                                                        <span style={{ fontSize: "12px", color: tokens.colorNeutralForeground2, flex: 1, fontFamily: "monospace" }}>{r.path}</span>
                                                        {r.name && <span style={{ fontSize: "11px", color: tokens.colorNeutralForeground4 }}>{r.name}</span>}
                                                    </div>
                                                    {isRouteOpen && (
                                                        <div style={{ padding: "0 8px 10px 8px" }}>
                                                            {r.docs && <div style={{ fontSize: "12px", color: tokens.colorNeutralForeground3, marginBottom: "8px" }}>{r.docs}</div>}
                                                            {ps.length === 0 ? (
                                                                <Button size="small" appearance="primary" icon={<AddRegular />}
                                                                    onClick={() => handleAdd(r.path)}>{t("settings.subscribe")}</Button>
                                                            ) : (
                                                                <>
                                                                    {ps.map(p => (
                                                                        <div key={p} style={{ marginBottom: "6px" }}>
                                                                            <div style={{ fontSize: "12px", fontWeight: 600, color: tokens.colorNeutralForeground2, marginBottom: "3px" }}>
                                                                                {p}{r.parameters?.[p] ? "" : " *"}
                                                                            </div>
                                                                            <Input size="small" style={{ width: "100%" }}
                                                                                placeholder={r.parameters?.[p] ?? t("settings.enterParam", { param: p })}
                                                                                value={paramVals[p] ?? ""}
                                                                                onChange={(_, d) => setParamVals(prev => ({ ...prev, [p]: d.value }))} />
                                                                        </div>
                                                                    ))}
                                                                    <div style={{ fontSize: "11px", color: tokens.colorNeutralForeground4, margin: "6px 0", wordBreak: "break-all" }}>{url}</div>
                                                                    <Button size="small" appearance="primary" icon={<AddRegular />}
                                                                        onClick={() => handleAdd(r.path)}>{t("settings.subscribe")}</Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </>
            )}

            {loading && <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><Spinner size="small" /></div>}
        </>
    )
}

// ═══ About Tab ═══
const AboutTab: React.FC = () => {
    const { t } = useI18n()
    return (
        <>
            <div style={S.sectionTitle}>{t("settings.about")}</div>
            <div style={S.aboutTitle}>Rust RSS Reader</div>
            <div style={S.aboutVer}>{t("settings.version")}</div>
            <div style={S.aboutText}>{t("settings.aboutText")}</div>
            <div style={S.aboutTech}>{t("settings.aboutTech")}</div>
        </>
    )
}

// ═══ Main Settings ═══
const Settings: React.FC = () => {
    const display = useAppStore(s => s.settingsDisplay)
    const toggleSettings = useAppStore(s => s.toggleSettings)
    const { t } = useI18n()

    useEffect(() => {
        if (!display) return
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") toggleSettings(false) }
        document.addEventListener("keydown", h)
        return () => document.removeEventListener("keydown", h)
    }, [display, toggleSettings])

    if (!display) return null

    return (
        <div style={S.page}>
            <div style={S.header}>
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => toggleSettings(false)}>{t("common.back")}</Button>
                <div style={{ flex: 1 }} />
                <div style={S.headerTitle}>{t("settings.title")}</div>
                <div style={{ flex: 1 }} />
            </div>
            <div style={S.content}>
                <FeedsTab />
                <div style={{ ...S.sectionTitle, marginTop: "40px" }}>{t("settings.general")}</div>
                <GeneralTab />
                <div style={{ ...S.sectionTitle, marginTop: "40px" }}>{t("settings.rsshub")}</div>
                <RssHubTab />
                <div style={{ ...S.sectionTitle, marginTop: "40px" }}>{t("settings.about")}</div>
                <AboutTab />
            </div>
        </div>
    )
}

function applyFontSize(size: number) {
    document.documentElement.style.setProperty('--articleBodySize', `${size}px`)
    document.documentElement.style.setProperty('--articleTitleSize', `${Math.round(size * 1.5)}px`)
}

export default Settings
