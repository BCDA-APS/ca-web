import { REGISTRY } from "./lib/deployment";
import { colors } from "./lib/theme";
import { PATH_STATUS } from "virtual:deployment-path-status";

function pick(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("deployment", id);
  window.location.assign(url.toString());
}

export function DeploymentPicker() {
  const deployments = Object.values(REGISTRY).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "rgb(222,222,227)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Liberation Sans, Arial, sans-serif",
      }}
    >
      <div style={{ width: 480, maxWidth: "90vw" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0a1828", margin: "0 0 6px" }}>
          Select a deployment
        </h1>
        <p style={{ fontSize: 13, color: colors.dim, margin: "0 0 20px" }}>
          Choose which beamline to connect to. Your choice is remembered, and you can deep-link
          with <code>?deployment=&lt;id&gt;</code>.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {deployments.map(d => {
            const missing = PATH_STATUS[d.id]?.missing ?? [];
            return (
              <li key={d.id}>
                <button
                  onClick={() => pick(d.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "#fff",
                    border: `1px solid ${colors.relatedBorder}`,
                    borderRadius: 6,
                    padding: "12px 16px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#0a1828" }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: colors.dim, marginTop: 2 }}>
                    id: {d.id} · pvws: {d.pvws.socket}
                  </div>
                  {missing.length > 0 && (
                    <div
                      style={{ fontSize: 12, color: colors.statusWarn, marginTop: 4 }}
                      title={missing.join(", ")}
                    >
                      {missing.length} external path{missing.length === 1 ? "" : "s"} unreachable on this host
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
