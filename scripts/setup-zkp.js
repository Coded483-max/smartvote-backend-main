// scripts/setup-zkp.js - Updated for system Circom
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// Use system circom instead of npm version
const circom = "F:\\your\\actual\\path\\to\\circom.exe";

async function setupZKP() {
  console.log("🔧 Setting up Zero Knowledge Proof system...");

  const buildDir = path.join(__dirname, "..", "build");
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
    console.log("📁 Created build directory");
  }

  // Ensure build/vote directory exists before compilation
  const outputDir = path.join(buildDir, "vote");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log("📁 Created build/vote directory");
  }

  try {
    console.log("🔍 Checking circom installation...");
    await checkCircom();

    const circuitPath = path.join(__dirname, "..", "circuits", "vote.circom");
    if (!fs.existsSync(circuitPath)) {
      throw new Error(`Circuit file not found: ${circuitPath}`);
    }

    console.log("📦 Compiling vote circuit...");
    await compileCircuit();

    // Verify compilation results
    console.log("🔍 Verifying compilation results...");
    await verifyCompilation();

    console.log("✅ ZKP setup completed successfully!");
  } catch (error) {
    console.error("❌ ZKP setup failed:", error.message);

    console.log("\n🔧 Troubleshooting:");
    console.log("1. Make sure Circom 2.x is installed and in PATH");
    console.log("2. Download from: https://github.com/iden3/circom/releases");
    console.log("3. Avoid npm circom (installs old version)");
    console.log(
      "4. Check that circuits/vote.circom has 'pragma circom 2.0.0;'"
    );

    process.exit(1);
  }
}

function checkCircom() {
  return new Promise((resolve, reject) => {
    exec(`${circom} --version`, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            "Circom not found in system PATH. Please install Circom 2.x"
          )
        );
      } else {
        const version = stdout.trim();
        console.log(`✅ Circom found: ${version}`);

        // Check if it's version 2.x
        if (version.includes("2.") || version.includes("3.")) {
          console.log("✅ Modern Circom version detected");
          resolve();
        } else {
          reject(
            new Error(
              `Old Circom version detected (${version}). Please install Circom 2.x`
            )
          );
        }
      }
    });
  });
}

function compileCircuit() {
  return new Promise((resolve, reject) => {
    // Use the circom variable instead of hardcoded "circom"
    const command = `"${circom}" circuits/vote.circom --r1cs --wasm --sym -o build/vote`;

    console.log(`🔨 Running: ${command}`);

    exec(
      command,
      {
        cwd: path.join(__dirname, ".."),
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("❌ Compilation failed");
          console.error("Error:", error.message);
          if (stderr) console.error("stderr:", stderr);
          reject(error);
        } else {
          console.log("✅ Circuit compiled successfully");
          if (stdout) console.log("Output:", stdout);
          resolve();
        }
      }
    );
  });
}

function verifyCompilation() {
  return new Promise((resolve, reject) => {
    const voteDir = path.join(__dirname, "..", "build", "vote");
    const requiredFiles = ["vote.r1cs", "vote.wasm", "vote.sym"];

    let allFilesExist = true;
    requiredFiles.forEach((file) => {
      const filePath = path.join(voteDir, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`   ✅ ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
      } else {
        console.log(`   ❌ ${file} (missing)`);
        allFilesExist = false;
      }
    });

    if (allFilesExist) {
      resolve();
    } else {
      reject(new Error("Some compilation output files are missing"));
    }
  });
}

if (require.main === module) {
  setupZKP();
}

module.exports = { setupZKP };
