# 🖼️ Node.js Dithering Tool with Floyd-Steinberg Algorithm

This project applies **Floyd-Steinberg dithering** using a custom color palette on a JPEG input image, powered by Node.js, [sharp](https://github.com/lovell/sharp), and [canvas](https://github.com/Automattic/node-canvas).

---

## ✨ Features

- Resizes the input image to 600x448
- Applies contrast adjustment
- Applies Floyd-Steinberg dithering
- Uses a limited color palette:
  - Black
  - White
  - Green
  - Dark Blue
  - Dark Red
  - Olive (Dark Yellow)
  - Orange

---

## 📦 Requirements

- Node.js v14 or newer
- NPM dependencies:

```bash
npm install sharp canvas
