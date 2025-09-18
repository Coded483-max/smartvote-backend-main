// routes/zkp-vote.routes.js
const express = require("express");
const router = express.Router();
const zkpVoteController = require("../controllers/zkp-vote.controller");

// Cast vote with ZKP
router.post("/cast", zkpVoteController.castZKPVote);

// Verify vote proof
router.post("/verify", zkpVoteController.verifyVoteProof);

// Get ZKP statistics
router.get("/stats/:electionId", zkpVoteController.getZKPStats);

module.exports = router;
