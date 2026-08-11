import { useState, useEffect } from "react"

export interface AppWindowFocusChangeEvent extends CustomEvent<{ focused: boolean }> {
    type: "app-window-focus-change"
}

export const useIsBlurred = () => {
    const [blurred, setBlurred] = useState(false)
    useEffect(() => {
        window.utils.isFocused().then(focused => setBlurred(!focused))
        const onFocusChange = (e: AppWindowFocusChangeEvent) => { setBlurred(!e.detail.focused) }
        globalThis.addEventListener("app-window-focus-change", onFocusChange as EventListener)
        return () => { globalThis.removeEventListener("app-window-focus-change", onFocusChange as EventListener) }
    }, [])
    return blurred
}
