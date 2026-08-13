import { useMemo } from "react"
import { useAppStore } from "../store"
import { makeT } from "./translations"

/** React binding: exposes the current locale, a setter, and a t() translate function. */
export function useI18n() {
    const locale = useAppStore(s => s.locale)
    const setLocale = useAppStore(s => s.setLocale)
    const t = useMemo(() => makeT(locale), [locale])
    return { locale, setLocale, t }
}
