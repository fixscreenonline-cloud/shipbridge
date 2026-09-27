import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<Mark size={size.width} />, size);
}

// Shared with apple-icon.tsx: navy square, hi-vis "SB" and a barcode strip.
export function Mark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#10243e",
        color: "#ffb020",
        fontSize: size * 0.42,
        fontWeight: 800,
        letterSpacing: -size * 0.01,
      }}
    >
      SB
      <div style={{ display: "flex", alignItems: "stretch", height: size * 0.08, marginTop: size * 0.02 }}>
        {[3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 3].map((w, i) => (
          <div
            key={i}
            style={{ width: size * 0.012 * w, marginRight: size * 0.012, background: i % 2 ? "#ffffff" : "#ffb020" }}
          />
        ))}
      </div>
    </div>
  );
}
