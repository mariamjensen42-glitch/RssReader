import { invoke } from "@tauri-apps/api/core"

export const rsshubBridge = {
    /** Fetch the route directory JSON from an RSSHub instance (Rust-side, cached 5 min). */
    fetchRoutes: (instance: string): Promise<string> => invoke("fetch_rsshub_routes", { instance }),
}

export default rsshubBridge
