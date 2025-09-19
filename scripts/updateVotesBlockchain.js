/**
 * Migration Script: Submit missing votes to blockchain
 * ==============================================
 * Usage: node scripts/migrateVotesToBlockchain.js
 */

const mongoose = require("mongoose");
const Election = require("../src/models/election.model");
const Nullifier = require("../src/models/nullifier.model");
const { generateVoteProof } = require("../src/utils/generateProof");
const { submitVoteToBlockchain } = require("../src/services/blockchain");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;

async function updateVotes() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const elections = await Election.find({
    "votes.votes.zkProof.txHash": { $exists: false },
  });

  console.log(
    `🔹 Found ${elections.length} elections with missing blockchain data`
  );

  for (const election of elections) {
    console.log(
      `\n🔹 Processing election: ${election.title} (${election._id})`
    );

    if (!election.votes || election.votes.length === 0) {
      console.log("No votes found, skipping...");
      continue;
    }

    for (const voteEntry of election.votes) {
      const voterId = voteEntry.voterId.toString();

      for (let i = 0; i < voteEntry.votes.length; i++) {
        const vote = voteEntry.votes[i];

        // Skip if vote already has txHash and blockNumber
        if (vote.zkProof?.txHash && vote.zkProof?.blockNumber) {
          continue;
        }

        try {
          // Regenerate ZK proof
          if (!vote.zkProof || !vote.zkProof.nullifierHash) {
            console.log(
              `Regenerating zkProof for voter ${voterId}, candidate ${vote.candidateId}...`
            );
            const zk = await generateVoteProof(
              voterId,
              vote.candidateId,
              election._id.toString()
            );
            vote.zkProof = {
              proof: zk.proof,
              publicSignals: zk.publicSignals,
              nullifierHash: zk.nullifierHash,
              commitmentHash: zk.commitmentHash,
              verified: true,
            };
          }

          // Submit to blockchain
          console.log(
            `Submitting vote to blockchain for voter ${voterId}, candidate ${vote.candidateId}...`
          );
          const { txHash, blockNumber } = await submitVoteToBlockchain(
            election._id.toString(),
            vote.candidateId,
            vote.zkProof
          );

          vote.zkProof.txHash = txHash;
          vote.zkProof.blockNumber = blockNumber;

          // Persist nullifier
          await Nullifier.create({
            hash: vote.zkProof.nullifierHash,
            electionId: election._id,
            voterId,
            timestamp: new Date(),
          });

          // Update vote in DB
          await Election.updateOne(
            { _id: election._id, "votes._id": voteEntry._id },
            { $set: { "votes.$.votes": voteEntry.votes } }
          );

          console.log(`✅ Vote updated with txHash: ${txHash}`);
        } catch (err) {
          console.error(
            `❌ Failed for voter ${voterId}, candidate ${vote.candidateId}:`,
            err.message
          );
        }
      }
    }
  }

  console.log("\n✅ Migration completed");
  mongoose.disconnect();
}

updateVotes().catch((err) => {
  console.error("Migration failed:", err);
  mongoose.disconnect();
});
