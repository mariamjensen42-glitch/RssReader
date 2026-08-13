import * as React from "react"
import { useAppStore } from "../store"
import { useI18n } from "../i18n"
import { tokens, Button, Input } from "@fluentui/react-components"
import { TagRegular, DismissRegular } from "@fluentui/react-icons"

const S = {
    page: {
        padding: "24px 32px",
        maxWidth: "800px", margin: "0 auto",
    } as React.CSSProperties,
    header: {
        display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px",
    } as React.CSSProperties,
    title: { fontSize: "22px", fontWeight: 700, color: tokens.colorNeutralForeground1 } as React.CSSProperties,
    grid: {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "8px",
    } as React.CSSProperties,
    card: {
        display: "flex", alignItems: "center", gap: "10px",
        padding: "12px 16px", borderRadius: "8px",
        backgroundColor: "var(--neutralLayer1)",
        cursor: "pointer", transition: "background 0.1s",
    } as React.CSSProperties,
    cardHover: { backgroundColor: "var(--neutralLayer1Hover)" } as React.CSSProperties,
    tagIcon: { color: tokens.colorBrandForeground1, flexShrink: 0 } as React.CSSProperties,
    tagName: { fontSize: "14px", fontWeight: 500, color: tokens.colorNeutralForeground1, flex: 1 } as React.CSSProperties,
    tagCount: { fontSize: "12px", color: tokens.colorNeutralForeground4 } as React.CSSProperties,
    search: { marginBottom: "16px", maxWidth: "400px" } as React.CSSProperties,
    empty: {
        display: "flex", flexDirection: "column" as const, alignItems: "center",
        justifyContent: "center", padding: "60px 0",
        color: tokens.colorNeutralForeground4, gap: "8px",
    } as React.CSSProperties,
}

const TagPage: React.FC = () => {
    const tags = useAppStore(s => s.tags)
    const tagId = useAppStore(s => s.tagId)
    const selectTag = useAppStore(s => s.selectTag)
    const { t } = useI18n()
    const [search, setSearch] = React.useState("")

    const filtered = React.useMemo(() => {
        const sorted = [...tags].sort((a, b) => b.article_count - a.article_count)
        if (!search.trim()) return sorted
        const q = search.toLowerCase()
        return sorted.filter(t => t.name.toLowerCase().includes(q))
    }, [tags, search])

    return (
        <div style={S.page}>
            <div style={S.header}>
                <TagRegular fontSize={22} />
                <span style={S.title}>{t("tags.title")}</span>
                <span style={{ fontSize: "13px", color: tokens.colorNeutralForeground4 }}>
                    {t("tags.total", { count: tags.length })}
                </span>
            </div>

            {tags.length > 0 && (
                <div style={S.search}>
                    <Input
                        placeholder={t("tags.filter")}
                        value={search}
                        onChange={(_, d) => setSearch(d.value)}
                    />
                </div>
            )}

            {tags.length === 0 && (
                <div style={S.empty}>
                    <TagRegular fontSize={36} opacity={0.3} />
                    <div>{t("tags.empty")}</div>
                </div>
            )}

            {tags.length > 0 && filtered.length === 0 && (
                <div style={S.empty}>
                    <div>{t("tags.noMatch", { query: search })}</div>
                </div>
            )}

            <div style={S.grid}>
                {filtered.map(tag => (
                    <TagCard
                        key={tag.id}
                        tag={tag}
                        active={tagId === tag.id}
                        onClick={() => selectTag(tag.id, tag.name)}
                    />
                ))}
            </div>
        </div>
    )
}

const TagCard: React.FC<{
    tag: { id: number; name: string; article_count: number }
    active: boolean
    onClick: () => void
}> = ({ tag, active, onClick }) => {
    const [hover, setHover] = React.useState(false)
    return (
        <div
            style={{
                ...S.card,
                ...(hover ? S.cardHover : {}),
                ...(active ? { outline: `2px solid ${tokens.colorBrandForeground1}`, outlineOffset: "-2px" } : {}),
            }}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <TagRegular style={S.tagIcon} fontSize={16} />
            <span style={S.tagName}>{tag.name}</span>
            <span style={S.tagCount}>{tag.article_count}</span>
        </div>
    )
}

export default TagPage
