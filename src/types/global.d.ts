import type { settingsBridge } from "../bridges/settings"
import type { feedsBridge } from "../bridges/feeds"
import type { utilsBridge } from "../bridges/utils"
import type { aiBridge } from "../bridges/ai"
import type { rsshubBridge } from "../bridges/rsshub"

declare global {
    interface Window {
        settings: typeof settingsBridge
        feeds: typeof feedsBridge
        utils: typeof utilsBridge
        ai: typeof aiBridge
        rsshub: typeof rsshubBridge
    }
}
