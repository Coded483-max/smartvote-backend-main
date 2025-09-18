const mongoose = require("mongoose");

const nullifierSchema = new mongoose.Schema(
  {
    hash: {
      type: String,
      required: true,
      index: true,
    },
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: true,
    },
    voterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voter",
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookups
nullifierSchema.index({ hash: 1, electionId: 1 }, { unique: true });

module.exports = mongoose.model("Nullifier", nullifierSchema);
