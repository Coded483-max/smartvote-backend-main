// scripts/generate-ptau.js
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

async function generatePowerOfTau() {
  console.log("🔧 Generating Powers of Tau (for development only)...");

  const buildDir = path.join(__dirname, "..", "build");
  const ptauPath = path.join(buildDir, "powersoftau.ptau");

  // Ensure build directory exists
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  try {
    // Generate a new Powers of Tau ceremony (development only)
    console.log("🎲 Creating new ceremony...");
    await snarkjs.powersOfTau.newAccumulator(12, ptauPath);

    console.log("✅ Powers of Tau generated successfully!");
    console.log(`📁 File saved to: ${ptauPath}`);

    // Check file size
    const stats = fs.statSync(ptauPath);
    console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error("❌ Failed to generate Powers of Tau:", error);
    throw error;
  }
}

if (require.main === module) {
  generatePowerOfTau();
}

module.exports = { generatePowerOfTau };
