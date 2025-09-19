const fs = require("fs");

function validateInput(inputFile, circuitSignals) {
  const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));

  for (const sig of circuitSignals) {
    if (!(sig in data)) {
      console.error(`❌ Missing required signal: ${sig}`);
      process.exit(1);
    }

    const val = data[sig];

    // Arrays are only valid if circuit expects multiple values
    if (Array.isArray(val)) {
      console.error(`❌ Signal ${sig} should be a single value, but got array`);
      process.exit(1);
    }

    // Big numbers should be strings
    if (typeof val !== "string" && typeof val !== "number") {
      console.error(
        `❌ Signal ${sig} should be string/number, got ${typeof val}`
      );
      process.exit(1);
    }
  }

  console.log("✅ Input file is valid!");
}

// Example usage for your VoteProof circuit
const signals = [
  "voterId",
  "candidateId",
  "electionId",
  "salt",
  "nullifierHash",
  "commitmentHash",
];

validateInput("vote_input.json", signals);
