// controllers/zkp-vote.controller.js
const zkpService = require("../services/zkp.service");
const Vote = require("../models/voter.model");
const Election = require("../models/election.model");
const { isAuthenticated } = require("../utils/sessionHelpers");

// Cast vote with ZKP
exports.castZKPVote = async (req, res) => {
  try {
    // Verify user session
    if (!isAuthenticated(req)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { candidateId, electionId } = req.body;
    const voterId = req.session.user.id;

    // Validate election
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found",
      });
    }

    // Check if election is active
    const now = new Date();
    if (now < election.startDate || now > election.endDate) {
      return res.status(400).json({
        success: false,
        message: "Election is not active",
      });
    }

    // Generate ZKP proof
    console.log("🔐 Generating ZKP proof for vote...");
    const proofData = await zkpService.generateVoteProof(
      voterId,
      candidateId,
      electionId
    );

    // Store vote with ZKP data
    const vote = new Vote({
      voter: voterId,
      candidate: candidateId,
      election: electionId,
      zkpProof: proofData.proof,
      publicSignals: proofData.publicSignals,
      nullifierHash: proofData.nullifierHash.toString(),
      commitmentHash: proofData.commitmentHash.toString(),
      timestamp: new Date(),
      verified: true,
    });

    await vote.save();

    console.log(`✅ ZKP vote cast successfully by voter ${voterId}`);

    res.json({
      success: true,
      message: "Vote cast successfully with zero-knowledge proof",
      voteId: vote._id,
      zkpProof: {
        nullifierHash: proofData.nullifierHash.toString(),
        verified: true,
      },
    });
  } catch (error) {
    console.error("ZKP vote casting error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cast vote",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Verify vote proof
exports.verifyVoteProof = async (req, res) => {
  try {
    const { proof, publicSignals } = req.body;

    if (!proof || !publicSignals) {
      return res.status(400).json({
        success: false,
        message: "Proof and public signals are required",
      });
    }

    // Verify the proof
    const verification = await zkpService.verifyVoteProof(proof, publicSignals);

    if (verification.valid) {
      res.json({
        success: true,
        message: "Proof verified successfully",
        verification,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid proof",
        error: verification.error,
      });
    }
  } catch (error) {
    console.error("Proof verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify proof",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get election ZKP statistics
exports.getZKPStats = async (req, res) => {
  try {
    const { electionId } = req.params;

    // Get vote statistics
    const totalVotes = await Vote.countDocuments({
      election: electionId,
      zkpProof: { $exists: true },
    });

    const verifiedVotes = await Vote.countDocuments({
      election: electionId,
      verified: true,
      zkpProof: { $exists: true },
    });

    // Get unique nullifiers count
    const uniqueNullifiers = await Vote.distinct("nullifierHash", {
      election: electionId,
    });

    res.json({
      success: true,
      stats: {
        totalZKPVotes: totalVotes,
        verifiedVotes,
        uniqueVoters: uniqueNullifiers.length,
        integrityScore: totalVotes > 0 ? (verifiedVotes / totalVotes) * 100 : 0,
      },
    });
  } catch (error) {
    console.error("ZKP stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get ZKP statistics",
    });
  }
};

module.exports = {
  castZKPVote: exports.castZKPVote,
  verifyVoteProof: exports.verifyVoteProof,
  getZKPStats: exports.getZKPStats,
};
