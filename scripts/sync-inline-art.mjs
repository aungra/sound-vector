import fs from "node:fs";
import path from "node:path";

const htmlPath = "MUSIC MEMORY FITTING ROOM.html";
let html = fs.readFileSync(htmlPath, "utf8");
const ids = ["t-01", "t-02", "t-03"];

const entries = ids
  .map((id) => {
    const svg = fs
      .readFileSync(path.join("images", `${id}.svg`), "utf8")
      .replace(/\n/g, "")
      .replace(/`/g, "\\`");
    return `      "${id}": \`${svg}\``;
  })
  .join(",\n");

html = html.replace(
  /    const inlineArt = \{[\s\S]*?\n    \};/,
  `    const inlineArt = {\n${entries}\n    };`
);

fs.writeFileSync(htmlPath, html);
console.log("inline art synced");
