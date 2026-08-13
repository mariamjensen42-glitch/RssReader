import * as React from "react"
import { useEffect, useState } from "react"
import { useAppStore } from "../store"
import { useI18n } from "../i18n"
import { ViewType } from "../schema-types"
import { makeStyles, mergeClasses } from "@fluentui/react-components"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"
import { FlatButtonSeparator } from "./utils/FlatButtonSeparator"
import { useIsBlurred } from "./utils/hooks/useIsBlurred"
import { getCurrentWindow } from "@tauri-apps/api/window"
import {
    ArrowSyncRegular, CheckmarkCircleRegular,
    EyeRegular, SettingsRegular, NavigationRegular,
    SubtractRegular, SquareRegular, DismissRegular, ArrowLeftRegular,
    AppsListRegular, TextBulletListRegular, GridRegular, PanelRightRegular,
    FilterRegular,
} from "@fluentui/react-icons"

const useClasses = makeStyles({
    navBlurred: { "--black": "var(--neutralSecondaryAlt)" },
    navBtn: { height: "var(--navHeight)", zIndex: 1, position: "relative" },
    navBtnSystem: { position: "relative", zIndex: 10 },
    navBtnSystemItemOn: { color: "var(--whiteConstant)" },
    navBtnMinimize: { fontSize: "12px" },
    navGroupFirst: { marginLeft: "72px" },
    navGroupRight: { marginLeft: "auto" },
    spin: {
        animationName: {
            from: { transform: "rotate(0deg)" },
            to: { transform: "rotate(360deg)" },
        },
        animationDuration: "1s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
})

const Nav: React.FC = () => {
    const classes = useClasses()
    const title = useAppStore(s => s.title)
    const settingsDisplay = useAppStore(s => s.settingsDisplay)
    const viewType = useAppStore(s => s.viewType)
    const feedId = useAppStore(s => s.feedId)
    const itemShown = useAppStore(s => s.itemId !== null)
    const toggleMenu = useAppStore(s => s.toggleMenu)
    const toggleSettings = useAppStore(s => s.toggleSettings)
    const refreshAll = useAppStore(s => s.refreshAll)
    const refreshing = useAppStore(s => s.refreshing)
    const markAllRead = useAppStore(s => s.markAllRead)
    const backToList = useAppStore(s => s.backToList)
    const onlyUnread = useAppStore(s => s.onlyUnread)
    const toggleUnread = useAppStore(s => s.toggleUnread)
    const { t } = useI18n()

    const [maximized, setMaximized] = useState(false)
    const isBlurred = useIsBlurred()
    const isDarwin = window.utils.platform === "darwin"

    useEffect(() => {
        getCurrentWindow().isMaximized().then(setMaximized)
        const p = getCurrentWindow().onResized(() => getCurrentWindow().isMaximized().then(setMaximized))
        return () => { p.then(f => f()) }
    }, [])

    useEffect(() => {
        let t: ReturnType<typeof setInterval> | null = null
        let currentInterval = 0

        const setupInterval = async () => {
            const v = await window.settings.getFetchInterval()
            if (v === currentInterval) return
            currentInterval = v
            if (t) clearInterval(t)
            if (v > 0) t = setInterval(() => refreshAll(), v * 60 * 1000)
        }
        setupInterval()
        // Poll for changes every 10 seconds (lightweight)
        const poll = setInterval(setupInterval, 10000)
        return () => { if (t) clearInterval(t); clearInterval(poll) }
    }, [])

    const minimize = () => getCurrentWindow().minimize()
    const maximize = () => getCurrentWindow().toggleMaximize()
    const close = () => getCurrentWindow().close()
    const menu = () => toggleMenu()
    const settings = () => toggleSettings(!settingsDisplay)

    const [viewMenuOpen, setViewMenuOpen] = useState(false)
    const viewBtnRef = React.useRef<HTMLDivElement>(null)

    const setView = (v: ViewType) => {
        useAppStore.setState({ viewType: v })
        window.settings.setDefaultView(v)
        setViewMenuOpen(false)
    }

    const viewLabel = viewType === ViewType.Cards ? t("nav.viewCards") : viewType === ViewType.List ? t("nav.viewList") : viewType === ViewType.Magazine ? t("nav.viewMagazine") : t("nav.viewThreeColumn")
    const isNonNavButtonShown = !settingsDisplay
    const firstGroup = isDarwin ? classes.navGroupFirst : undefined
    const systemItemOn = itemShown ? classes.navBtnSystemItemOn : undefined

    const cn = [
        settingsDisplay && "hide-btns",
        isBlurred && classes.navBlurred,
    ].filter(Boolean).join(" ")

    return (
        <nav className={cn} data-tauri-drag-region>
            {isNonNavButtonShown && (
                <FlatButtonGroup styleClass={firstGroup}>
                {itemShown ? (
                    <FlatButton styleClass={classes.navBtn} title={t("nav.back")} onClick={backToList}>
                        <ArrowLeftRegular fontSize={16} />
                    </FlatButton>
                ) : (
                        <FlatButton styleClass={classes.navBtn} title={t("nav.menu")} onClick={menu}>
                            <NavigationRegular fontSize={16} />
                        </FlatButton>
                    )}
                </FlatButtonGroup>
            )}

            <span className="title">{title}</span>

            <FlatButtonGroup styleClass={classes.navGroupRight}>
                {isNonNavButtonShown && (
                    <>
                        <FlatButton styleClass={classes.navBtn} title={t("nav.refreshAll")} disabled={refreshing} onClick={() => refreshAll()}>
                            <ArrowSyncRegular fontSize={16} className={refreshing ? classes.spin : undefined} />
                        </FlatButton>
                        <FlatButton styleClass={classes.navBtn} title={t("nav.markAllRead")}
                            onClick={() => markAllRead(feedId ?? undefined)}>
                            <CheckmarkCircleRegular fontSize={16} />
                        </FlatButton>
                        <FlatButton styleClass={classes.navBtn}
                            title={onlyUnread ? t("nav.showAll") : t("nav.unreadOnly")}
                            onClick={toggleUnread}>
                            <FilterRegular fontSize={16}
                                style={onlyUnread ? { color: "#4f6bed" } : undefined} />
                        </FlatButton>
                        <FlatButton styleClass={classes.navBtn} title={t("nav.view", { view: viewLabel })}
                            onClick={() => setViewMenuOpen(!viewMenuOpen)}>
                            <EyeRegular fontSize={16} />
                        </FlatButton>
                        {viewMenuOpen && (
                            <div style={{
                                position: "absolute", top: "var(--navHeight)", right: isDarwin ? undefined : "112px",
                                backgroundColor: "var(--neutralLayer1)", border: "1px solid var(--neutralLayer3)",
                                borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                zIndex: 20, minWidth: "130px", padding: "4px", overflow: "hidden",
                            }}>
                                {[ViewType.Cards, ViewType.List, ViewType.Magazine, ViewType.Compact].map(v => {
                                    const label = v === ViewType.Cards ? t("nav.viewCards") : v === ViewType.List ? t("nav.viewList") : v === ViewType.Magazine ? t("nav.viewMagazine") : t("nav.viewThreeColumn")
                                    const icon = v === ViewType.Cards ? <AppsListRegular /> : v === ViewType.List ? <TextBulletListRegular /> : v === ViewType.Magazine ? <GridRegular /> : <PanelRightRegular />
                                    const active = v === viewType
                                    return (
                                        <div key={v} onClick={() => setView(v)} style={{
                                            padding: "7px 12px", fontSize: "13px", cursor: "pointer",
                                            borderRadius: "4px", userSelect: "none", display: "flex", alignItems: "center", gap: "8px",
                                            backgroundColor: active ? "var(--neutralLayer3)" : "transparent",
                                            color: active ? "var(--black)" : "var(--neutralSecondary)",
                                            fontWeight: active ? 600 : 400,
                                        }}>
                                            <span style={{ fontSize: "16px", opacity: 0.7 }}>{icon}</span>
                                            {label}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {viewMenuOpen && (
                            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 19 }}
                                onClick={() => setViewMenuOpen(false)} />
                        )}
                        <FlatButton styleClass={classes.navBtn} title={t("nav.settings")} onClick={settings}>
                            <SettingsRegular fontSize={16} />
                        </FlatButton>
                    </>
                )}
                {!isDarwin && (
                    <>
                        <FlatButtonSeparator />
                        <FlatButton variant="system"
                            styleClass={mergeClasses(classes.navBtn, classes.navBtnSystem, classes.navBtnMinimize, systemItemOn)}
                            title={t("nav.minimize")} onClick={minimize}>
                            <SubtractRegular fontSize={12} />
                        </FlatButton>
                        <FlatButton variant="system"
                            styleClass={mergeClasses(classes.navBtn, classes.navBtnSystem, systemItemOn)}
                            title={t("nav.maximize")} onClick={maximize}>
                            {maximized
                                ? <DismissRegular fontSize={11} style={{ transform: "rotate(45deg)" }} />
                                : <SquareRegular fontSize={10} />}
                        </FlatButton>
                        <FlatButton variant="close"
                            styleClass={mergeClasses(classes.navBtn, classes.navBtnSystem, systemItemOn)}
                            title={t("nav.close")} onClick={close}>
                            <DismissRegular fontSize={14} />
                        </FlatButton>
                    </>
                )}
            </FlatButtonGroup>
        </nav>
    )
}

export default Nav
