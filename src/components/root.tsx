import * as React from "react"
import { useAppStore } from "../store"
import Page from "./page"
import { Menu } from "./menu"
import Nav from "./nav"
import Settings from "./settings"
import { FluentProvider, makeStyles } from "@fluentui/react-components"
import { useEffect, useMemo, useState } from "react"
import { CustomStyleHooksProvider_unstable as CustomStyleHooksProvider } from "@fluentui/react-shared-contexts"
import { CUSTOM_STYLE_HOOKS, createAppTheme } from "./utils/theme"
import { getFontFamilyForLocale } from "../scripts/settings"

const useClasses = makeStyles({
    root: { height: "100%" },
})

const Root: React.FC = () => {
    const closeContextMenu = useAppStore(s => s.closeContextMenu)
    const locale = useAppStore(s => s.locale) || "en-US"

    const classes = useClasses()
    const [isDarkMode, setIsDarkMode] = useState(() => 
        window.matchMedia("(prefers-color-scheme: dark)").matches
    )

    useEffect(() => {
        window.settings.shouldUseDarkColors().then(setDark => setIsDarkMode(setDark))
        window.settings.addThemeUpdateListener(shouldDark => { setIsDarkMode(shouldDark) })
    }, [])

    const v9Theme = useMemo(
        () => createAppTheme(isDarkMode, getFontFamilyForLocale(locale)),
        [isDarkMode, locale]
    )

    return (
        <FluentProvider theme={v9Theme} className={classes.root}>
            <CustomStyleHooksProvider value={CUSTOM_STYLE_HOOKS}>
                <div id="root" key={locale} onMouseDown={closeContextMenu}>
                    <Nav />
                    <Page />
                    <Menu />
                    <Settings />
                </div>
            </CustomStyleHooksProvider>
        </FluentProvider>
    )
}

export default Root
