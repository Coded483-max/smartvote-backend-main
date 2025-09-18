const mongoose = require("mongoose");
const { Schema } = mongoose;

const commentSubSchema = new mongoose.Schema(
  {
    voter: { type: Schema.Types.ObjectId, ref: "Voter", required: true },
    text: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const promiseSchema = new mongoose.Schema(
  {
    /* ——— Core fields ——— */
    title: { type: String, required: true, trim: true },
    details: { type: String, required: true, trim: true },

    /* ——— Relationships ——— */
    candidate: {
      type: Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
    },
    election: { type: Schema.Types.ObjectId, ref: "Election", required: true },

    /* ——— Voter feedback ——— */
    comments: [commentSubSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Promise", promiseSchema);
