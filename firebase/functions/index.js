/* eslint-disable */ 
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sharp = require("sharp");
const {ImageData} = require("canvas");
const BusBoy = require('busboy');
const os = require('os');
const path = require('path');
const fs = require('fs');

admin.initializeApp();
const AUTH_TOKEN ="";
const db = admin.firestore();

const PALETTE = [
    [0, 0, 0],
    [255, 255, 255],
    [0, 255, 0],
    [0, 0, 255],
    [255, 0, 0],
    [255, 255, 0],
    [255, 128, 0],
];

const contrastLevel = 60;
const height = 448;
const width = 600;

const startDateStr = "2025-01-25";
const startDate = 25


function isAuthorized(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader === `Bearer ${AUTH_TOKEN}`;
}

function contrastImage(imgData, contrast) {
  let d = imgData.data;
  contrast = (contrast/100) + 1;
  const intercept = 128 * (1 - contrast);
  for (let i=0; i<d.length; i+=4) {
    d[i] = d[i]*contrast + intercept;
    d[i+1] = d[i+1]*contrast + intercept;
    d[i+2] = d[i+2]*contrast + intercept;
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
  throw new Error(`Color RGB [${r}, ${g}, ${b}] not found on pallet.`);
}

function distToPixel2(r, g, b, color) {
    return Math.abs(r - color[0]) + Math.abs(g - color[1]) + Math.abs(b - color[2]);
}

function distToPixel(r, g, b, color) {
  function rgb2xyz(r, g, b) {
    r /= 255; g /= 255; b /= 255;

    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    return [x, y, z];
  }

  function xyz2lab(x, y, z) {
    const refX = 0.95047, refY = 1.00000, refZ = 1.08883;
    x /= refX; y /= refY; z /= refZ;

    x = x > 0.008856 ? Math.cbrt(x) : (7.787 * x) + (16 / 116);
    y = y > 0.008856 ? Math.cbrt(y) : (7.787 * y) + (16 / 116);
    z = z > 0.008856 ? Math.cbrt(z) : (7.787 * z) + (16 / 116);

    const l = (116 * y) - 16;
    const a = 500 * (x - y);
    const b_ = 200 * (y - z);
    return [l, a, b_];
  }

  function rgb2lab(r, g, b) {
    const [x, y, z] = rgb2xyz(r, g, b);
    return xyz2lab(x, y, z);
  }

  function adjustContrast(r, g, b, factor = 1.2) {
    const mid = 128;
    r = Math.min(255, Math.max(0, (r - mid) * factor + mid));
    g = Math.min(255, Math.max(0, (g - mid) * factor + mid));
    b = Math.min(255, Math.max(0, (b - mid) * factor + mid));
    return [r, g, b];
  }

  // Apply contrast adjustment  
  const [rc, gc, bc] = adjustContrast(r, g, b, 1.2);
  const [L1, A1, B1] = rgb2lab(rc, gc, bc);
  const [L2, A2, B2] = rgb2lab(color[0], color[1], color[2]);

  return (L1 - L2) ** 2 + (A1 - A2) ** 2 + (B1 - B2) ** 2;
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
        data[i + 3] = 255;
  
        const errR = oldR - newR;
        const errG = oldG - newG;
        const errB = oldB - newB;
  
        const quantError = [errR, errG, errB];
        const ditherLevel = 16;
        // Floyd-Steinberg Dithering 
        addToPixel(imgData, width, x + 1, y, quantError, 7 / ditherLevel);
        addToPixel(imgData, width, x - 1, y + 1, quantError, 3 / ditherLevel);
        addToPixel(imgData, width, x, y + 1, quantError, 5 / ditherLevel);
        addToPixel(imgData, width, x + 1, y + 1, quantError, 1 / ditherLevel);
      }
    }
  
    return imgData;
}

async function overlayIcon(baseBuffer, iconBuffer) {
    const base = sharp(baseBuffer);
    const baseMetadata = await base.metadata();
  
    const icon = sharp(iconBuffer);
    const iconTargetWidth = Math.floor(baseMetadata.width * 0.1);
    const resizedIconBuffer = await icon.resize({ width: iconTargetWidth, withoutEnlargement: true }).toBuffer();
    const iconMetadata = await sharp(resizedIconBuffer).metadata();
  
    const iconTop = 0;
    const iconLeft = baseMetadata.width - iconMetadata.width;
  
    return await base
      .composite([{ input: resizedIconBuffer, top: iconTop, left: iconLeft }])
      .png()
      .toBuffer();
}

async function overlayMessage(inputBuffer) {
    const now = new Date();
    const start = new Date(startDateStr);
  
    const yearDiff = now.getFullYear() - start.getFullYear();
    const monthDiff = now.getMonth() - start.getMonth();
    const totalMonths = yearDiff * 12 + monthDiff;
  
    const isMensagemVisivel = now.getDate() === startDate && totalMonths >= 0;
  
    if (!isMensagemVisivel) return inputBuffer;
  
    const message = totalMonths >= 12
      ? (monthDiff === 0
        ? `Feliz ${yearDiff} ano${yearDiff > 1 ? 's' : ''}`
        : `Feliz ${yearDiff} ano${yearDiff > 1 ? 's' : ''} e ${monthDiff} mes${monthDiff > 1 ? 'es' : ''}`)
      : `Feliz ${totalMonths} mes${totalMonths > 1 ? 'es' : ''}`;
  
    const base = sharp(inputBuffer);
    const metadata = await base.metadata();
  
    const fontSize = 16;
    const padding = 5;
    const textY = metadata.height - 20;
    const rectHeight = fontSize + padding;
    const rectY = textY - fontSize + padding * 2;
  
    const svg = `
      <svg width="${metadata.width}" height="${metadata.height}">
        <style>
          .msg {
            fill: red;
            font-size: ${fontSize}px;
            font-family: sans-serif;
            text-anchor: middle;
            dominant-baseline: hanging;
          }
        </style>
        <rect x="${(metadata.width - metadata.width * 0.55) / 2}" y="${rectY}" width="${metadata.width * 0.55}" height="${rectHeight}" fill="white" />
        <text x="${metadata.width / 2}" y="${textY}" class="msg">${message}</text>
      </svg>
    `;
  
    return await base.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}
  

exports.getImages = functions.https.onRequest(async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({error: "Unauthorized"});
  }
  const [files] = await admin.storage().bucket().getFiles({
    prefix: "images/",
  });
  const fileNames = files.map((file)=> file.name.replace("images/", ""));
  res.json({images: fileNames});
});

exports.getImageUrl = functions.https.onRequest(async (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  
    const imageName = req.query.name;
    const deviceId = req.query.id;
  
    if (!imageName || !deviceId) {
      return res.status(400).json({ error: "Missing image name or deviceId" });
    }
  
    try {
      const file = admin.storage().bucket().file(`images/${imageName}`);
      const [buffer] = await file.download();
  
      // Busca último status de bateria
      const statusSnapshot = await admin.firestore()
        .collection('deviceStatus')
        .where('deviceId', '==', deviceId)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
  
      let batteryPercent = 0;
      console.log(statusSnapshot.docs[0]);
      if (!statusSnapshot.empty) {
        const data = statusSnapshot.docs[0].data();
        
        batteryPercent = (data.percent !== undefined && data.percent !== null) ? data.percent : 100;
      }
      
      let processedBuffer;
  
      if (batteryPercent < 10) {
        const iconFile = admin.storage().bucket().file(`icons/battery.png`);
        const [iconBuffer] = await iconFile.download();
  
        // First redimensioning the base image
        const baseSharp = sharp(buffer)
            .resize(width, height)
            .ensureAlpha();
        const baseResizedBuffer = await baseSharp.toBuffer();
  
        // Overlay the icon on the resized base image
        processedBuffer = await overlayIcon(baseResizedBuffer, iconBuffer);
      } else {
        // If battery is above 10%, just resize the image
        processedBuffer = await sharp(buffer)
            .resize(width, height)
            .ensureAlpha()
            .png()
            .toBuffer();
      }
  
      // Now overlay the message
      processedBuffer = await overlayMessage(processedBuffer);
  
      // Now we can apply the contrast and dithering
      const rawBufferWithInfo = await sharp(processedBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });
  
      const { data, info } = rawBufferWithInfo;
  
      const imgData = new ImageData(Uint8ClampedArray.from(data), info.width, info.height);
      const contrasted = contrastImage(imgData, contrastLevel);
      const dithered = dither(contrasted);
      const d = dithered.data;
      const byteLength = d.length / 8;
  
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", byteLength);
  
      for (let i = 0; i < d.length; i += 8) {
        const pix0 = rgb2bit(d[i], d[i + 1], d[i + 2]);
        const pix1 = rgb2bit(d[i + 4], d[i + 5], d[i + 6]);
        const byte = (pix0 << 4) | pix1;
        res.write(Buffer.from([byte]));
      }
  
      res.end();
  
    } catch (err) {
      console.error(err);
      res.status(500).send("Failed to process image");
    }
  });
  

exports.listImages = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
    if (req.method === "OPTIONS") {
      res.status(204).send('');
      return;
    }
  
    try {
      const bucket = admin.storage().bucket();
      const [files] = await bucket.getFiles({ prefix: "images/" });
  
      const images = files.map(file => ({
        name: file.name.replace("images/", ""),
        url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`
      }));
  
      res.json({ images });
    } catch (error) {
      console.error(error);
      res.status(500).send("Erro ao listar imagens");
    }
  });
  
  exports.deleteImage = functions.https.onRequest(async (req, res) => {
    // Tratamento de CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
    if (req.method === "OPTIONS") {
      res.status(204).send('');
      return;
    }
  
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }
  
    const { imageName } = req.body;
    if (!imageName) {
      return res.status(400).send("The 'imageName' field is required.");
    }
  
    console.log("Deleting the image:", imageName);
  
    try {
      await admin.storage().bucket().file(`images/${imageName}`).delete();
      res.status(200).json({ message: "Image deleted" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error on delete image" });
    }
  });
  
  exports.uploadImage = functions.https.onRequest(async (req, res) => {
    // Tratamento de CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
    if (req.method === "OPTIONS") {
      res.status(204).send('');
      return;
    }
  
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }
  
    const busboy = new BusBoy({ headers: req.headers });
    const tmpdir = os.tmpdir();
  
    let uploadData = null;
  
    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      if (!mimetype.startsWith("image/")) {
        return res.status(400).send("The file must be an image.");
      }
  
      const filepath = path.join(tmpdir, filename);
      uploadData = { filepath, mimetype };
      file.pipe(fs.createWriteStream(filepath));
    });
  
    busboy.on("finish", async () => {
      if (!uploadData) {
        return res.status(400).send("No file uploaded.");
      }
  
      const destination = `images/${path.basename(uploadData.filepath)}`;
      try {
        await admin.storage().bucket().upload(uploadData.filepath, {
          destination,
          metadata: {
            contentType: uploadData.mimetype,
          },
        });
        fs.unlinkSync(uploadData.filepath); // Remove the file from the temporary directory
        res.status(200).json({ message: "Upload done with success!", path: destination });
      } catch (error) {
        console.error(error);
        res.status(500).send("Error uploading the image.");
      }
    });
  
    busboy.end(req.rawBody);
  });

  exports.uploadStatus = functions.https.onRequest(async (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  
    try {
      const { deviceId, voltage, percent } = req.body;
  
      if (!deviceId || voltage == null || percent == null) {
        return res.status(400).send("Missing required fields: deviceId, voltage, or percent.");
      }
  
      const timestamp = new Date();
  
      // 1. Add the new status to the Firestore collection
      await db.collection("deviceStatus").add({
        deviceId,
        voltage,
        percent,
        timestamp,
      });
  
      // 2. Verify the total number of documents in the collection
      const snapshot = await db.collection("deviceStatus")
        .orderBy("timestamp", "desc") // newest first
        .get();
  
      const totalDocs = snapshot.size;
  
      // 3. If more than 300 documents, delete the oldest ones
      if (totalDocs > 300) {
        // Take the oldest documents (after the most recent 300)
        const docsToDelete = snapshot.docs.slice(300);
  
        const batch = db.batch();
  
        docsToDelete.forEach(doc => {
          batch.delete(doc.ref);
        });
  
        await batch.commit();
      }
  
      return res.status(200).send("Status saved with success.");
    } catch (err) {
      console.error(err);
      return res.status(500).send("Internal error");
    }
  });
  