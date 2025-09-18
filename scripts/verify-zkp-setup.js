// scripts/verify-zkp-setup.js - Updated for your file structure
const fs = require("fs");
const path = require("path");

function verifyZKPSetup() {
  console.log("🔍 Verifying ZKP setup...");

  const buildDir = path.join(__dirname, "..", "build");
  const voteDir = path.join(buildDir, "vote");

  // Check both possible locations for WASM file
  const wasmPath1 = path.join(voteDir, "vote_js", "vote.wasm");
  const wasmPath2 = path.join(voteDir, "vote.wasm");
  const wasmPath = fs.existsSync(wasmPath1) ? wasmPath1 : wasmPath2;

  // Required files for ZKP to work
  const requiredFiles = [
    {
      path: path.join(buildDir, "powersoftau.ptau"),
      name: "Powers of Tau",
      minSize: 1024 * 1024 * 4, // 4MB minimum
    },
    {
      path: path.join(voteDir, "vote.r1cs"),
      name: "Circuit R1CS",
      minSize: 100,
    },
    {
      path: path.join(voteDir, "vote.sym"),
      name: "Circuit Symbols",
      minSize: 10,
    },
    {
      path: wasmPath,
      name: "Circuit WASM",
      minSize: 1000,
    },
    {
      path: path.join(voteDir, "vote_0000.zkey"),
      name: "Proving Key",
      minSize: 1000,
    },
    {
      path: path.join(voteDir, "verification_key.json"),
      name: "Verification Key",
      minSize: 100,
    },
  ];

  let allFilesValid = true;
  const results = [];

  console.log("\n📁 Checking required files:");

  requiredFiles.forEach((file) => {
    const exists = fs.existsSync(file.path);
    let valid = false;
    let size = 0;

    if (exists) {
      const stats = fs.statSync(file.path);
      size = stats.size;
      valid = size >= file.minSize;
    }

    const status = exists && valid ? "✅" : "❌";
    const sizeStr = size > 0 ? `(${(size / 1024).toFixed(1)} KB)` : "(missing)";

    console.log(`  ${status} ${file.name}: ${sizeStr}`);

    results.push({
      name: file.name,
      exists,
      valid,
      size,
      path: file.path,
    });

    if (!exists || !valid) {
      allFilesValid = false;
    }
  });

  // Check verification key content
  if (results.find((r) => r.name === "Verification Key")?.exists) {
    try {
      const vkPath = path.join(voteDir, "verification_key.json");
      const vkContent = JSON.parse(fs.readFileSync(vkPath, "utf8"));

      if (
        vkContent.protocol &&
        vkContent.curve &&
        vkContent.nPublic !== undefined
      ) {
        console.log("  ✅ Verification Key: Valid JSON structure");
        console.log(`     - Protocol: ${vkContent.protocol}`);
        console.log(`     - Curve: ${vkContent.curve}`);
        console.log(`     - Public inputs: ${vkContent.nPublic}`);
      } else {
        console.log("  ❌ Verification Key: Invalid structure");
        allFilesValid = false;
      }
    } catch (error) {
      console.log("  ❌ Verification Key: Invalid JSON");
      allFilesValid = false;
    }
  }

  console.log("\n" + "=".repeat(50));

  if (allFilesValid) {
    console.log("🎉 ZKP Setup Verification: SUCCESS!");
    console.log("✅ All required files are present and valid");
    console.log("🔐 Your ZKP system is ready to use");

    console.log("\n🚀 Next steps:");
    console.log("1. Install snarkjs in your frontend: npm install snarkjs");
    console.log("2. Copy circuit files to frontend public folder");
    console.log("3. Implement ZKP voting in your application");

    return { success: true, wasmPath };
  } else {
    console.log("❌ ZKP Setup Verification: FAILED!");
    console.log("🔧 Some files are missing or invalid");

    console.log("\n🔧 To fix missing files:");
    results.forEach((result) => {
      if (!result.exists || !result.valid) {
        console.log(`   - ${result.name}: Re-run setup script`);
      }
    });

    return { success: false, wasmPath };
  }
}

// Test proof generation (basic)
async function testProofGeneration(wasmPath) {
  console.log("\n🧪 Testing proof generation...");

  try {
    const snarkjs = require("snarkjs");
    const voteDir = path.join(__dirname, "..", "build", "vote");

    // Test inputs - make sure these match your circuit
    const input = {
      voterId: 123,
      candidateId: 456,
      electionId: 789,
      nullifierHash: 12345,
      commitmentHash: 67890,
    };

    const zkeyPath = path.join(voteDir, "vote_0000.zkey");

    if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
      console.log("❌ Cannot test - missing wasm or zkey files");
      console.log(`WASM exists: ${fs.existsSync(wasmPath)} at ${wasmPath}`);
      console.log(`ZKEY exists: ${fs.existsSync(zkeyPath)}`);
      return false;
    }

    console.log(`🔐 Using WASM file: ${wasmPath}`);
    console.log("🔐 Generating test proof...");

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    console.log("✅ Test proof generated successfully!");
    console.log(`📊 Proof size: ${JSON.stringify(proof).length} bytes`);
    console.log(`📊 Public signals: ${publicSignals.length} elements`);
    console.log(`📊 Public signals values: [${publicSignals.join(", ")}]`);

    // Test verification
    const vkPath = path.join(voteDir, "verification_key.json");
    const vKey = JSON.parse(fs.readFileSync(vkPath));

    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    if (isValid) {
      console.log("✅ Test proof verification: SUCCESS!");
      return true;
    } else {
      console.log("❌ Test proof verification: FAILED!");
      return false;
    }
  } catch (error) {
    console.log("❌ Test proof generation failed:", error.message);
    console.log("Stack trace:", error.stack);
    return false;
  }
}

// Main execution
async function main() {
  const result = verifyZKPSetup();

  if (result.success) {
    // Only test if verification passed
    await testProofGeneration(result.wasmPath);
  } else {
    console.log("\n🔧 Try regenerating the missing files:");
    console.log("npm run zkp:compile");
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { verifyZKPSetup, testProofGeneration };
