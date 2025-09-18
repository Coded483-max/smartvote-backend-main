const mongoose = require("mongoose");
const Election = require("../src/models/election.model");
require("dotenv").config(); // Load your .env file

async function syncAllElections() {
  try {
    // Use your existing database URL from .env
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/SmartVoteDB"
    );
    console.log("✅ Connected to MongoDB");

    // Rest of your code...
    const elections = await Election.find({});
    console.log(`📊 Found ${elections.length} elections to sync`);

    for (const election of elections) {
      console.log(`🔄 Syncing: ${election.title}...`);
      election.syncCandidatesToTopLevel();
      await election.save();
      console.log(
        `✅ Synced election: ${election.title} (${election.candidates.length} candidates)`
      );
    }

    console.log(`🎉 Synced ${elections.length} elections`);
  } catch (error) {
    console.error("❌ Sync failed:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

syncAllElections();
