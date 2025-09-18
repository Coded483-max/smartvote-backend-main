// scripts/complete-rebuild.js
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

async function completeRebuild() {
  console.log("🔧 Complete ZKP rebuild starting...");

  const buildDir = path.join(__dirname, "..", "build");
  const voteDir = path.join(buildDir, "vote");

  try {
    // Step 1: Clean build directory
    console.log("🧹 Cleaning build directory...");
    if (fs.existsSync(voteDir)) {
      fs.rmSync(voteDir, { recursive: true, force: true });
    }
    fs.mkdirSync(voteDir, { recursive: true });

    // Step 2: Compile circuit
    console.log("📦 Compiling circuit...");
    await executeCommand(
      "circom circuits/vote.circom --r1cs --wasm --sym -o build/vote"
    );

    // Verify compilation
    const requiredFiles = ["vote.r1cs", "vote.sym", "vote.wasm"];
    for (const file of requiredFiles) {
      const filePath = path.join(voteDir, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Compilation failed: ${file} not generated`);
      }
      const stats = fs.statSync(filePath);
      console.log(`   ✅ ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    }

    // Step 3: Generate proving key
    console.log("🔐 Generating proving key...");
    await executeCommand(
      "npx snarkjs groth16 setup build/vote/vote.r1cs build/powersoftau.ptau build/vote/vote_0000.zkey"
    );

    // Step 4: Generate verification key
    console.log("🔑 Generating verification key...");
    await executeCommand(
      "npx snarkjs zkey export verificationkey build/vote/vote_0000.zkey build/vote/verification_key.json"
    );

    // Step 5: Verify files
    console.log("🔍 Verifying generated files...");
    const allFiles = [
      ...requiredFiles,
      "vote_0000.zkey",
      "verification_key.json",
    ];
    for (const file of allFiles) {
      const filePath = path.join(voteDir, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`   ✅ ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
      } else {
        console.log(`   ❌ ${file} (missing)`);
      }
    }

    // Step 6: Test proof generation
    console.log("🧪 Testing proof generation...");
    await testProofGeneration();

    console.log("🎉 Complete rebuild successful!");
  } catch (error) {
    console.error("❌ Rebuild failed:", error.message);
    throw error;
  }
}

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`🔨 Running: ${command}`);

    exec(
      command,
      { cwd: path.join(__dirname, "..") },
      (error, stdout, stderr) => {
        if (error) {
          console.error("❌ Command failed:", error.message);
          if (stderr) console.error("stderr:", stderr);
          reject(error);
        } else {
          if (stdout && stdout.trim()) {
            console.log("Output:", stdout.trim());
          }
          console.log("✅ Command completed");
          resolve();
        }
      }
    );
  });
}

async function testProofGeneration() {
  const snarkjs = require("snarkjs");
  const voteDir = path.join(__dirname, "..", "build", "vote");

  const input = {
    voterId: 123,
    candidateId: 456,
    electionId: 789,
    salt: 999,
    nullifierHash: 12345,
    commitmentHash: 67890,
  };

  try {
    const wasmPath = path.join(voteDir, "vote.wasm");
    const zkeyPath = path.join(voteDir, "vote_0000.zkey");
    const vkeyPath = path.join(voteDir, "verification_key.json");

    console.log("   🔐 Generating proof...");
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    console.log(`   📊 Public signals: [${publicSignals.join(", ")}]`);

    const vKey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    if (isValid) {
      console.log("   ✅ Proof verification: SUCCESS!");
    } else {
      console.log("   ❌ Proof verification: FAILED!");
      throw new Error("Proof verification failed after rebuild");
    }
  } catch (error) {
    console.error("   ❌ Test failed:", error.message);
    throw error;
  }
}

if (require.main === module) {
  completeRebuild()
    .then(() => {
      console.log("\n🎉 ZKP system is now working correctly!");
      console.log("Try running: npm run zkp:verify");
    })
    .catch((error) => {
      console.error("\n❌ Rebuild failed:", error.message);
      process.exit(1);
    });
}

module.exports = { completeRebuild };
