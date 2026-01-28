const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const session = require("express-session");
const path = require("path");

const app = express();
const upload = multer({ dest: "/tmp" });

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BASE_URL = process.env.BASE_URL;

// 🔐 LOGIN CREDS (change if you want)
const ADMIN_USER = "admin";
const ADMIN_PASS = "12345";

app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "tg-upload-secret",
    resave: false,
    saveUninitialized: false,
  })
);

/* ================= LOGIN ================= */

app.get("/login", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Login</title>
<style>
body{background:#0f172a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh}
.card{background:#020617;padding:30px;border-radius:12px;width:300px}
input,button{width:100%;padding:10px;margin-top:10px;border-radius:6px;border:none}
button{background:#2563eb;color:#fff;font-weight:bold}
</style>
</head>
<body>
<div class="card">
<h2>Admin Login</h2>
<form method="POST" action="/login">
<input name="username" placeholder="Username" required />
<input name="password" type="password" placeholder="Password" required />
<button>Login</button>
</form>
</div>
</body>
</html>
`);
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = true;
    return res.redirect("/");
  }
  res.send("❌ Invalid Login");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

/* ============== AUTH MIDDLEWARE ============== */
function auth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

/* ================= UI ================= */

app.get("/", auth, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Telegram Storage</title>
<style>
body{background:#020617;color:#e5e7eb;font-family:sans-serif}
.container{max-width:400px;margin:80px auto;background:#020617;padding:25px;border-radius:14px;box-shadow:0 0 20px #000}
button{background:#22c55e;border:none;padding:10px;width:100%;color:#000;font-weight:bold;border-radius:8px}
input{width:100%;margin:10px 0}
a{color:#38bdf8;word-break:break-all}
.progress{height:6px;background:#1e293b;border-radius:10px;overflow:hidden;margin-top:10px}
.bar{height:6px;width:0;background:#22c55e}
</style>
</head>
<body>
<div class="container">
<h2>Telegram Storage</h2>
<form id="form">
<input type="file" name="file" required />
<button>Upload</button>
</form>
<div class="progress"><div class="bar" id="bar"></div></div>
<div id="result"></div>
<br><a href="/logout">Logout</a>
</div>

<script>
const form=document.getElementById("form");
form.onsubmit=e=>{
e.preventDefault();
const data=new FormData(form);
const xhr=new XMLHttpRequest();
xhr.open("POST","/upload");
xhr.upload.onprogress=e=>{
document.getElementById("bar").style.width=(e.loaded/e.total*100)+"%";
};
xhr.onload=()=>{document.getElementById("result").innerHTML=xhr.responseText;}
xhr.send(data);
};
</script>
</body>
</html>
`);
});

/* ================= UPLOAD ================= */

app.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    const originalName = req.file.originalname;

    const form = new FormData();
    form.append("chat_id", CHANNEL_ID);
    form.append("document", fs.createReadStream(req.file.path), originalName);

    const tg = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders() }
    );

    fs.unlinkSync(req.file.path);

    const fileId = tg.data.result.document.file_id;
    const fileName = tg.data.result.document.file_name;

    const link = `${BASE_URL}/download/${fileId}?name=${encodeURIComponent(fileName)}`;

    res.send(`
      <p>✅ Upload Success</p>
      <a href="${link}" target="_blank">${link}</a>
      <br><button onclick="navigator.clipboard.writeText('${link}')">Copy Link</button>
    `);

  } catch (e) {
    res.send("❌ Upload Failed");
  }
});

/* ================= DOWNLOAD ================= */

app.get("/download/:fileId", async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const fileName = req.query.name || "file";

    const tg = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );

    const tgUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tg.data.result.file_path}`;
    const temp = `/tmp/${fileName}`;

    const r = await axios({ url: tgUrl, responseType: "stream" });
    const w = fs.createWriteStream(temp);
    r.data.pipe(w);

    w.on("finish", () => {
      res.download(temp, fileName, () => fs.unlinkSync(temp));
    });

  } catch {
    res.send("❌ Download Failed");
  }
});

app.listen(5000, () => console.log("Server running"));
