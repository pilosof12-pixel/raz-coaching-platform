import fs from "node:fs";

const indexPath = new URL("../public/index.html", import.meta.url);
let html = fs.readFileSync(indexPath, "utf8");
if (!html.includes('href="launch-mobile.css"')) {
  html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="launch-mobile.css">\n</head>');
}

// Program Pass gate must load before launch-controls so it can reserve the
// hidden pass field and prevent a second visible pass prompt on the final step.
if (!html.includes('src="program-pass-gate.js"')) {
  if (html.includes('<script src="clarification-controls.js"></script>')) {
    html = html.replace('<script src="clarification-controls.js"></script>', '<script src="program-pass-gate.js"></script>\n  <script src="clarification-controls.js"></script>');
  } else if (html.includes('<script src="launch-controls.js"></script>')) {
    html = html.replace('<script src="launch-controls.js"></script>', '<script src="program-pass-gate.js"></script>\n  <script src="launch-controls.js"></script>');
  } else {
    html = html.replace(/<\/body>/i, '  <script src="program-pass-gate.js"></script>\n</body>');
  }
}

// Clarification controls must be installed before launch-controls. launch-controls
// becomes the outer fetch wrapper that adds privacy consent / Program Pass data;
// clarification-controls can then retry the already-enriched request without
// duplicating analytics or commercial side effects.
if (!html.includes('src="clarification-controls.js"')) {
  if (html.includes('<script src="launch-controls.js"></script>')) {
    html = html.replace('<script src="launch-controls.js"></script>', '<script src="clarification-controls.js"></script>\n  <script src="launch-controls.js"></script>');
  } else {
    html = html.replace(/<\/body>/i, '  <script src="clarification-controls.js"></script>\n</body>');
  }
}
if (!html.includes('src="launch-controls.js"')) {
  html = html.replace(/<\/body>/i, '  <script src="launch-controls.js"></script>\n</body>');
}
fs.writeFileSync(indexPath, html);
console.log("launch runtime controls applied");
