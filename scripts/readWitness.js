const fs = require("fs");

const witness = JSON.parse(fs.readFileSync("build/vote/witness.json", "utf8"));

// witness[0] is always "1"
const nullifierHash = witness[1];
const commitmentHash = witness[2];
const valid = witness[3];

console.log("nullifierHash:", nullifierHash);
console.log("commitmentHash:", commitmentHash);
console.log("valid:", valid);
