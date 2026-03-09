const fs = require("fs");
const path = require("path");

// Minimal valid 1x1 transparent PNG (68 bytes)
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const publicDir = path.join(__dirname, "..", "public");

try {
  const { createCanvas } = require("canvas");

  for (const size of [192, 512]) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#4a9eff";
    ctx.font = `bold ${Math.round(size * 0.45)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("G", size / 2, size / 2);
    fs.writeFileSync(path.join(publicDir, `icon-${size}.png`), canvas.toBuffer("image/png"));
  }
  console.log("Generated canvas-based icons");
} catch {
  fs.writeFileSync(path.join(publicDir, "icon-192.png"), PNG_1x1);
  fs.writeFileSync(path.join(publicDir, "icon-512.png"), PNG_1x1);
  console.log("Generated placeholder 1x1 PNG icons (canvas not available)");
}
