const { ethers } = require("ethers");
const path = require("path");

// Load .env from parent directory (project root)
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function testLocalSetup() {
  try {
    console.log("🔗 Testing local blockchain connection...");
    console.log("🔧 RPC URL:", process.env.RPC_URL);
    console.log("🔧 Contract:", process.env.CONTRACT_ADDRESS);

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    console.log("✅ Connected! Current block:", blockNumber);

    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const balance = await provider.getBalance(wallet.address);

    console.log("👤 Wallet Address:", wallet.address);
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH");
    console.log("📋 Contract Address:", process.env.CONTRACT_ADDRESS);

    console.log("🎉 Local blockchain setup complete!");
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    console.error(
      "💡 Make sure 'npx hardhat node' is running in blockchain/ directory"
    );
  }
}

testLocalSetup();
