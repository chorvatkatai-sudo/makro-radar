import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const dir = path.resolve("dashboard");
const mime = { ".html":"text/html",".js":"text/javascript",".json":"application/json" };
http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/")p="/index.html";
  fs.readFile(path.join(dir,p),(e,d)=>{ if(e){res.writeHead(404);res.end("404");return;} res.writeHead(200,{"Content-Type":mime[path.extname(p)]||"text/plain"});res.end(d);}); }).listen(8377,()=>console.log("up"));
