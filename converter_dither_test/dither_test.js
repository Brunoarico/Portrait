/* eslint-disable */
const fs = require("fs");
const sharp = require("sharp");
const { ImageData } = require("canvas");

const inputPath = "1.jpg";
const outputPath = "1_dither.jpg";

const contrastLevel = -10;

const PALETTE = [
  [0, 0, 0],
  [255, 255, 255],
  [0  , 128, 0  ], //green
  [0, 0, 128],
  [128, 0, 0],
  [128, 128, 0],
  [255, 128, 0],
];


function colorsEqual(c1, c2) {
  return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2];
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
      data[i + 3] = 255;

      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      const quantError = [errR, errG, errB];

      // Floyd-Steinberg Dithering 
      addToPixel(imgData, width, x + 1, y, quantError, 7 / 16);
      addToPixel(imgData, width, x - 1, y + 1, quantError, 3 / 16);
      addToPixel(imgData, width, x, y + 1, quantError, 5 / 16);
      addToPixel(imgData, width, x + 1, y + 1, quantError, 1 / 16);
    }
  }

  return imgData;
}


(async () => {
  try {
    const buffer = fs.readFileSync(inputPath);

    const { data, info } = await sharp(buffer)
      .resize(600, 448)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const imgData = new ImageData(Uint8ClampedArray.from(data), info.width, info.height);

    const contrasted = contrastImage(imgData, contrastLevel);
    const dithered = dither(contrasted);

    const outBuffer = await sharp(Buffer.from(dithered.data), {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4,
      },
    }).toFormat("jpeg").toBuffer();

    fs.writeFileSync(outputPath, outBuffer);
    console.log("Dithered image saved as:", outputPath);
  } catch (err) {
    console.error("Error in image processing:", err);
  }
})();
