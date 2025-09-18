// scripts/test-proof.js - Updated with correct paths
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

async function testProof() {
  console.log("🧪 Testing ZK proof generation and verification...");

  try {
    // Input for the circuit
    const input = {
      voterId: 123,
      candidateId: 456,
      electionId: 789,
      salt: 999,
      nullifierHash: 12345,
      commitmentHash: 67890,
    };

    console.log("📝 Input:", input);

    // Check multiple possible WASM locations
    const possibleWasmPaths = [
      path.join(__dirname, "..", "build", "vote", "vote_js", "vote.wasm"),
      path.join(__dirname, "..", "build", "vote", "vote.wasm"),
      path.join(__dirname, "..", "build", "vote", "vote_cpp", "vote.wasm"),
    ];

    let wasmPath = null;
    for (const testPath of possibleWasmPaths) {
      if (fs.existsSync(testPath)) {
        wasmPath = testPath;
        console.log(`✅ Found WASM at: ${wasmPath}`);
        break;
      }
    }

    if (!wasmPath) {
      // List what's actually in the vote directory
      const voteDir = path.join(__dirname, "..", "build", "vote");
      if (fs.existsSync(voteDir)) {
        console.log("📁 Contents of build/vote:");
        const files = fs.readdirSync(voteDir, { withFileTypes: true });
        files.forEach((file) => {
          if (file.isDirectory()) {
            console.log(`   📁 ${file.name}/`);
            const subFiles = fs.readdirSync(path.join(voteDir, file.name));
            subFiles.forEach((subFile) => {
              console.log(`      📄 ${subFile}`);
            });
          } else {
            console.log(`   📄 ${file.name}`);
          }
        });
      }
      throw new Error("WASM file not found in any expected location");
    }

    const zkeyPath = path.join(
      __dirname,
      "..",
      "build",
      "vote",
      "vote_0001.zkey"
    );
    const vKeyPath = path.join(
      __dirname,
      "..",
      "build",
      "vote",
      "verification_key.json"
    );

    // Check if other files exist
    if (!fs.existsSync(zkeyPath))
      throw new Error(`ZKey file not found: ${zkeyPath}`);
    if (!fs.existsSync(vKeyPath))
      throw new Error(`Verification key not found: ${vKeyPath}`);

    // Generate proof
    console.log("🔐 Generating proof...");
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    console.log("✅ Proof generated successfully!");
    console.log("📊 Public signals:", publicSignals);

    // Verify proof
    console.log("🔍 Verifying proof...");
    const vKey = JSON.parse(fs.readFileSync(vKeyPath, "utf8"));
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    if (isValid) {
      console.log("✅ Proof verification: SUCCESS!");
      console.log("🎉 ZK proof system is working correctly!");

      // Save proof example
      const proofData = {
        proof,
        publicSignals,
        input: {
          // Only save non-sensitive public data
          nullifierHash: input.nullifierHash,
          commitmentHash: input.commitmentHash,
        },
      };

      fs.writeFileSync(
        path.join(__dirname, "..", "build", "example_proof.json"),
        JSON.stringify(proofData, null, 2)
      );

      console.log("💾 Example proof saved to build/example_proof.json");
    } else {
      console.log("❌ Proof verification: FAILED!");
      throw new Error("Proof verification failed");
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    throw error;
  }
}

if (require.main === module) {
  testProof()
    .then(() => {
      console.log("\n🎉 ZK proof test completed successfully!");
    })
    .catch((error) => {
      console.error("\n❌ ZK proof test failed:", error.message);
      process.exit(1);
    });
}

module.exports = { testProof };
