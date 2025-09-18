const Election = require("../src/models/election.model");
const Voter = require("../src/models/voter.model");
const Candidate = require("../src/models/candidate.model");
const mongoose = require("mongoose");

mongoose.connect("mongodb://127.0.0.1:27017/SmartVoteDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.once("open", async () => {
  try {
    await syncAllowedVoters("689e696bd0f44485185002e7");
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
});

async function syncAllowedVoters(electionId) {
  const election = await Election.findById(electionId);
  if (!election) {
    console.log("Election not found");
    return;
  }

  // Find all eligible voters (adjust criteria as needed)
  const voterQuery = {
    college: election.college,
    department: election.department,
    yearOfStudy: election.yearOfStudy,
    // isVerified: true,
  };
  const voters = await Voter.find(voterQuery).select("_id");

  // Find all candidates for this election
  const candidates = await Candidate.find({ electionId: election._id }).select(
    "_id"
  );

  // Combine ObjectIds
  const allIds = [...voters.map((v) => v._id), ...candidates.map((c) => c._id)];

  // Remove duplicates
  const uniqueIds = Array.from(new Set(allIds.map((id) => id.toString()))).map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  // Update the election
  await Election.updateOne(
    { _id: election._id },
    { $set: { allowedVoters: uniqueIds } }
  );

  console.log(
    `Election ${election.title} allowedVoters synced: ${uniqueIds.length} total`
  );
}

// syncAllowedVoters("689e696bd0f44485185002e7");
