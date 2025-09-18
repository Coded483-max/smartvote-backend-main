const mongoose = require("mongoose");

const forumQuestionSchema = new mongoose.Schema(
  {
    voter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voter",
      required: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
    },
    election: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      default: null,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      minLength: 10,
      maxLength: 1000,
    },
    answer: {
      type: String,
      trim: true,
      maxLength: 2000,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "answered", "hidden"],
      default: "pending",
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
forumQuestionSchema.index({ candidate: 1, status: 1 });
forumQuestionSchema.index({ voter: 1, createdAt: -1 });
forumQuestionSchema.index({ status: 1, answeredAt: -1 });

module.exports = mongoose.model("ForumQuestion", forumQuestionSchema);
