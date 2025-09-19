require("dotenv").config();
const mongoose = require("mongoose");
const Election = require("../src/models/election.model"); // adjust path if needed

async function cleanInvalidVotes() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to DB");

    // Remove votes missing txHash
    const result1 = await Election.updateMany(
      {},
      { $pull: { votes: { "votes.txHash": { $exists: false } } } }
    );
    console.log("Removed votes missing txHash:", result1.modifiedCount);

    // Remove votes missing blockNumber
    const result2 = await Election.updateMany(
      {},
      { $pull: { votes: { "votes.blockNumber": { $exists: false } } } }
    );
    console.log("Removed votes missing blockNumber:", result2.modifiedCount);

    console.log("Cleaning complete.");
    await mongoose.disconnect();
  } catch (err) {
    console.error("Error cleaning invalid votes:", err);
  }
}

cleanInvalidVotes();
