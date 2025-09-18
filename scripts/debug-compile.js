// scripts/debug-compile.js
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

async function debugCompile() {
  console.log("🔧 Debug compilation starting...");

  const circuitPath = path.join(__dirname, "..", "circuits", "vote.circom");
  const buildDir = path.join(__dirname, "..", "build");
  const voteDir = path.join(buildDir, "vote");

  try {
    // Step 1: Check if circuit file exists
    console.log("1. 📁 Checking circuit file...");
    if (!fs.existsSync(circuitPath)) {
      throw new Error(`Circuit file not found: ${circuitPath}`);
    }

    const circuitContent = fs.readFileSync(circuitPath, "utf8");
    console.log("✅ Circuit file exists");
    console.log(`📊 Size: ${circuitContent.length} characters`);
    console.log("📄 Content preview:");
    console.log(circuitContent.substring(0, 200) + "...");

    // Step 2: Check Circom version
    console.log("\n2. 🔍 Checking Circom version...");
    await checkCircomVersion();

    // Step 3: Prepare build directory
    console.log("\n3. 📁 Preparing build directory...");
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }
    if (!fs.existsSync(voteDir)) {
      fs.mkdirSync(voteDir, { recursive: true });
    }
    console.log("✅ Build directories ready");

    // Step 4: Try compilation with different methods
    console.log("\n4. 🔨 Attempting compilation...");

    // Method 1: Basic compilation
    console.log("Method 1: Basic compilation");
    try {
      await compileMethod1();
      console.log("✅ Method 1 successful!");
      return;
    } catch (error) {
      console.log("❌ Method 1 failed:", error.message);
    }

    // Method 2: With specific flags
    console.log("\nMethod 2: With optimization flags");
    try {
      await compileMethod2();
      console.log("✅ Method 2 successful!");
      return;
    } catch (error) {
      console.log("❌ Method 2 failed:", error.message);
    }

    // Method 3: Step by step
    console.log("\nMethod 3: Step by step compilation");
    try {
      await compileMethod3();
      console.log("✅ Method 3 successful!");
      return;
    } catch (error) {
      console.log("❌ Method 3 failed:", error.message);
    }

    throw new Error("All compilation methods failed");
  } catch (error) {
    console.error("❌ Debug compilation failed:", error.message);

    // Suggest fixes
    console.log("\n💡 Possible fixes:");
    console.log("1. Check circuit syntax for errors");
    console.log("2. Update circom: npm install -g circom@latest");
    console.log("3. Try a simpler circuit first");

    throw error;
  }
}

function checkCircomVersion() {
  return new Promise((resolve, reject) => {
    exec("circom --version", (error, stdout, stderr) => {
      if (error) {
        console.log("❌ Circom not found or not working");
        console.log("💡 Install with: npm install -g circom@latest");
        reject(error);
      } else {
        console.log(`✅ Circom version: ${stdout.trim()}`);
        resolve();
      }
    });
  });
}

function compileMethod1() {
  return executeCommand(
    "circom circuits/vote.circom --r1cs --wasm --sym -o build/vote"
  );
}

function compileMethod2() {
  return executeCommand(
    "circom circuits/vote.circom --r1cs --wasm --sym -o build/vote --O0 --verbose"
  );
}

function compileMethod3() {
  return executeCommand("circom circuits/vote.circom --r1cs -o build/vote")
    .then(() =>
      executeCommand("circom circuits/vote.circom --wasm -o build/vote")
    )
    .then(() =>
      executeCommand("circom circuits/vote.circom --sym -o build/vote")
    );
}

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`🔨 Running: ${command}`);

    const process = spawn("cmd", ["/c", command], {
      cwd: path.join(__dirname, ".."),
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log(data.toString().trim());
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error(data.toString().trim());
    });

    process.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Command completed successfully");

        // Check if files were generated
        const voteDir = path.join(__dirname, "..", "build", "vote");
        const filesToCheck = ["vote.r1cs", "vote.wasm", "vote.sym"];

        filesToCheck.forEach((file) => {
          const filePath = path.join(voteDir, file);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`   ✅ ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
          } else {
            console.log(`   ❌ ${file} (not generated)`);
          }
        });

        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    process.on("error", (error) => {
      reject(error);
    });
  });
}

if (require.main === module) {
  debugCompile()
    .then(() => {
      console.log("\n🎉 Debug compilation completed!");
    })
    .catch((error) => {
      console.error("\n❌ Debug compilation failed:", error.message);
      process.exit(1);
    });
}

module.exports = { debugCompile };
