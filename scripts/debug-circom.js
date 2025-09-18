// scripts/debug-circom.js
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

async function debugCircom() {
  console.log("🔧 Debugging Circom execution...");

  try {
    // Check basic info
    console.log("1. 📋 Environment check:");
    console.log(`   Working directory: ${process.cwd()}`);
    console.log(`   Node version: ${process.version}`);

    // Check if circom exists
    console.log("\n2. 🔍 Checking Circom:");
    await testCommand("where circom");
    await testCommand("circom --version");

    // Check directories
    console.log("\n3. 📁 Checking directories:");
    const circuitsDir = path.join(__dirname, "..", "circuits");
    const buildDir = path.join(__dirname, "..", "build");
    const voteDir = path.join(buildDir, "vote");

    console.log(`   Circuits dir exists: ${fs.existsSync(circuitsDir)}`);
    console.log(`   Build dir exists: ${fs.existsSync(buildDir)}`);
    console.log(`   Vote dir exists: ${fs.existsSync(voteDir)}`);

    // Create directories if needed
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
      console.log("   ✅ Created build directory");
    }
    if (!fs.existsSync(voteDir)) {
      fs.mkdirSync(voteDir, { recursive: true });
      console.log("   ✅ Created vote directory");
    }

    // Check circuit file
    const circuitPath = path.join(circuitsDir, "vote.circom");
    console.log(`   Circuit file exists: ${fs.existsSync(circuitPath)}`);
    if (fs.existsSync(circuitPath)) {
      const stats = fs.statSync(circuitPath);
      console.log(`   Circuit file size: ${stats.size} bytes`);
    }

    // Try different compilation methods
    console.log("\n4. 🔨 Testing compilation methods:");

    // Method 1: Basic
    console.log("Method 1: Basic compilation");
    try {
      await testCompilation(
        "circom circuits\\vote.circom --r1cs --wasm --sym -o build\\vote"
      );
      console.log("   ✅ Method 1 succeeded");
      return;
    } catch (error) {
      console.log(`   ❌ Method 1 failed: ${error.message}`);
    }

    // Method 2: With forward slashes
    console.log("\nMethod 2: Forward slashes");
    try {
      await testCompilation(
        "circom circuits/vote.circom --r1cs --wasm --sym -o build/vote"
      );
      console.log("   ✅ Method 2 succeeded");
      return;
    } catch (error) {
      console.log(`   ❌ Method 2 failed: ${error.message}`);
    }

    // Method 3: Absolute paths
    console.log("\nMethod 3: Absolute paths");
    const absoluteCircuit = path.resolve(circuitPath);
    const absoluteOutput = path.resolve(voteDir);
    try {
      await testCompilation(
        `circom "${absoluteCircuit}" --r1cs --wasm --sym -o "${absoluteOutput}"`
      );
      console.log("   ✅ Method 3 succeeded");
      return;
    } catch (error) {
      console.log(`   ❌ Method 3 failed: ${error.message}`);
    }

    // Method 4: Step by step
    console.log("\nMethod 4: Step by step");
    try {
      await testCompilation(
        `circom circuits\\vote.circom --r1cs -o build\\vote`
      );
      await testCompilation(
        `circom circuits\\vote.circom --wasm -o build\\vote`
      );
      await testCompilation(
        `circom circuits\\vote.circom --sym -o build\\vote`
      );
      console.log("   ✅ Method 4 succeeded");
      return;
    } catch (error) {
      console.log(`   ❌ Method 4 failed: ${error.message}`);
    }

    console.log("\n❌ All compilation methods failed");
  } catch (error) {
    console.error("❌ Debug failed:", error.message);
  }
}

function testCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`   ❌ ${command}: ${error.message}`);
        reject(error);
      } else {
        console.log(`   ✅ ${command}: ${stdout.trim()}`);
        resolve(stdout);
      }
    });
  });
}

function testCompilation(command) {
  return new Promise((resolve, reject) => {
    console.log(`   🔨 Running: ${command}`);

    const child = spawn("cmd", ["/c", command], {
      cwd: path.join(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      console.log(`   Exit code: ${code}`);
      if (stdout) console.log(`   STDOUT: ${stdout.trim()}`);
      if (stderr) console.log(`   STDERR: ${stderr.trim()}`);

      // Check if files were generated
      const voteDir = path.join(__dirname, "..", "build", "vote");
      const files = ["vote.r1cs", "vote.wasm", "vote.sym"];
      let filesGenerated = 0;

      files.forEach((file) => {
        const filePath = path.join(voteDir, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(
            `   ✅ Generated: ${file} (${(stats.size / 1024).toFixed(1)} KB)`
          );
          filesGenerated++;
        }
      });

      if (code === 0 && filesGenerated > 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Command failed with exit code ${code}, generated ${filesGenerated}/3 files`
          )
        );
      }
    });

    child.on("error", (error) => {
      console.log(`   ❌ Process error: ${error.message}`);
      reject(error);
    });
  });
}

if (require.main === module) {
  debugCircom().catch(console.error);
}

module.exports = { debugCircom };
