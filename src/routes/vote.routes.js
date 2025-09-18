const express = require("express");
const router = express.Router();

const {
  castVote,
  verifyVote,
  getMyVoteResults,
  getCandidateVoteCount,
  getElectionResults,
} = require("../controllers/vote.controller");
const zkpVoteController = require("../controllers/zkp-vote.controller");

const { verifyVoterOrCandidate } = require("../middlewares/auth.middleware");
const { authLimiter } = require("../middlewares/rateLimiter");
const { voteValidation } = require("../middlewares/validation");

/* ───────────────────────── Routes ───────────────────────── */

/* POST /api/votes  → cast a vote */
router.post("/cast", verifyVoterOrCandidate, voteValidation, castVote);
router.get("/verify/:txHash", verifyVoterOrCandidate, verifyVote);

// ✅ New candidate results routes
router.get("/my-results", verifyVoterOrCandidate, getMyVoteResults);
router.get(
  "/candidate-results/:candidateId",
  verifyVoterOrCandidate,
  getCandidateVoteCount
);

// ✅ Election results (for admins or public after completion)
router.get("/election-results/:electionId", getElectionResults);

// Specialized ZKP endpoints
router.post("/zkp", zkpVoteController.castZKPVote); // ✅ ZKP-only voting
router.post("/zkp/verify", zkpVoteController.verifyVoteProof);
router.get("/zkp/stats/:electionId", zkpVoteController.getZKPStats);

module.exports = router;
