# 🖼️ Image Dithering and Palette Compression Tool

This Node.js script converts a JPEG image into a compact binary format using a custom 7-color palette and Floyd–Steinberg dithering. The final output is stored as a `.bin` file with 2 pixels packed per byte.

---

## 📦 Features

- ✅ Resize input image to 600×448.
- ✅ Apply adjustable contrast correction.
- ✅ Apply Floyd–Steinberg dithering using a fixed 7-color palette.
- ✅ Encode two 3-channel pixels per byte using a 4-bit index.
- ✅ Output binary file ready for low-bandwidth or embedded display devices.

---

## 🎨 Palette

The script uses the following RGB color palette:

| Index | Color              |
|-------|--------------------|
| 0     | `[0, 0, 0]`        (Black)  |
| 1     | `[255, 255, 255]`  (White)  |
| 2     | `[0, 255, 0]`      (Green)  |
| 3     | `[0, 0, 255]`      (Blue)   |
| 4     | `[255, 0, 0]`      (Red)    |
| 5     | `[255, 255, 0]`    (Yellow) |
| 6     | `[255, 128, 0]`    (Orange) |

Each pixel is matched to the closest color in this palette and encoded as a 3-bit index. Two pixels are packed into one byte (`pix0 << 4 | pix1`).

---

## 🧰 Dependencies

Install required dependencies:

```bash
npm install sharp canvas
