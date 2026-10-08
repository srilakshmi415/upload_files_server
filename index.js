const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 43670;
// Public address the device will use to reach this server (IP or domain, no trailing slash).
// e.g. PUBLIC_BASE_URL=http://172.188.83.251:43670
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  // Short random id keeps the AT command URL short; .par extension kept on disk.
  filename: (req, file, cb) => cb(null, crypto.randomBytes(4).toString("hex") + ".par"),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".par") {
      return cb(new Error("Only .par files are allowed"));
    }
    cb(null, true);
  },
});

// 1) Upload a .par file (multipart/form-data, field name "file")
app.post("/api/v1/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded (use field name 'file')" });

    const id = path.basename(req.file.filename, ".par");
    const downloadUrl = `${PUBLIC_BASE_URL}/api/v1/fota/${id}`;

    res.json({
      success: true,
      id,
      originalName: req.file.originalname,
      size: req.file.size,
      downloadUrl,
      atCommand: `AT+QFOTADL="${downloadUrl}"`,
    });
  });
});

// 2) Download endpoint the module hits via AT+QFOTADL
app.get("/api/v1/fota/:id", (req, res) => {
  const { id } = req.params;
  if (!/^[a-f0-9]{8}$/.test(id)) return res.status(404).send("Not found");

  const filePath = path.join(UPLOAD_DIR, `${id}.par`);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

  // Raw binary with Content-Length and Range support (resume) — what the module expects.
  res.sendFile(filePath, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${id}.par"`,
    },
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Public base URL: ${PUBLIC_BASE_URL}`);
});
