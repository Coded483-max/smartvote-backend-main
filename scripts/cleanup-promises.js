// scripts/cleanup-promises.js
const mongoose = require("mongoose");
require("dotenv").config();

async function cleanupPromises() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Get candidates collection
    const db = mongoose.connection.db;
    const candidates = db.collection("candidates");

    // Check current state
    const totalCandidates = await candidates.countDocuments();
    const withCampaignPromises = await candidates.countDocuments({
      campaignPromises: { $exists: true, $ne: [] },
    });
    const withPromises = await candidates.countDocuments({
      promises: { $exists: true, $ne: [] },
    });

    console.log(`📊 Current state:`);
    console.log(`   Total candidates: ${totalCandidates}`);
    console.log(`   With campaignPromises: ${withCampaignPromises}`);
    console.log(`   With promises: ${withPromises}`);

    if (withCampaignPromises === 0) {
      console.log("✅ No cleanup needed - no campaignPromises found");
      return;
    }

    // Perform the cleanup
    console.log("🧹 Starting cleanup...");

    const result = await candidates.updateMany(
      { campaignPromises: { $exists: true, $ne: [] } },
      [
        {
          $set: {
            promises: {
              $cond: {
                if: { $eq: [{ $size: { $ifNull: ["$promises", []] } }, 0] },
                then: "$campaignPromises",
                else: {
                  $concatArrays: [
                    { $ifNull: ["$promises", []] },
                    "$campaignPromises",
                  ],
                },
              },
            },
          },
        },
        { $unset: "campaignPromises" },
      ]
    );

    console.log(`✅ Cleanup completed!`);
    console.log(`   Modified ${result.modifiedCount} documents`);

    // Verify results
    const afterCleanup = await candidates.countDocuments({
      campaignPromises: { $exists: true },
    });
    const withPromisesAfter = await candidates.countDocuments({
      promises: { $exists: true, $ne: [] },
    });

    console.log(`📊 After cleanup:`);
    console.log(`   With campaignPromises: ${afterCleanup}`);
    console.log(`   With promises: ${withPromisesAfter}`);

    // Show a sample candidate
    const sampleCandidate = await candidates.findOne(
      { promises: { $exists: true, $ne: [] } },
      { firstName: 1, lastName: 1, promises: 1, campaignPromises: 1 }
    );

    if (sampleCandidate) {
      console.log(`📝 Sample candidate after cleanup:`);
      console.log(
        `   Name: ${sampleCandidate.firstName} ${sampleCandidate.lastName}`
      );
      console.log(
        `   Promises count: ${sampleCandidate.promises?.length || 0}`
      );
      console.log(
        `   CampaignPromises: ${
          sampleCandidate.campaignPromises ? "still exists" : "removed"
        }`
      );
    }
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    await mongoose.disconnect();
    console.log("📤 Disconnected from MongoDB");
  }
}

// Run the cleanup
cleanupPromises();
