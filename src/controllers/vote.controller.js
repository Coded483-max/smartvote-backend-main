const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const mongoose = require("mongoose");
const Election = require("../models/election.model");
const Candidate = require("../models/candidate.model");
const { contract, contractRO } = require("../services/blockchain");

const { getIO } = require("../services/socket");
const { sendEmail } = require("../utils/emailService");

const SecurityLogger = require("../services/securityLogger");

const cacheService = require("../services/cache");
const { voteLimiter } = require("../middlewares/rateLimiter");
const Nullifier = require("../models/nullifier.model");
const {
  generateVoteProof,
  verifyVoteProof,
} = require("../utils/generateProof");

// ZK Proof configuration
const ZK_CONFIG = {
  wasmPath: path.join(
    __dirname,
    "..",
    "..",
    "build",
    "vote",
    "vote_js",
    "vote.wasm"
  ),
  zkeyPath: path.join(__dirname, "..", "..", "build", "vote", "vote_0001.zkey"),
  vKeyPath: path.join(
    __dirname,
    "..",
    "..",
    "build",
    "vote",
    "verification_key.json"
  ),
  nullifiers: new Set(), // In-memory nullifier storage (use database in production)
};

/* ─────────────────────────── ZK Proof Helpers ─────────────────────────── */

/**
 * Generate ZK proof for a vote
 */
// ✅ Fixed proof generation
// async function generateVoteProof(voterId, candidateId, electionId) {
//   try {
//     // Generate proper cryptographic inputs
//     const salt = crypto.randomBytes(32);
//     const saltField = BigInt("0x" + salt.toString("hex").slice(0, 16));

//     // Convert IDs to field elements
//     const voterField = BigInt("0x" + voterId.toString().slice(-16));
//     const candidateField = BigInt("0x" + candidateId.toString().slice(-16));
//     const electionField = BigInt("0x" + electionId.toString().slice(-16));

//     // Generate nullifier (prevents double voting)
//     const nullifierPreimage = `${voterField.toString()}-${electionField.toString()}`;
//     const nullifierHash = BigInt(
//       "0x" +
//         crypto
//           .createHash("sha256")
//           .update(nullifierPreimage)
//           .digest("hex")
//           .slice(0, 16)
//     );

//     // Generate commitment (hides vote)
//     const commitmentPreimage = `${candidateField.toString()}-${saltField.toString()}`;
//     const commitmentHash = BigInt(
//       "0x" +
//         crypto
//           .createHash("sha256")
//           .update(commitmentPreimage)
//           .digest("hex")
//           .slice(0, 16)
//     );

//     // Check nullifier database instead of memory
//     const existingNullifier = await Nullifier.findOne({
//       hash: nullifierHash.toString(),
//       electionId: electionId,
//     });

//     if (existingNullifier) {
//       throw new Error("Voter has already generated a proof for this election");
//     }

//     // Circuit input with proper field elements
//     const input = {
//       voterId: voterField.toString(),
//       candidateId: candidateField.toString(),
//       electionId: electionField.toString(),
//       salt: saltField.toString(),
//       nullifierHash: nullifierHash.toString(),
//       commitmentHash: commitmentHash.toString(),
//     };

//     console.log("🔐 Generating ZK proof with circuit...");

//     // Generate the actual ZK proof
//     const { proof, publicSignals } = await snarkjs.groth16.fullProve(
//       input,
//       ZK_CONFIG.wasmPath,
//       ZK_CONFIG.zkeyPath
//     );

//     // Save nullifier to database
//     await Nullifier.create({
//       hash: nullifierHash.toString(),
//       electionId: electionId,
//       voterId: voterId,
//       timestamp: new Date(),
//     });

//     return {
//       proof,
//       publicSignals,
//       nullifierHash: nullifierHash.toString(),
//       commitmentHash: commitmentHash.toString(),
//       isValid: publicSignals[0] === "1",
//     };
//   } catch (error) {
//     console.error("❌ ZK proof generation failed:", error);
//     throw error;
//   }
// }

// /**
//  * Verify a ZK proof
//  */
// async function verifyVoteProof(proof, publicSignals) {
//   try {
//     console.log("🔍 Verifying ZK proof...");

//     // Load verification key
//     const vKey = JSON.parse(fs.readFileSync(ZK_CONFIG.vKeyPath, "utf8"));

//     // Verify the proof
//     const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

//     return isValid;
//   } catch (error) {
//     console.error("❌ ZK proof verification failed:", error);
//     return false;
//   }
// }

exports.castVote = [
  voteLimiter, // Rate limiting
  async (req, res) => {
    const startTime = Date.now();

    try {
      const { electionId, votes, useZKProof = true } = req.body;
      const voter = req.voter;
      const voterId = voter._id.toString();

      // ===== 1️⃣ Input validation =====
      if (!mongoose.isValidObjectId(electionId))
        return res
          .status(400)
          .json({ success: false, message: "Invalid election ID" });
      if (!Array.isArray(votes) || votes.length === 0)
        return res
          .status(400)
          .json({ success: false, message: "Votes array is required" });

      // ===== 2️⃣ Fetch election (cache first) =====
      const cacheKey = `election:${electionId}:data`;
      let election = await cacheService.get(cacheKey);
      if (!election) {
        election = await Election.findById(electionId).select("-votes").lean();
        if (!election)
          return res
            .status(404)
            .json({ success: false, message: "Election not found" });
        await cacheService.set(cacheKey, election, 600);
      }

      // ===== 3️⃣ Election timing check =====
      const now = Date.now();
      if (
        election.status !== "voting" ||
        (election.voteStart && now < new Date(election.voteStart).getTime()) ||
        (election.voteEnd && now > new Date(election.voteEnd).getTime())
      )
        return res
          .status(400)
          .json({ success: false, message: "Election is not active" });

      // ===== 4️⃣ Check if voter already voted =====
      const voterCacheKey = `election:${electionId}:voter:${voterId}`;
      let hasVoted = await cacheService.get(voterCacheKey);
      if (hasVoted === null) {
        hasVoted = await Election.exists({
          _id: electionId,
          "votes.voterId": voterId,
        });
        await cacheService.set(voterCacheKey, !!hasVoted, 3600);
      }
      if (hasVoted)
        return res
          .status(400)
          .json({ success: false, message: "You have already voted" });

      // ===== 5️⃣ Validate votes =====
      const validVotes = [];
      const validationErrors = [];

      for (const [index, vote] of votes.entries()) {
        const { positionId, candidateIds } = vote;
        const position = election.positions?.find(
          (p) => p._id.toString() === positionId.toString()
        );

        if (
          !position ||
          !Array.isArray(candidateIds) ||
          candidateIds.length === 0
        ) {
          validationErrors.push({
            voteIndex: index,
            error: "Invalid vote data",
          });
          continue;
        }

        const invalidCandidates = candidateIds.filter(
          (c) =>
            !position.candidates?.some((pc) => pc.toString() === c.toString())
        );

        if (invalidCandidates.length > 0) {
          validationErrors.push({ voteIndex: index, invalidCandidates });
          continue;
        }

        validVotes.push(vote);
      }

      if (validationErrors.length > 0)
        return res.status(400).json({
          success: false,
          message: "Vote validation failed",
          errors: validationErrors,
        });

      // ===== 6️⃣ Generate & verify ZK proofs =====
      const zkProofs = [];

      if (useZKProof) {
        for (const vote of validVotes) {
          for (const candidateId of vote.candidateIds) {
            const zk = await generateVoteProof(
              voterId,
              candidateId,
              electionId
            );

            const isValid = await verifyVoteProof(zk.proof, zk.publicSignals);
            if (!isValid) throw new Error("ZK proof verification failed");

            zkProofs.push({
              positionId: vote.positionId,
              candidateId,
              zkProof: {
                proof: zk.proof,
                publicSignals: zk.publicSignals,
                nullifierHash: zk.nullifierHash, // now a string
                commitmentHash: zk.commitmentHash, // optional
                verified: true,
              },
            });
          }
        }
      }

      // ===== 7️⃣ Save votes to DB =====
      const dbVotes = zkProofs.map((zk) => ({
        positionId: zk.positionId,
        candidateId: zk.candidateId,
        zkProof: { ...zk.zkProof, verified: true },
        timestamp: new Date(),
      }));

      await Election.findByIdAndUpdate(
        electionId,
        {
          $push: { votes: { voterId, votes: dbVotes, timestamp: new Date() } },
        },
        { new: false }
      );

      // ===== 8️⃣ Persist nullifiers =====
      for (const zk of zkProofs) {
        await Nullifier.create({
          hash: zk.zkProof.nullifierHash,
          electionId,
          voterId,
          timestamp: new Date(),
        });
      }

      // ===== 9️⃣ Invalidate caches =====
      await Promise.all([
        cacheService.invalidateElection(electionId),
        cacheService.set(voterCacheKey, true, 3600),
      ]);

      // ===== 🔟 Notify via socket & email =====
      const io = getIO();
      io.emit("voteCast", { electionId, voterId, voteCount: dbVotes.length });

      setImmediate(() => {
        const voteDetails = dbVotes
          .map((v) => `Position: ${v.positionId}, Candidate: ${v.candidateId}`)
          .join("\n");
        sendEmail({
          to: voter.email,
          subject: "Votes Recorded",
          text: voteDetails,
        }).catch(console.error);
      });

      // ===== 1️⃣1️⃣ Respond success =====
      res.status(201).json({
        success: true,
        message: "Votes cast successfully",
        votes: dbVotes,
        zkProofsGenerated: zkProofs.length,
        processingTime: `${Date.now() - startTime}ms`,
      });
    } catch (err) {
      console.error("[castVote] Error:", err);
      res
        .status(500)
        .json({ success: false, message: "Server error", error: err.message });
    }
  },
];
/* ─────────────────────────── verifyVote ─────────────────────────── */
/**
 * GET /api/votes/verify/:txHash
 * Auth: verifyVoter (or public if you prefer)
 */
exports.verifyVote = async (req, res) => {
  try {
    const { txHash } = req.params;
    const user = req.voter || req.user;

    // ✅ Log vote verification attempt
    await SecurityLogger.log({
      event: "Vote Cast",
      user: user?.email || "Anonymous",
      userId: user?._id,
      userType: user ? "Voter" : "System",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Vote verification requested",
      severity: "Low",
      category: "Election",
      metadata: {
        txHash: txHash,
        verificationType: "blockchain",
      },
    });

    const receipt = await contractRO.provider.getTransactionReceipt(txHash);
    if (!receipt) {
      // ✅ Log transaction not found
      await SecurityLogger.log({
        event: "Vote Cast",
        user: user?.email || "Anonymous",
        userId: user?._id,
        userType: user ? "Voter" : "System",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Transaction not found during verification",
        severity: "Medium",
        category: "Election",
        metadata: {
          txHash: txHash,
          reason: "Transaction not found on blockchain",
        },
      });

      return res.status(404).json({ message: "Transaction not found" });
    }

    const isSuccess = receipt.status === 1;

    // ✅ Log verification result
    await SecurityLogger.log({
      event: "Vote Cast",
      user: user?.email || "Anonymous",
      userId: user?._id,
      userType: user ? "Voter" : "System",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: `Vote verification completed: ${
        isSuccess ? "confirmed" : "failed"
      }`,
      severity: "Low",
      category: "Election",
      metadata: {
        txHash: txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        transactionStatus: isSuccess ? "confirmed" : "failed",
      },
    });

    res.json({
      txHash,
      status: isSuccess ? "confirmed" : "failed",
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (err) {
    console.error("Verify vote error:", err);

    // ✅ Log verification error
    await SecurityLogger.log({
      event: "Vote Cast",
      user: req.voter?.email || req.user?.email || "Unknown",
      userId: req.voter?._id || req.user?._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "System error during vote verification",
      severity: "High",
      category: "System",
      metadata: {
        txHash: req.params?.txHash,
        error: err.message,
        endpoint: "/api/votes/verify",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ─────────────────────────── ZK Proof Endpoints ─────────────────────────── */

/**
 * POST /api/votes/generate-proof
 * Generate ZK proof without casting vote (for testing)
 */
exports.generateVoteProofEndpoint = async (req, res) => {
  try {
    const { voterId, candidateId, electionId } = req.body;
    const user = req.voter || req.user;

    if (!voterId || !candidateId || !electionId) {
      // ✅ Log invalid ZK proof request
      await SecurityLogger.log({
        event: "Suspicious Activity",
        user: user?.email || "Unknown",
        userId: user?._id,
        userType: user?.constructor?.modelName || "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid ZK proof generation request - missing fields",
        severity: "Medium",
        category: "Security",
        metadata: {
          providedFields: {
            voterId: !!voterId,
            candidateId: !!candidateId,
            electionId: !!electionId,
          },
          endpoint: "/api/votes/generate-proof",
        },
      });

      return res.status(400).json({
        error: "Missing required fields: voterId, candidateId, electionId",
      });
    }

    const zkProof = await generateVoteProof(voterId, candidateId, electionId);

    // ✅ Log ZK proof generation
    await SecurityLogger.log({
      event: "Vote Cast",
      user: user?.email || "Unknown",
      userId: user?._id,
      userType: user?.constructor?.modelName || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "ZK proof generated successfully (testing)",
      severity: "Low",
      category: "Security",
      metadata: {
        voterId: voterId,
        candidateId: candidateId,
        electionId: electionId,
        nullifierHash: zkProof.nullifierHash.substring(0, 16) + "...",
        testMode: true,
      },
    });

    res.json({
      success: true,
      message: "ZK proof generated successfully",
      zkProof,
    });
  } catch (error) {
    // ✅ Log ZK proof generation error
    await SecurityLogger.log({
      event: "Vote Cast",
      user: req.voter?.email || req.user?.email || "Unknown",
      userId: req.voter?._id || req.user?._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "ZK proof generation failed",
      severity: "High",
      category: "Security",
      metadata: {
        error: error.message,
        voterId: req.body?.voterId,
        candidateId: req.body?.candidateId,
        electionId: req.body?.electionId,
      },
    });

    res.status(500).json({
      error: "Failed to generate ZK proof",
      details: error.message,
    });
  }
};

/**
 * POST /api/votes/verify-proof
 * Verify a ZK proof
 */
exports.verifyVoteProofEndpoint = async (req, res) => {
  try {
    const { proof, publicSignals } = req.body;
    const user = req.voter || req.user;

    if (!proof || !publicSignals) {
      // ✅ Log invalid proof verification request
      await SecurityLogger.log({
        event: "Suspicious Activity",
        user: user?.email || "Unknown",
        userId: user?._id,
        userType: user?.constructor?.modelName || "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid ZK proof verification request - missing data",
        severity: "Medium",
        category: "Security",
        metadata: {
          hasProof: !!proof,
          hasPublicSignals: !!publicSignals,
          endpoint: "/api/votes/verify-proof",
        },
      });

      return res.status(400).json({
        error: "Missing proof or publicSignals",
      });
    }

    const isValid = await verifyVoteProof(proof, publicSignals);

    // ✅ Log proof verification
    await SecurityLogger.log({
      event: "Vote Cast",
      user: user?.email || "Unknown",
      userId: user?._id,
      userType: user?.constructor?.modelName || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: `ZK proof verification completed: ${
        isValid ? "valid" : "invalid"
      }`,
      severity: isValid ? "Low" : "Medium",
      category: "Security",
      metadata: {
        proofValid: isValid,
        publicSignalsCount: Array.isArray(publicSignals)
          ? publicSignals.length
          : 0,
        verificationResult: isValid ? "valid" : "invalid",
      },
    });

    res.json({
      success: true,
      valid: isValid,
      message: isValid ? "Proof is valid" : "Proof is invalid",
    });
  } catch (error) {
    // ✅ Log proof verification error
    await SecurityLogger.log({
      event: "Vote Cast",
      user: req.voter?.email || req.user?.email || "Unknown",
      userId: req.voter?._id || req.user?._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "ZK proof verification failed",
      severity: "High",
      category: "Security",
      metadata: {
        error: error.message,
        hasProof: !!req.body?.proof,
        hasPublicSignals: !!req.body?.publicSignals,
      },
    });

    res.status(500).json({
      error: "Failed to verify proof",
      details: error.message,
    });
  }
};

/**
 * GET /api/votes/zk-health
 * Check ZK proof system health
 */
exports.zkHealthCheck = async (req, res) => {
  try {
    const user = req.voter || req.user;

    const filesExist = [
      fs.existsSync(ZK_CONFIG.wasmPath),
      fs.existsSync(ZK_CONFIG.zkeyPath),
      fs.existsSync(ZK_CONFIG.vKeyPath),
    ];

    const allFilesExist = filesExist.every((exists) => exists);

    // ✅ Log ZK health check
    await SecurityLogger.log({
      event: "System Maintenance",
      user: user?.email || "Anonymous",
      userId: user?._id,
      userType: user?.constructor?.modelName || "System",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: allFilesExist ? "Success" : "Warning",
      details: `ZK proof system health check: ${
        allFilesExist ? "healthy" : "unhealthy"
      }`,
      severity: allFilesExist ? "Low" : "High",
      category: "System",
      metadata: {
        wasmExists: filesExist[0],
        zkeyExists: filesExist[1],
        vkeyExists: filesExist[2],
        nullifierCount: ZK_CONFIG.nullifiers.size,
        systemHealth: allFilesExist ? "healthy" : "unhealthy",
      },
    });

    res.json({
      success: allFilesExist,
      message: allFilesExist
        ? "ZK proof system is healthy"
        : "ZK proof system has missing files",
      files: {
        wasm: filesExist[0] ? "✅ Found" : "❌ Missing",
        zkey: filesExist[1] ? "✅ Found" : "❌ Missing",
        vkey: filesExist[2] ? "✅ Found" : "❌ Missing",
      },
      nullifierCount: ZK_CONFIG.nullifiers.size,
    });
  } catch (error) {
    // ✅ Log health check error
    await SecurityLogger.log({
      event: "System Maintenance",
      user: req.voter?.email || req.user?.email || "Unknown",
      userId: req.voter?._id || req.user?._id,
      userType: "System",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "ZK proof health check failed",
      severity: "Critical",
      category: "System",
      metadata: {
        error: error.message,
        endpoint: "/api/votes/zk-health",
      },
    });

    res.status(500).json({
      error: "Health check failed",
      details: error.message,
    });
  }
};

// Add this to your vote.controller.js
exports.testZKP = async (req, res) => {
  try {
    const testVoterId = new mongoose.Types.ObjectId();
    const testCandidateId = new mongoose.Types.ObjectId();
    const testElectionId = new mongoose.Types.ObjectId();

    console.log("🧪 Testing ZK proof generation...");

    const zkProof = await generateVoteProof(
      testVoterId,
      testCandidateId,
      testElectionId
    );

    console.log("🔍 Testing ZK proof verification...");

    const isValid = await verifyVoteProof(zkProof.proof, zkProof.publicSignals);

    res.json({
      success: true,
      message: "ZK proof test completed",
      results: {
        proofGenerated: !!zkProof,
        proofValid: isValid,
        nullifierHash: zkProof.nullifierHash.slice(0, 16) + "...",
        commitmentHash: zkProof.commitmentHash.slice(0, 16) + "...",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "ZK proof test failed",
      error: error.message,
    });
  }
};

/**
 * GET /api/votes/candidate-results/:candidateId
 * Get vote count for a specific candidate
 */
exports.getCandidateVoteCount = async (req, res) => {
  try {
    const { candidateId } = req.params;
    const candidate = req.candidate || req.voter; // Support both candidate and voter auth

    // ✅ Validate candidateId
    if (!mongoose.isValidObjectId(candidateId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid candidate ID",
        code: "INVALID_CANDIDATE_ID",
      });
    }

    // ✅ Security: Ensure candidate can only see their own votes (optional)
    const candidateProfile = await Candidate.findById(candidateId);
    if (!candidateProfile) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found",
        code: "CANDIDATE_NOT_FOUND",
      });
    }

    // ✅ If enforcing security, check if candidate is viewing their own results
    if (candidate && candidate.email !== candidateProfile.email) {
      await SecurityLogger.log({
        event: "Unauthorized Access",
        user: candidate.email,
        userId: candidate._id,
        userType: "Candidate",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to view another candidate's vote count",
        severity: "High",
        category: "Security",
        metadata: {
          requestedCandidateId: candidateId,
          actualCandidateEmail: candidate.email,
          targetCandidateEmail: candidateProfile.email,
        },
      });

      return res.status(403).json({
        success: false,
        message: "You can only view your own vote counts",
        code: "UNAUTHORIZED_ACCESS",
      });
    }

    // ✅ Find all elections where this candidate is participating
    const elections = await Election.find({
      "positions.candidates": candidateId,
      status: { $in: ["voting", "completed"] }, // Only active or completed elections
    }).select("title description status positions votes voteStart voteEnd");

    if (!elections.length) {
      return res.status(404).json({
        success: false,
        message: "No elections found for this candidate",
        code: "NO_ELECTIONS_FOUND",
      });
    }

    // ✅ Aggregate vote counts across all elections
    const results = [];

    for (const election of elections) {
      // Find positions where this candidate is participating
      const candidatePositions = election.positions.filter((position) =>
        position.candidates.some(
          (id) => id.toString() === candidateId.toString()
        )
      );

      for (const position of candidatePositions) {
        // Count votes for this candidate in this position
        let voteCount = 0;

        // Iterate through all votes in the election
        for (const voterRecord of election.votes || []) {
          for (const vote of voterRecord.votes || []) {
            if (
              vote.positionId.toString() === position._id.toString() &&
              vote.candidateId.toString() === candidateId.toString()
            ) {
              voteCount++;
            }
          }
        }

        // Get total votes for this position (for percentage calculation)
        let totalVotesInPosition = 0;
        for (const voterRecord of election.votes || []) {
          for (const vote of voterRecord.votes || []) {
            if (vote.positionId.toString() === position._id.toString()) {
              totalVotesInPosition++;
            }
          }
        }

        results.push({
          electionId: election._id,
          electionTitle: election.title,
          electionStatus: election.status,
          positionId: position._id,
          positionName: position.name,
          voteCount: voteCount,
          totalVotesInPosition: totalVotesInPosition,
          percentage:
            totalVotesInPosition > 0
              ? ((voteCount / totalVotesInPosition) * 100).toFixed(2)
              : "0.00",
          isElectionActive: election.status === "voting",
          electionPeriod: {
            start: election.voteStart,
            end: election.voteEnd,
          },
        });
      }
    }

    // ✅ Calculate summary statistics
    const summary = {
      totalVotes: results.reduce((sum, result) => sum + result.voteCount, 0),
      totalElections: elections.length,
      activeElections: elections.filter((e) => e.status === "voting").length,
      completedElections: elections.filter((e) => e.status === "completed")
        .length,
      averageVoteShare:
        results.length > 0
          ? (
              results.reduce(
                (sum, result) => sum + parseFloat(result.percentage),
                0
              ) / results.length
            ).toFixed(2)
          : "0.00",
    };

    // ✅ Log successful access
    await SecurityLogger.log({
      event: "Data Access",
      user: candidate?.email || candidateProfile.email,
      userId: candidate?._id || candidateProfile._id,
      userType: "Candidate",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Candidate viewed their vote counts",
      severity: "Low",
      category: "Election",
      metadata: {
        candidateId: candidateId,
        candidateName:
          candidateProfile.firstName + " " + candidateProfile.lastName,
        totalVotes: summary.totalVotes,
        electionsCount: summary.totalElections,
        endpoint: "/api/votes/candidate-results",
      },
    });

    res.json({
      success: true,
      message: "Vote counts retrieved successfully",
      data: {
        candidate: {
          id: candidateProfile._id,
          name: `${candidateProfile.firstName} ${candidateProfile.lastName}`,
          email: candidateProfile.email,
          party: candidateProfile.party,
        },
        summary: summary,
        results: results,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting candidate vote count:", error);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.candidate?.email || req.voter?.email || "Unknown",
      userId: req.candidate?._id || req.voter?._id,
      userType: "Candidate",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Error retrieving candidate vote counts",
      severity: "High",
      category: "System",
      metadata: {
        candidateId: req.params.candidateId,
        error: error.message,
        endpoint: "/api/votes/candidate-results",
      },
    });

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * GET /api/votes/my-results
 * Get vote counts for the authenticated candidate
 */
exports.getMyVoteResults = async (req, res) => {
  try {
    const voter = req.voter;

    // ✅ Find candidate profile
    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate profile not found",
        code: "CANDIDATE_NOT_FOUND",
      });
    }

    // ✅ Redirect to the specific candidate results
    req.params.candidateId = candidate._id.toString();
    return exports.getCandidateVoteCount(req, res);
  } catch (error) {
    console.error("Error getting my vote results:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * GET /api/votes/election-results/:electionId
 * Get all vote counts for an election (for admins or public viewing)
 */
exports.getElectionResults = async (req, res) => {
  try {
    const { electionId } = req.params;
    const user = req.admin || req.voter; // Support both admin and voter access

    // ✅ Validate electionId
    if (!mongoose.isValidObjectId(electionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID",
        code: "INVALID_ELECTION_ID",
      });
    }

    // ✅ Get election with votes
    const election = await Election.findById(electionId)
      .populate(
        "positions.candidates",
        "firstName lastName email party manifesto"
      )
      .lean();

    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found",
        code: "ELECTION_NOT_FOUND",
      });
    }

    // ✅ Check if results should be public
    const canViewResults =
      election.status === "completed" ||
      (user && (user.role === "admin" || user.role === "super-admin"));

    if (!canViewResults) {
      return res.status(403).json({
        success: false,
        message: "Election results not yet available",
        code: "RESULTS_NOT_AVAILABLE",
        hint: "Results will be available after the election is completed",
      });
    }

    // ✅ Aggregate votes by position and candidate
    const results = [];

    for (const position of election.positions) {
      const positionResults = {
        positionId: position._id,
        positionName: position.name,
        positionDescription: position.description,
        maxSelections: position.maxSelections,
        candidates: [],
        totalVotes: 0,
      };

      // Count votes for each candidate in this position
      const voteCounts = {};

      for (const voterRecord of election.votes || []) {
        for (const vote of voterRecord.votes || []) {
          if (vote.positionId.toString() === position._id.toString()) {
            const candidateId = vote.candidateId.toString();
            voteCounts[candidateId] = (voteCounts[candidateId] || 0) + 1;
            positionResults.totalVotes++;
          }
        }
      }

      // Format candidate results
      for (const candidate of position.candidates) {
        const voteCount = voteCounts[candidate._id.toString()] || 0;
        const percentage =
          positionResults.totalVotes > 0
            ? ((voteCount / positionResults.totalVotes) * 100).toFixed(2)
            : "0.00";

        positionResults.candidates.push({
          candidateId: candidate._id,
          name: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          party: candidate.party,
          voteCount: voteCount,
          percentage: percentage,
          isWinner: false, // Will be determined after sorting
        });
      }

      // Sort candidates by vote count and determine winners
      positionResults.candidates.sort((a, b) => b.voteCount - a.voteCount);

      // Mark winners (top candidates up to maxSelections)
      for (
        let i = 0;
        i < Math.min(position.maxSelections, positionResults.candidates.length);
        i++
      ) {
        if (positionResults.candidates[i].voteCount > 0) {
          positionResults.candidates[i].isWinner = true;
        }
      }

      results.push(positionResults);
    }

    // ✅ Calculate overall statistics
    const totalVotes = results.reduce((sum, pos) => sum + pos.totalVotes, 0);
    const totalVoters = election.votes ? election.votes.length : 0;

    // ✅ Log results access
    await SecurityLogger.log({
      event: "Data Access",
      user: user?.email || "Public",
      userId: user?._id,
      userType: user?.role || "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Election results accessed",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        electionStatus: election.status,
        totalVotes: totalVotes,
        totalVoters: totalVoters,
        accessType: user ? "authenticated" : "public",
        endpoint: "/api/votes/election-results",
      },
    });

    res.json({
      success: true,
      message: "Election results retrieved successfully",
      data: {
        election: {
          id: election._id,
          title: election.title,
          description: election.description,
          status: election.status,
          level: election.level,
          department: election.department,
          college: election.college,
          voteStart: election.voteStart,
          voteEnd: election.voteEnd,
        },
        statistics: {
          totalVotes: totalVotes,
          totalVoters: totalVoters,
          totalPositions: results.length,
          averageVotesPerPosition:
            results.length > 0
              ? (totalVotes / results.length).toFixed(2)
              : "0.00",
          voterTurnout: election.eligibleVoters
            ? ((totalVoters / election.eligibleVoters) * 100).toFixed(2) + "%"
            : "N/A",
        },
        results: results,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting election results:", error);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || req.voter?.email || "Unknown",
      userId: req.admin?._id || req.voter?._id,
      userType: req.admin?.role || req.voter?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Error retrieving election results",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params.electionId,
        error: error.message,
        endpoint: "/api/votes/election-results",
      },
    });

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
