import fs from "node:fs";

const indexPath = new URL("../public/index.html", import.meta.url);
let html = fs.readFileSync(indexPath, "utf8");
if (!html.includes('href="launch-mobile.css"')) {
  html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="launch-mobile.css">\n</head>');
}
if (!html.includes('src="launch-controls.js"')) {
  html = html.replace(/<\/body>/i, '  <script src="launch-controls.js"></script>\n</body>');
}
fs.writeFileSync(indexPath, html);
console.log("launch runtime controls applied");
