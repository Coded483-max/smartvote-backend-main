// scripts/install-system-circom.js
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

async function installSystemCircom() {
  console.log("🔧 Installing system Circom...");

  try {
    // Check if Rust is installed
    console.log("1. 🦀 Checking Rust installation...");
    await checkRust();

    // Remove npm circom
    console.log("2. 🗑️ Removing npm circom...");
    await executeCommand("npm uninstall -g circom");

    // Clone and build circom
    console.log("3. 📦 Cloning and building circom...");
    const tempDir = path.join(__dirname, "..", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    process.chdir(tempDir);
    await executeCommand("git clone https://github.com/iden3/circom.git");
    process.chdir(path.join(tempDir, "circom"));
    await executeCommand("cargo build --release");

    // Copy binary to system location
    console.log("4. 📋 Installing binary...");
    const sourceBinary = path.join(
      tempDir,
      "circom",
      "target",
      "release",
      "circom.exe"
    );
    const targetBinary = "C:\\Windows\\System32\\circom.exe";

    if (fs.existsSync(sourceBinary)) {
      fs.copyFileSync(sourceBinary, targetBinary);
      console.log("✅ Circom installed to system");
    } else {
      throw new Error("Binary not found after build");
    }

    // Clean up
    process.chdir(path.join(__dirname, ".."));
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Test installation
    console.log("5. 🧪 Testing installation...");
    await executeCommand("circom --version");

    console.log("🎉 System Circom installed successfully!");
  } catch (error) {
    console.error("❌ Installation failed:", error.message);
    throw error;
  }
}

function checkRust() {
  return new Promise((resolve, reject) => {
    exec("rustc --version", (error, stdout, stderr) => {
      if (error) {
        console.log("❌ Rust not found. Install from: https://rustup.rs/");
        reject(new Error("Rust not installed"));
      } else {
        console.log(`✅ Rust found: ${stdout.trim()}`);
        resolve();
      }
    });
  });
}

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`🔨 Running: ${command}`);

    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Command failed: ${error.message}`);
        reject(error);
      } else {
        if (stdout) console.log(stdout.trim());
        resolve();
      }
    });
  });
}

if (require.main === module) {
  installSystemCircom()
    .then(() => {
      console.log("\n🎉 Installation completed!");
      console.log("💡 Now try: npm run zkp:compile");
    })
    .catch((error) => {
      console.error("\n❌ Installation failed:", error.message);
    });
}

module.exports = { installSystemCircom };
