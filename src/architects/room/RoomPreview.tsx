// Placeholder until the 3D renderer lands: the blueprint as swatches and words.
import type { Blueprint } from "../types";

export default function RoomPreview({ blueprint: bp }: { blueprint: Blueprint; walk: boolean; onExit: () => void }) {
  return (
    <div className="ch-room-wait" style={{ background: `radial-gradient(circle at 50% 40%, ${bp.palette.secondary}, ${bp.palette.fog})` }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {Object.values(bp.palette).map((c, i) => (
          <span key={i} style={{ width: 22, height: 22, borderRadius: 11, background: c, border: "1px solid #fff3" }} />
        ))}
      </div>
      <div>{bp.archetype ?? "no shape yet"}</div>
      <div style={{ opacity: 0.6 }}>{bp.mood.join(" · ")}</div>
    </div>
  );
}
