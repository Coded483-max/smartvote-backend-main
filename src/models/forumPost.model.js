const mongoose = require("mongoose");

const forumPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxLength: 200 },
    content: { type: String, required: true, maxLength: 2000 },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "authorType",
      required: true,
    },
    authorType: {
      type: String,
      required: true,
      enum: ["Candidate", "Voter", "Admin"],
    },

    // Forum categories
    category: {
      type: String,
      enum: ["general", "policy", "qa", "debate", "announcement"],
      default: "general",
    },

    // Election context
    election: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: true,
    },

    // Position-specific discussions
    position: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Position",
    },

    // Replies/Comments
    replies: [
      {
        author: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "replies.authorType",
          required: true,
        },
        authorType: {
          type: String,
          enum: ["Candidate", "Voter", "Admin"],
        },
        content: { type: String, required: true, maxLength: 1000 },
        createdAt: { type: Date, default: Date.now },
        likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Voter" }],
        isHidden: { type: Boolean, default: false },
      },
    ],

    // Engagement metrics
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Voter" }],

    // Moderation
    isPinned: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },

    // Tags for better organization
    tags: [{ type: String, maxLength: 50 }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for reply count
forumPostSchema.virtual("replyCount").get(function () {
  return this.replies
    ? this.replies.filter((reply) => !reply.isHidden).length
    : 0;
});

// Virtual for like count
forumPostSchema.virtual("likeCount").get(function () {
  return this.likes ? this.likes.length : 0;
});

const ForumPost = mongoose.model("ForumPost", forumPostSchema);

module.exports = ForumPost;
