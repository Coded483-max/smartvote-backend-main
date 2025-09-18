const mongoose = require("mongoose");
const Election = require("../src/models/election.model");
const Candidate = require("../src/models/candidate.model");

async function syncCandidatesToPositions(electionId) {
  await mongoose.connect("mongodb://localhost:27017/SmartVoteDB");

  const election = await Election.findById(electionId).populate("candidates");
  if (!election) return console.log("Election not found");

  let updated = false;

  for (const candidate of election.candidates) {
    const pos = election.positions.find(
      (p) => p._id.toString() === candidate.positionId.toString()
    );
    if (pos && !pos.candidates.includes(candidate._id)) {
      pos.candidates.push(candidate._id);
      updated = true;
    }
  }

  if (updated) {
    await election.save();
    console.log("Synced candidates to positions.");
  } else {
    console.log("No updates needed.");
  }

  await mongoose.disconnect();
}

syncCandidatesToPositions("68855814cf766a9f9f973a65");
