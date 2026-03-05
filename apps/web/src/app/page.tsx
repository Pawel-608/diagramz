export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>Diagramz</h1>
      <p>AI-powered diagrams, instantly shareable. No signup required.</p>
      <p style={{ color: "#666" }}>
        Create diagrams via REST API or MCP, get a shareable link with a full
        canvas editor.
      </p>
    </main>
  );
}
