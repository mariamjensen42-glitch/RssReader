import React from "react"

interface Props { children: React.ReactNode }
interface State { hasError: boolean; error: Error | null }

class ErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false, error: null }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("ErrorBoundary:", error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", height: "100vh", padding: "32px",
                    color: "var(--neutralPrimary)", fontFamily: "system-ui, sans-serif", textAlign: "center",
                }}>
                    <h2 style={{ fontWeight: 600, marginBottom: "12px" }}>Something went wrong</h2>
                    <p style={{ color: "var(--neutralSecondary)", maxWidth: "480px", lineHeight: 1.6 }}>
                        {this.state.error?.message || "An unexpected error occurred"}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{
                            marginTop: "20px", padding: "8px 20px", border: "none",
                            borderRadius: "6px", background: "var(--brandPrimary)",
                            color: "#fff", cursor: "pointer", fontSize: "14px",
                        }}
                    >
                        Try Again
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

export default ErrorBoundary
