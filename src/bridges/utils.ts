import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow, getAllWindows } from "@tauri-apps/api/window"
import { WindowStateListenerType, TouchBarTexts, ImageCallbackTypes } from "../schema-types"

export const utilsBridge = {
    platform: (() => {
        const ua = navigator.userAgent
        if (ua.includes("Win")) return "win32"
        if (ua.includes("Mac")) return "darwin"
        return "linux"
    })(),

    getVersion: (): Promise<string> => invoke("get_version"),

    openExternal: (url: string, background = false) => {
        window.open(url, "_blank")
    },

    showErrorBox: (title: string, content: string) => {
        alert(`${title}\n\n${content}`)
    },

    showMessageBox: async (
        title: string,
        message: string,
        confirm: string,
        cancel: string,
        defaultCancel = false,
        _type = "none"
    ): Promise<boolean> => {
        const result = window.confirm(`${title}\n\n${message}`)
        return result
    },

    showSaveDialog: async (_filters: any[], _path: string) => null,
    showOpenDialog: async (_filters: any[]) => null,

    getCacheSize: async (): Promise<number> => 0,
    clearCache: async () => {},

    addMainContextListener: (_callback: (pos: [number, number], text: string) => any) => {},
    addWebviewContextListener: (_callback: (pos: [number, number], text: string, url: string) => any) => {},
    imageCallback: (_type: ImageCallbackTypes) => {},
    addWebviewKeydownListener: (_callback: (event: any) => any) => {},
    addWebviewErrorListener: (_callback: (reason: string) => any) => {},

    writeClipboard: (text: string) => {
        navigator.clipboard.writeText(text)
    },

    closeWindow: () => getCurrentWindow().close(),
    minimizeWindow: () => getCurrentWindow().minimize(),
    maximizeWindow: () => getCurrentWindow().toggleMaximize(),
    isMaximized: async (): Promise<boolean> => {
        try { return await getCurrentWindow().isMaximized() }
        catch { return false }
    },
    isFullscreen: async (): Promise<boolean> => {
        try { return await getCurrentWindow().isFullscreen() }
        catch { return false }
    },
    isFocused: async (): Promise<boolean> => {
        try { return await getCurrentWindow().isFocused() }
        catch { return true }
    },
    focus: () => getCurrentWindow().setFocus(),
    requestAttention: () => {},

    addWindowStateListener: (callback: (type: WindowStateListenerType, state: boolean) => any) => {
        const w = getCurrentWindow()
        // TODO: proper Tauri event handling for window state changes
    },

    addTouchBarEventsListener: (_callback: (arg: { key: string }) => any) => {},
    initTouchBar: (_texts: TouchBarTexts) => {},
    destroyTouchBar: () => {},
    initFontList: async (): Promise<Array<string>> => [],
}

export default utilsBridge
