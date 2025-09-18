const { contractRO } = require("./blockchain");
const Election       = require("../models/election.model");
const mongoose       = require("mongoose");

/* Helper: convert the uint256 we stored on-chain back to a Mongo ObjectId */
function uintToObjectId(uint) {
  const hex = BigInt(uint).toString(16).padStart(24, "0");
  return new mongoose.Types.ObjectId("000000000000000000" + hex);
}

/**
 * Initialise blockchain listeners.
 * @param {import("socket.io").Server} [io] – optional Socket.IO instance; if
 *        provided we emit `voteCast` events to all clients.
 */
function startListeners(io) {
  console.log("🔊  SmartVote event listener initialised");

  contractRO.on(
    "VoteCast",
    /** @param {bigint} electionIdU @param {bigint} candidateIdU */
    async (electionIdU, candidateIdU, voterAddr, ev) => {
      try {
        /* ── Sync to Mongo if we don’t yet have this tx ── */
        const electionId  = uintToObjectId(electionIdU);
        const candidateId = uintToObjectId(candidateIdU);

        const election = await Election.findById(electionId);
        if (!election) return; // not in our DB

        const exists = election.votes.some(v => v.txHash === ev.transactionHash);
        if (exists) return;

        election.votes.push({
          voterId:     null,          // on-chain we don’t know the student
          candidateId,
          txHash:      ev.transactionHash,
          createdAt:   new Date(),
        });
        await election.save();

        console.log(`↳ VoteCast synced (${ev.transactionHash.slice(0,10)}…)`);

        /* ── WebSocket push (no PII) ── */
        if (io && typeof io.emit === "function") {
          io.emit("voteCast", {
            electionId:  electionIdU.toString(),
            candidateId: candidateIdU.toString(),
            txHash:      ev.transactionHash,
            timestamp:   Date.now(),
          });
        }
      } catch (err) {
        console.error("Listener sync error:", err);
      }
    }
  );
}

module.exports = { startListeners };
