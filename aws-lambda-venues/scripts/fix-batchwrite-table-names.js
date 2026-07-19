const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "src", "updateVenueHandler.js");
let s = fs.readFileSync(filePath, "utf8");
const before = s;

const replacements = [
  [/RequestItems:\s*\{\s*\n(\s*)Venue_Element:/g, "RequestItems: {\n$1[TABLES.VENUE_ELEMENT()]:"],
  [/RequestItems:\s*\{\s*\n(\s*)Venue_Seat:/g, "RequestItems: {\n$1[TABLES.VENUE_SEAT()]:"],
  [/RequestItems:\s*\{\s*\n(\s*)Venue_Category:/g, "RequestItems: {\n$1[TABLES.VENUE_CATEGORY()]:"],
  [/RequestItems:\s*\{\s*\n(\s*)Venue_Floor:/g, "RequestItems: {\n$1[TABLES.VENUE_FLOOR()]:"],
  [/RequestItems:\s*\{\s*\n(\s*)Venue_Gate:/g, "RequestItems: {\n$1[TABLES.VENUE_GATE()]:"],
  [/dynamoBatchWriteParallel\(\s*["']Venue_Seat["']/g, "dynamoBatchWriteParallel(TABLES.VENUE_SEAT()"],
  [/dynamoBatchWriteParallel\(\s*["']Venue_Element["']/g, "dynamoBatchWriteParallel(TABLES.VENUE_ELEMENT()"],
  [/dynamoBatchWriteParallel\(\s*["']Venue_Category["']/g, "dynamoBatchWriteParallel(TABLES.VENUE_CATEGORY()"],
];

for (const [re, to] of replacements) {
  s = s.replace(re, to);
}

// CORS on error responses
s = s.replace(
  /return \{\s*statusCode: 500,\s*headers: \{ "Content-Type": "application\/json" \},\s*body: JSON\.stringify\(\{\s*error: "Internal server error",/m,
  `return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Internal server error",`,
);

if (s === before) {
  console.error("NO CHANGES applied");
  process.exit(1);
}

fs.writeFileSync(filePath, s);
const leftover = [...s.matchAll(/RequestItems:\s*\{[^}"]{0,80}Venue_(Element|Seat|Category|Floor|Gate)\s*:/g)];
const leftoverParallel = [...s.matchAll(/dynamoBatchWriteParallel\(\s*["']Venue_/g)];
console.log("leftover RequestItems", leftover.length);
console.log("leftover parallel", leftoverParallel.length);
console.log("patched", filePath);
