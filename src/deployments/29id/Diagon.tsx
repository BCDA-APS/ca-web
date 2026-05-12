import { pvwsWriter } from "../../lib/pvwsWriter";
import { colors, fontSize } from "../../lib/theme";
import { MotorGrid } from "../../widgets/MotorGrid";

function openUi(file: string, macros: Record<string, string>, label: string) {
  window.dispatchEvent(new CustomEvent("open-ui", { detail: { file, macros, label } }));
}

const camBtn: React.CSSProperties = {
  background: "rgb(115,223,255)", color: "#000",
  border: "1px solid #4ab0d0", borderRadius: 3,
  padding: "2px 0", fontSize: fontSize.label,
  cursor: "pointer", fontFamily: "sans-serif", whiteSpace: "nowrap",
  width: 52, textAlign: "center",
};

const outBtn: React.CSSProperties = {
  background: "rgb(115,255,107)", color: "#000",
  border: "1px solid #50cc50", borderRadius: 3,
  padding: "2px 8px", fontSize: fontSize.label,
  cursor: "pointer", fontFamily: "sans-serif",
};

const trigBtn: React.CSSProperties = {
  background: "rgb(255,58,58)", color: "#fff",
  border: "1px solid #cc2020", borderRadius: 3,
  padding: "2px 8px", fontSize: fontSize.label,
  cursor: "pointer", fontFamily: "sans-serif",
};

export function Diagon() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button style={camBtn}
            onClick={() => openUi("/ui/29id/29id_cam_ADAravis.ui", { "P": "29id_arv8:", "R": "cam1:" }, "H-Cam")}>
            H-Cam
          </button>
          <button style={outBtn}    onClick={() => pvwsWriter.write("29idb:H-Diagon_OUT_Trigger.PROC",    1)}>OUT</button>
          <button style={trigBtn}   onClick={() => pvwsWriter.write("29idb:H-Diagon_Si-2800_Trigger.PROC", 1)}>Si-2800</button>
          <button style={trigBtn}   onClick={() => pvwsWriter.write("29idb:H-Diagon_ML-400_Trigger.PROC",  1)}>ML-400</button>
          <button style={trigBtn}   onClick={() => pvwsWriter.write("29idb:H-Diagon_ML-460_Trigger.PROC",  1)}>ML-460</button>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button style={camBtn}
            onClick={() => openUi("/ui/29id/29id_cam_ADAravis.ui", { "P": "29id_arv1:", "R": "cam1:" }, "V-Cam")}>
            V-Cam
          </button>
          <button style={outBtn}    onClick={() => pvwsWriter.write("29idb:V-Diagon_OUT_Trigger.PROC",    1)}>OUT</button>
          <button style={trigBtn}   onClick={() => pvwsWriter.write("29idb:V-Diagon_Si-2800_Trigger.PROC", 1)}>Si-2800</button>
          <button style={trigBtn}   onClick={() => pvwsWriter.write("29idb:V-Diagon_ML-400_Trigger.PROC",  1)}>ML-400</button>
          <button style={trigBtn}   onClick={() => pvwsWriter.write("29idb:V-Diagon_ML-460_Trigger.PROC",  1)}>ML-460</button>
        </div>
      </div>
      <MotorGrid prefix="29idb:" motors={["m3", "m4", "m8"]} columns={3} softLimitPrec={3} />
    </div>
  );
}
