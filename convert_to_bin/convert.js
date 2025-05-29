const fs = require("fs");
const sharp = require("sharp");
const { createCanvas, ImageData } = require("canvas");

const INPUT_FILE = "input.jpg";
const OUTPUT_FILE = "output.bin";
const WIDTH = 600;
const HEIGHT = 448;

const PALETTE = [
  [0, 0, 0],
  [255, 255, 255],
  [0, 255, 0],
  [0, 0, 255],
  [255, 0, 0],
  [255, 255, 0],
  [255, 128, 0],
];

const contrastLevel = 25;

function contrastImage(imgData, contrast) {
  let d = imgData.data;
  contrast = (contrast / 100) + 1;
  const intercept = 128 * (1 - contrast);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * contrast + intercept;
    d[i + 1] = d[i + 1] * contrast + intercept;
    d[i + 2] = d[i + 2] * contrast + intercept;
  }
  return imgData;
}

function distToPixel(r, g, b, color) {
  return Math.abs(r - color[0]) + Math.abs(g - color[1]) + Math.abs(b - color[2]);
}

function findClosestPaletteColor(r, g, b) {
  let minDist = Infinity;
  let closest = PALETTE[0];
  for (const color of PALETTE) {
    const dist = distToPixel(r, g, b, color);
    if (dist < minDist) {
      minDist = dist;
      closest = color;
    }
  }
  return closest;
}

function addToPixel(pixels, width, x, y, quantError, fraction) {
  if (x < 0 || y < 0 || x >= width || y >= pixels.height) return;
  const i = (y * width + x) * 4;
  for (let c = 0; c < 3; c++) {
    pixels.data[i + c] = Math.min(255, Math.max(0, pixels.data[i + c] + quantError[c] * fraction));
  }
}

function dither(imgData) {
  const width = imgData.width;
  const height = imgData.height;
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const oldR = data[i];
      const oldG = data[i + 1];
      const oldB = data[i + 2];

      const [newR, newG, newB] = findClosestPaletteColor(oldR, oldG, oldB);

      data[i] = newR;
      data[i + 1] = newG;
      data[i + 2] = newB;

      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      const quantError = [errR, errG, errB];
      const ditherLevel = 16;
      addToPixel(imgData, width, x + 1, y, quantError, 7 / ditherLevel);
      addToPixel(imgData, width, x - 1, y + 1, quantError, 3 / ditherLevel);
      addToPixel(imgData, width, x, y + 1, quantError, 5 / ditherLevel);
      addToPixel(imgData, width, x + 1, y + 1, quantError, 1 / ditherLevel);
    }
  }

  return imgData;
}

function colorsEqual(c1, c2) {
  return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2];
}

function rgb2bit(r, g, b) {
  for (let i = 0; i < PALETTE.length; i++) {
    if (colorsEqual(PALETTE[i], [r, g, b])) {
      return i;
    }
  }
  throw new Error(`Color RGB [${r}, ${g}, ${b}] not found in pallet.`);
}

(async () => {
  try {
    const { data, info } = await sharp(INPUT_FILE)
      .resize(WIDTH, HEIGHT)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    let imgData = new ImageData(Uint8ClampedArray.from(data), info.width, info.height);
    imgData = contrastImage(imgData, contrastLevel);
    imgData = dither(imgData);

    const d = imgData.data;
    const output = [];

    for (let i = 0; i < d.length; i += 8) {
      const pix0 = rgb2bit(d[i], d[i + 1], d[i + 2]);
      const pix1 = rgb2bit(d[i + 4], d[i + 5], d[i + 6]);
      const byte = (pix0 << 4) | pix1;
      output.push(byte);
    }

    fs.writeFileSync(OUTPUT_FILE, Buffer.from(output));
    console.log(`File ${OUTPUT_FILE} saved.`);
  } catch (err) {
    console.error("Error in image conversion:", err);
  }
})();
