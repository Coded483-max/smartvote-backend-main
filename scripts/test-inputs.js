// scripts/test-inputs.js
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

async function testInputs() {
  console.log("🧪 Testing different inputs...");

  const voteDir = path.join(__dirname, "..", "build", "vote");
  const wasmPath = path.join(voteDir, "vote.wasm");
  const zkeyPath = path.join(voteDir, "vote_0000.zkey");
  const vkeyPath = path.join(voteDir, "verification_key.json");

  const testCases = [
    {
      name: "All positive",
      input: {
        voterId: 123,
        candidateId: 456,
        electionId: 789,
        salt: 999,
        nullifierHash: 12345,
        commitmentHash: 67890,
      },
    },
    {
      name: "Small positive",
      input: {
        voterId: 1,
        candidateId: 1,
        electionId: 1,
        salt: 1,
        nullifierHash: 1,
        commitmentHash: 1,
      },
    },
    {
      name: "Large numbers",
      input: {
        voterId: 999999,
        candidateId: 888888,
        electionId: 777777,
        salt: 555555,
        nullifierHash: 444444,
        commitmentHash: 333333,
      },
    },
  ];

  const vKey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));

  for (const testCase of testCases) {
    try {
      console.log(`\n🔍 Testing: ${testCase.name}`);
      console.log("Input:", testCase.input);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        testCase.input,
        wasmPath,
        zkeyPath
      );

      console.log("Public signals:", publicSignals);

      // Check if first signal (valid) is 1
      if (publicSignals[0] === "1") {
        console.log("✅ Circuit outputs valid=1");

        const isValid = await snarkjs.groth16.verify(
          vKey,
          publicSignals,
          proof
        );
        console.log(`Verification: ${isValid ? "✅ SUCCESS" : "❌ FAILED"}`);

        if (isValid) {
          console.log("🎉 Found working input combination!");
          return testCase.input;
        }
      } else {
        console.log(
          `❌ Circuit outputs valid=${publicSignals[0]} (should be 1)`
        );
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log("\n💡 All tests failed - circuit needs to be fixed");
  return null;
}

if (require.main === module) {
  testInputs()
    .then((workingInput) => {
      if (workingInput) {
        console.log("\n🎉 Working input found:", workingInput);
      } else {
        console.log("\n🔧 Need to fix the circuit to output valid=1");
      }
    })
    .catch(console.error);
}

module.exports = { testInputs };
