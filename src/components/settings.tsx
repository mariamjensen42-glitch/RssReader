import * as React from "react"
import { useEffect, useState } from "react"
import { useAppStore } from "../store"
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

    const existingGroups = React.useMemo(() => {
        const groups = new Set(feeds.map(f => f.group_name).filter(Boolean))
        return Array.from(groups).sort()
    }, [feeds])

    const [url, setUrl] = useState("")
    const [groupName, setGroupName] = useState("")
    const [adding, setAdding] = useState(false)
    const [error, setError] = useState("")
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
        try {
            const msg = await window.feeds.importOpml(await file.text())
            setError(msg)
            await useAppStore.getState().loadFeeds()
        } catch (err) { setError("Import failed: " + String(err)) }
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
            <div style={S.sectionTitle}>Add Feed</div>
            <div style={S.addForm}>
                <Input style={{ flex: "1 1 240px" }} placeholder="RSS Feed URL or website" value={url} onChange={(_, d) => setUrl(d.value)} />
                {existingGroups.length > 0 ? (
                    <select value={groupName} onChange={e => setGroupName(e.target.value)}
                        style={{ flex: "0 0 150px", fontSize: "13px", padding: "0 8px", borderRadius: "4px",
                            border: "1px solid var(--neutralLayer3)", backgroundColor: "var(--neutralLayer1)",
                            color: tokens.colorNeutralForeground1, cursor: "pointer", height: "32px" }}>
                        <option value="">No group</option>
                        {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                        <option value="__new__">+ New group...</option>
                    </select>
                ) : (
                    <Input style={{ flex: "0 0 150px" }} placeholder="Group (optional)" value={groupName}
                        onChange={(_, d) => setGroupName(d.value)} />
                )}
                {groupName === "__new__" && (
                    <Input style={{ flex: "0 0 120px" }} placeholder="Group name"
                        onChange={(_, d) => setGroupName(d.value)}
                        onKeyDown={e => e.key === "Enter" && handleAdd()} autoFocus />
                )}
                <Button appearance="primary" icon={<AddRegular />} onClick={handleAdd} disabled={adding || !url.trim()}>
                    {adding ? "..." : "Add"}
                </Button>
            </div>
            <div style={S.addForm}>
                <Button appearance="subtle" size="small" icon={<SearchRegular />} onClick={handleDiscover}
                    disabled={discovering || !url.trim()}>{discovering ? "Scanning..." : "Auto-discover feeds"}</Button>
            </div>
            {discoveredFeeds.map((f, i) => (
                <div key={i} style={S.discoverResult} onClick={() => handleAddDiscovered(f.url)}>
                    <div style={{ flex: 1 }}>
                        <div style={S.feedTitle}>{f.title}</div>
                        <div style={S.feedUrl}>{f.url}</div>
                    </div>
                    <Button appearance="primary" size="small" icon={<AddRegular />}>Add</Button>
                </div>
            ))}
            {error && <div style={{ ...S.hint, color: "var(--red)", marginBottom: 12 }}>{error}</div>}

            {feeds.length > 0 && (
                <>
                    <div style={{ display: "flex", alignItems: "center", marginTop: "32px", marginBottom: "12px" }}>
                        <div style={{ ...S.sectionTitle, marginBottom: 0 }}>Subscriptions</div>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: "12px", color: tokens.colorNeutralForeground4, marginRight: "12px" }}>
                            {feeds.length} feed{feeds.length > 1 ? "s" : ""}
                        </span>
                        <Button appearance="subtle" icon={<ArrowSyncRegular />} size="small" onClick={refreshAll}>Refresh All</Button>
                        <input ref={fileInputRef} type="file" accept=".opml,.xml" style={{ display: "none" }} onChange={handleOpmlImport} />
                        <Button appearance="subtle" size="small" onClick={() => fileInputRef.current?.click()}>Import</Button>
                        <Button appearance="subtle" size="small" onClick={handleOpmlExport}>Export</Button>
                    </div>
                    {(() => {
                        const grouped = new Map<string, typeof feeds>()
                        for (const f of feeds) {
                            const key = f.group_name || "Ungrouped"
                            if (!grouped.has(key)) grouped.set(key, [])
                            grouped.get(key)!.push(f)
                        }
                        const entries = Array.from(grouped.entries())
                        entries.sort(([a], [b]) => {
                            if (a === "Ungrouped" && b !== "Ungrouped") return -1
                            if (a !== "Ungrouped" && b === "Ungrouped") return 1
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
                                            <div style={S.feedCount}>{f.article_count} articles{f.unread_count > 0 ? ` (${f.unread_count} unread)` : ""}{f.error_count > 0 ? ` · ${f.error_count} errors` : ""}</div>
                                        </div>
                                        <select value={f.group_name} onChange={e => updateFeed(f.id, f.title, e.target.value)}
                                            style={{ fontSize: "12px", padding: "2px 6px", borderRadius: "4px",
                                                border: "1px solid var(--neutralLayer3)", backgroundColor: "var(--neutralLayer2)",
                                                color: tokens.colorNeutralForeground2, cursor: "pointer", maxWidth: "100px" }}>
                                            <option value="">Ungrouped</option>
                                            {existingGroups.filter(g => g !== f.group_name).map(g => <option key={g} value={g}>{g}</option>)}
                                            {f.group_name && f.group_name !== "Ungrouped" && !existingGroups.includes(f.group_name) && (
                                                <option value={f.group_name}>{f.group_name}</option>
                                            )}
                                        </select>
                                        <Button appearance="subtle" size="small" onClick={() => refreshFeed(f.id)}>Refresh</Button>
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
                    Paste a website URL or RSS feed above to subscribe
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

    useEffect(() => {
        window.settings.getThemeSettings().then(setTheme)
        window.settings.getFetchInterval().then(v => setFetchInterval(String(v)))
        window.settings.getLocaleSettings().then(setLanguage)
        window.settings.getFontSize().then(v => setFontSize(v))
        window.settings.getProxyStatus().then(setProxyEnabled)
        window.settings.getProxy().then(setProxyUrl)
        window.settings.getNotifyOnRefresh().then(setNotifyOnRefresh)
    }, [])

    return (
        <>
            <div style={S.sectionTitle}>Appearance</div>
            <div style={S.field}>
                <div style={S.label}>Language</div>
                <Select value={language} onChange={(_, d) => { setLanguage(d.value); window.settings.setLocaleSettings(d.value) }}>
                    {languages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
            </div>
            <div style={S.field}>
                <div style={S.label}>Theme</div>
                <RadioGroup value={theme} onChange={(_, d) => { setTheme(d.value); window.settings.setThemeSettings(d.value as ThemeSettings) }}>
                    <Radio value="system" label="Follow System" />
                    <Radio value="light" label="Light" />
                    <Radio value="dark" label="Dark" />
                </RadioGroup>
            </div>
            <div style={S.field}>
                <div style={S.label}>Reading Font Size</div>
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
                <div style={S.hint}>Title: {Math.round(fontSize * 1.5)}px · Body: {fontSize}px</div>
            </div>

            <div style={{ ...S.sectionTitle, marginTop: "32px" }}>Updates</div>
            <div style={S.field}>
                <div style={S.label}>Auto Refresh</div>
                <Select value={fetchInterval} onChange={(_, d) => { setFetchInterval(d.value); window.settings.setFetchInterval(Number(d.value)) }}>
                    {fetchIntervals.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
            </div>
            <div style={S.field}>
                <div style={S.label}>Refresh Notifications</div>
                <Switch checked={notifyOnRefresh} label={notifyOnRefresh ? "On" : "Off"}
                    onChange={(_, d) => { setNotifyOnRefresh(d.checked); window.settings.setNotifyOnRefresh(d.checked) }} />
                <div style={S.hint}>Notify when a feed refresh batch finishes</div>
            </div>

            <div style={{ ...S.sectionTitle, marginTop: "32px" }}>Network</div>
            <div style={S.field}>
                <div style={S.label}>PAC Proxy</div>
                <Switch checked={proxyEnabled} label={proxyEnabled ? "On" : "Off"}
                    onChange={(_, d) => { setProxyEnabled(d.checked); window.settings.setProxyEnabled(d.checked) }} />
                {proxyEnabled && (
                    <div style={{ ...S.row, marginTop: 8 }}>
                        <Input style={{ flex: 1 }} placeholder="PAC proxy URL" value={proxyUrl} onChange={(_, d) => setProxyUrl(d.value)} />
                        <Button size="small" onClick={() => window.settings.setProxy(proxyUrl)}>Apply</Button>
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
        if (url.includes(":")) { setError("Please fill in all required parameters (marked with a *)"); return }
        setError(""); setAddedMsg("")
        try {
            await addFeed(url, "RSSHub")
            setAddedMsg(`Added: ${url}`)
            setExpandedRoute(null)
        } catch (e) { setError(String(e)) }
    }

    const totalRoutes = React.useMemo(() =>
        Object.values(sites).reduce((n, s) => n + s.routes.length, 0), [sites])

    return (
        <>
            <div style={S.sectionTitle}>RSSHub</div>
            <div style={S.hint}>Browse RSSHub routes and subscribe with one click. 3000+ feeds across hundreds of sites.</div>

            <div style={{ ...S.row, margin: "12px 0" }}>
                <Input style={{ flex: 1 }} placeholder="RSSHub instance, e.g. https://rsshub.app"
                    value={instance} onChange={(_, d) => setInstance(d.value)} />
                <Button appearance="primary" icon={<ArrowSyncRegular />} onClick={loadRoutes}
                    disabled={loading || !instance.trim()}>{loading ? "Loading..." : "Load Routes"}</Button>
            </div>

            {error && <div style={{ fontSize: "12px", color: "#d32f2f", margin: "4px 0 10px" }}>{error}</div>}
            {addedMsg && <div style={{ fontSize: "12px", color: "#2e7d32", margin: "4px 0 10px" }}>{addedMsg}</div>}

            {Object.keys(sites).length > 0 && (
                <>
                    <div style={{ ...S.row, margin: "14px 0 10px" }}>
                        <Input style={{ flex: 1 }} placeholder="Search routes (site name or path)..." contentBefore={<SearchRegular />}
                            value={search} onChange={(_, d) => setSearch(d.value)} />
                        <span style={{ fontSize: "12px", color: tokens.colorNeutralForeground4 }}>
                            {siteEntries.length} sites · {totalRoutes} routes
                        </span>
                    </div>

                    {siteEntries.length === 0 && <div style={S.hint}>No routes match your search.</div>}

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
                                                                    onClick={() => handleAdd(r.path)}>Subscribe</Button>
                                                            ) : (
                                                                <>
                                                                    {ps.map(p => (
                                                                        <div key={p} style={{ marginBottom: "6px" }}>
                                                                            <div style={{ fontSize: "12px", fontWeight: 600, color: tokens.colorNeutralForeground2, marginBottom: "3px" }}>
                                                                                {p}{r.parameters?.[p] ? "" : " *"}
                                                                            </div>
                                                                            <Input size="small" style={{ width: "100%" }}
                                                                                placeholder={r.parameters?.[p] ?? `Enter ${p}`}
                                                                                value={paramVals[p] ?? ""}
                                                                                onChange={(_, d) => setParamVals(prev => ({ ...prev, [p]: d.value }))} />
                                                                        </div>
                                                                    ))}
                                                                    <div style={{ fontSize: "11px", color: tokens.colorNeutralForeground4, margin: "6px 0", wordBreak: "break-all" }}>{url}</div>
                                                                    <Button size="small" appearance="primary" icon={<AddRegular />}
                                                                        onClick={() => handleAdd(r.path)}>Subscribe</Button>
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
const AboutTab: React.FC = () => (
    <>
        <div style={S.sectionTitle}>About</div>
        <div style={S.aboutTitle}>Rust RSS Reader</div>
        <div style={S.aboutVer}>Version 0.1.0</div>
        <div style={S.aboutText}>A fast, native RSS reader — all data stored locally.</div>
        <div style={S.aboutTech}>Tauri v2 · React 19 · Fluent UI · SQLite</div>
    </>
)

// ═══ Main Settings ═══
const Settings: React.FC = () => {
    const display = useAppStore(s => s.settingsDisplay)
    const toggleSettings = useAppStore(s => s.toggleSettings)

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
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => toggleSettings(false)}>Back</Button>
                <div style={{ flex: 1 }} />
                <div style={S.headerTitle}>Settings</div>
                <div style={{ flex: 1 }} />
            </div>
            <div style={S.content}>
                <FeedsTab />
                <div style={{ ...S.sectionTitle, marginTop: "40px" }}>General</div>
                <GeneralTab />
                <div style={{ ...S.sectionTitle, marginTop: "40px" }}>RSSHub</div>
                <RssHubTab />
                <div style={{ ...S.sectionTitle, marginTop: "40px" }}>About</div>
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
