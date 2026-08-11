import {
    LabelState,
    makeStyles,
    mergeClasses,
    Theme,
    tokens,
    TreeItemLayoutState,
    webDarkTheme,
    webLightTheme,
} from "@fluentui/react-components"
import { CustomStyleHooksContextValue_unstable } from "@fluentui/react-shared-contexts"

export const customLightTheme: Theme = {
    ...webLightTheme,
    colorSubtleBackgroundLightAlphaHover: "#0001",
    colorSubtleBackgroundLightAlphaPressed: "#0002",
}

export const customDarkTheme: Theme = {
    ...webDarkTheme,
    colorNeutralBackground1: "#1f1f1f",
    colorSubtleBackgroundLightAlphaHover: "#fff1",
    colorSubtleBackgroundLightAlphaPressed: "#fff1",
}

export function createAppTheme(isDarkTheme: boolean, fontFamily: string): Theme {
    const baseTheme = isDarkTheme ? customDarkTheme : customLightTheme
    return { ...baseTheme, fontFamilyBase: fontFamily }
}

const useTreeItemLayoutStyles = makeStyles({
    root: { cursor: "default" },
    iconBefore: { paddingRight: tokens.spacingHorizontalS },
})
const useLabelStyles = makeStyles({
    root: { userSelect: "none" },
})

export const CUSTOM_STYLE_HOOKS = {
    useTreeItemLayoutStyles_unstable: (state: TreeItemLayoutState) => {
        const styles = useTreeItemLayoutStyles()
        state.root.className = mergeClasses(state.root.className, styles.root)
        if (state.iconBefore != null) {
            state.iconBefore.className = mergeClasses(state.iconBefore.className, styles.iconBefore)
        }
    },
    useLabelStyles_unstable: (state: LabelState) => {
        const styles = useLabelStyles()
        state.root.className = mergeClasses(state.root.className, styles.root)
    },
} as CustomStyleHooksContextValue_unstable
