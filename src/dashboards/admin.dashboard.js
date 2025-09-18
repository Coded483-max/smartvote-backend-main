const Voter = require("../models/voter.model");
const Candidate = require("../models/candidate.model");
const Election = require("../models/election.model");

// @desc Admin Dashboard Overview
exports.getAdminDashboard = async (req, res) => {
  try {
    const totalVoters = await Voter.countDocuments();
    const totalCandidates = await Candidate.countDocuments();
    const totalElections = await Election.countDocuments();
    const activeElections = await Election.countDocuments({ status: "ongoing" });
    const pendingCandidates = await Candidate.countDocuments({ approvalStatus: "pending" });

    res.status(200).json({
      totalVoters,
      totalCandidates,
      totalElections,
      activeElections,
      pendingCandidates,
    });
  } catch (error) {
    console.error("Admin Dashboard Error:", error);
    res.status(500).json({ message: "Dashboard server error" });
  }
};
