import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import ErrorBoundary from "./components/ErrorBoundary"
import settingsBridge from "./bridges/settings"
import utilsBridge from "./bridges/utils"
import feedsBridge from "./bridges/feeds"
import aiBridge from "./bridges/ai"
import "./styles/global.css"

window.settings = settingsBridge
window.utils = utilsBridge
window.feeds = feedsBridge
window.ai = aiBridge

// Add platform class for OS-specific styling (e.g. body.win32 border)
document.body.classList.add(window.utils.platform)

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
