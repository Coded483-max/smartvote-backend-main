const fs = require("fs");
const snarkjs = require("snarkjs");

async function validateInput(r1csFile, inputFile) {
  // Load circuit
  const r1cs = await snarkjs.r1cs.load(r1csFile);
  const signals = r1cs.nVars > 0 ? Object.keys(r1cs.signals) : [];

  const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));

  // Only check signals that are declared as input
  const inputSignals = Object.entries(r1cs.signals)
    .filter(([_, sig]) => sig.flags.isInput)
    .map(([k, _]) => k);

  console.log("🔍 Circuit expects inputs:", inputSignals);

  for (const sig of inputSignals) {
    if (!(sig in data)) {
      console.error(`❌ Missing required signal: ${sig}`);
      process.exit(1);
    }

    const val = data[sig];

    if (Array.isArray(val)) {
      console.error(`❌ Signal ${sig} should be a single value, but got array`);
      process.exit(1);
    }

    if (typeof val !== "string" && typeof val !== "number") {
      console.error(
        `❌ Signal ${sig} should be string/number, got ${typeof val}`
      );
      process.exit(1);
    }
  }

  console.log("✅ Input file is valid!");
}

// Example usage
validateInput("build/vote/vote.r1cs", "vote_input.json");
