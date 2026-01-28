const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const session = require("express-session");
const path = require("path");

const app = express();

const upload = multer({
  dest: "/tmp",
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB Telegram limit
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BASE_URL = process.env.BASE_URL;

const ADMIN_USER = "admin";
const ADMIN_PASS = "12345";

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "tg-storage",
  resave: false,
  saveUninitialized: false
}));

/* ================= AUTH ================= */
function auth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

/* ================= LOGIN ================= */
app.get("/login", (_, res) => {
  res.send(`
<style>
body{background:#020617;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh}
.box{background:#020617;padding:30px;border-radius:14px;width:280px}
input,button{width:100%;margin-top:10px;padding:10px;border-radius:8px;border:none}
button{background:#22c55e;font-weight:bold}
</style>
<form class="box" method="POST">
<h2>Login</h2>
<input name="username" required placeholder="Username">
<input type="password" name="password" required placeholder="Password">
<button>Login</button>
</form>
`);
});

app.post("/login", (req, res) => {
  if (req.body.username === ADMIN_USER && req.body.password === ADMIN_PASS) {
    req.session.user = true;
    return res.redirect("/");
  }
  res.send("❌ Invalid login");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

/* ================= UI ================= */
app.get("/", auth, (_, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{background:#020617;color:#e5e7eb;font-family:sans-serif}
.card{max-width:380px;margin:80px auto;padding:24px;border-radius:16px;background:#020617;box-shadow:0 0 30px #000}
button{background:#22c55e;border:none;padding:12px;width:100%;border-radius:12px;font-weight:bold}
input{width:100%;margin:12px 0}
.progress{height:8px;background:#1e293b;border-radius:10px;overflow:hidden}
.bar{height:8px;width:0;background:linear-gradient(90deg,#22c55e,#4ade80)}
small{opacity:.8}
a{color:#38bdf8;word-break:break-all}
</style>
</head>
<body>
<div class="card">
<h2>Telegram Storage</h2>
<form id="form">
<input type="file" name="file" required>
<button>Upload</button>
</form>
<div class="progress"><div class="bar" id="bar"></div></div>
<small id="info"></small>
<div id="result"></div>
<br><a href="/logout">Logout</a>
</div>

<script>
const form=document.getElementById("form");
const bar=document.getElementById("bar");
const info=document.getElementById("info");
const result=document.getElementById("result");

form.onsubmit=e=>{
e.preventDefault();
bar.style.width="0%";
info.textContent="Starting...";
result.innerHTML="";

const data=new FormData(form);
const xhr=new XMLHttpRequest();
const start=Date.now();

xhr.upload.onprogress=e=>{
if(e.lengthComputable){
const percent=(e.loaded/e.total*100).toFixed(1);
bar.style.width=percent+"%";

const time=(Date.now()-start)/1000;
const speed=(e.loaded/1024/1024/time).toFixed(2);
info.textContent=\`\${percent}% • \${speed} MB/s\`;
}
};

xhr.onload=()=>result.innerHTML=xhr.responseText;
xhr.open("POST","/upload");
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
    const form = new FormData();
    form.append("chat_id", CHANNEL_ID);
    form.append("document", fs.createReadStream(req.file.path), req.file.originalname);

    const tg = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders(), maxBodyLength: Infinity }
    );

    fs.unlinkSync(req.file.path);

    const fileId = tg.data.result.document.file_id;
    const name = tg.data.result.document.file_name;

    const link = `${BASE_URL}/download/${fileId}?name=${encodeURIComponent(name)}`;

    res.send(`
<p>✅ Upload Success</p>
<a href="${link}" target="_blank">${link}</a>
<br><button onclick="navigator.clipboard.writeText('${link}')">Copy Link</button>
`);
  } catch {
    res.send("❌ Upload Failed");
  }
});

/* ================= DOWNLOAD ================= */
app.get("/download/:id", async (req, res) => {
  try {
    const fileId = req.params.id;
    const name = req.query.name || "file";

    const tg = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );

    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${tg.data.result.file_path}`;
    const stream = await axios({ url, responseType: "stream" });

    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    stream.data.pipe(res);
  } catch {
    res.send("❌ Download Failed");
  }
});

app.listen(5000, () => console.log("🔥 Telegram Storage Running"));
