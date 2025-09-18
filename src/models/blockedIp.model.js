const mongoose = require("mongoose");

const blockedIPSchema = new mongoose.Schema({
  ipAddress: { type: String, unique: true, required: true },
  reason: { type: String },
  blockedBy: { type: String }, // admin email
  blockedAt: { type: Date, default: Date.now },

  // ✅ Unblock tracking
  unblockedAt: { type: Date },
  unblockedBy: { type: String },
  active: { type: Boolean, default: true },
});

module.exports = mongoose.model("BlockedIP", blockedIPSchema);
