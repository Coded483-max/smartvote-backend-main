const mongoose = require("mongoose");

const { Schema } = mongoose;

/* ───────────────────────── Schema ───────────────────────── */
const electionSchema = new Schema(
  {
    /* ——— Core details ——— */
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    level: {
      type: String,
      enum: ["departmental", "college", "university", "custom"],
      required: true,
    },
    /** Only used if level === "custom" (e.g. “Sports Council”) */
    customLevelName: { type: String, trim: true },

    /* ——— ADD: Positions array ——— */
    positions: [
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        requirements: {
          minGPA: { type: Number, min: 0, max: 4.0, default: 0 },
          minYear: { type: Number, default: 1 },
          additionalRequirements: [String],
        },
        candidates: [{ type: Schema.Types.ObjectId, ref: "Candidate" }],
        maxVotes: { type: Number, default: 1 },
        maxCandidates: { type: Number, default: null },
      },
    ],
    // 🆕 On-chain mapping
    blockchainElectionId: {
      type: String, // store as string so you can safely convert to BigInt
      index: true,
    },
    /* ——— Timeline overview (legacy window kept) ——— */
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    /* ——— Lifecycle status (super-admin controls) ——— */
    status: {
      type: String,
      enum: [
        "draft",
        "candidate_registration",
        "campaign",
        "voting",
        "completed",
        "cancelled",
        "suspended",
      ],
      default: "draft",
    },

    // ✅ Status tracking fields
    statusUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    statusUpdatedAt: {
      type: Date,
      default: null,
    },

    statusNote: {
      type: String,
      trim: true,
      default: null,
    },

    // ✅ Status history tracking
    statusHistory: [
      {
        previousStatus: {
          type: String,
          required: true,
        },
        newStatus: {
          type: String,
          required: true,
        },
        changedBy: {
          type: Schema.Types.ObjectId,
          ref: "Admin",
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        note: {
          type: String,
          trim: true,
        },
      },
    ],

    department: {
      type: String,

      trim: true,
      enum: [
        "Computer Science",
        "Information Technology",
        "Mathematics",
        "Statistics",
        "Physics",
        "Chemistry",
        "Biology",
        "Geology",
        "Geography",
        "Economics",
        "Political Science",
        "Sociology",
        "Psychology",
        "English",
        "French",
        "Akan",
        "History",
        "Philosophy",
        "Religious Studies",
        "Fine Arts",
        "Music",
        "Theatre Arts",
        "Dance",
        "Nursing",
        "Medicine",
        "Pharmacy",
        "Dentistry",
        "Veterinary Medicine",
        "Agriculture",
        "Food Science",
        "Engineering",
        "Architecture",
        "Planning",
        "Law",
        "Business",
        "Accounting",
        "Marketing",
        "Management",
        "Finance",
      ],
      required: function () {
        // Only required for departmental or college elections
        return this.level === "departmental" || this.level === "college";
      },
    },

    college: {
      type: String,

      trim: true,
      enum: [
        "College of Basic And Applied Sciences",
        "College of Humanities",
        "College of Health Sciences",
        "College of Agriculture and Consumer Sciences",
        "College of Engineering",
        "School of Law",
        "Business School",
      ],
      required: function () {
        // Only required for college or departmental elections
        return this.level === "college" || this.level === "departmental";
      },
    },

    isActive: { type: Boolean, default: false },

    /* ——— Phase windows (optional) ——— */
    candidateRegStart: Date,
    candidateRegEnd: Date,
    campaignStart: Date,
    campaignEnd: Date,
    voteStart: { type: Date },
    voteEnd: { type: Date },

    /* ——— Candidate-eligibility rules ——— */
    candidateRequirements: {
      requireGPA: { type: Boolean, default: false },
      /** Only validated if requireGPA === true */
      minGPA: { type: Number, min: 0, max: 4.0 },
    },

    /* ——— Related data ——— */
    candidates: [{ type: Schema.Types.ObjectId, ref: "Candidate" }],
    allowedVoters: [{ type: Schema.Types.ObjectId, ref: "Voter" }],
    votes: [
      {
        voterId: { type: Schema.Types.ObjectId, ref: "Voter" },
        votes: [
          {
            positionId: { type: Schema.Types.ObjectId }, // Reference to positions[x]._id
            candidateId: { type: Schema.Types.ObjectId, ref: "Candidate" },
            txHash: { type: String, required: true },
            blockNumber: { type: Number, required: true },
          },
        ],
        // strictPopulate: true,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    resultsPublished: { type: Boolean, default: false },

    /* ——— Extra config kept from original model ——— */
    rules: { type: String, trim: true },
    features: {
      commentsEnabled: { type: Boolean, default: true },
      liveResultsEnabled: { type: Boolean, default: false },
    },
    stage: {
      type: String,
      enum: ["configuration", "nomination", "voting", "result"],
      default: "configuration",
    },
  },
  { timestamps: true }
);

/* ───────────────────────── Virtuals ───────────────────────── */
electionSchema.virtual("currentPhase").get(function () {
  const now = new Date();

  // Check explicit status first
  if (["cancelled", "suspended", "completed"].includes(this.status)) {
    return this.status;
  }

  // Date-based phase detection
  if (this.candidateRegStart && this.candidateRegEnd) {
    if (now >= this.candidateRegStart && now <= this.candidateRegEnd) {
      return "candidate_registration";
    }
  }

  if (this.startDate && this.endDate) {
    if (now >= this.startDate && now <= this.endDate) {
      return "voting";
    }
  }

  if (this.endDate && now > this.endDate) {
    return "completed";
  }

  return "draft";
});

electionSchema.virtual("isCandidateRegOpen").get(function () {
  const now = new Date();
  return (
    this.status === "candidate_registration" &&
    this.candidateRegStart &&
    this.candidateRegEnd &&
    now >= this.candidateRegStart &&
    now <= this.candidateRegEnd
  );
});

electionSchema.virtual("isVotingOpen").get(function () {
  const now = new Date();
  return (
    this.status === "voting" &&
    this.startDate &&
    this.endDate &&
    now >= this.startDate &&
    now <= this.endDate
  );
});

/* ───────────────────────── Statics ───────────────────────── */
electionSchema.statics.getLiveResults = function (electionId) {
  return this.aggregate([
    { $match: { _id: mongoose.Types.ObjectId(electionId) } },
    { $unwind: "$votes" },
    {
      $group: {
        _id: "$votes.candidateId",
        votes: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "candidates",
        localField: "_id",
        foreignField: "_id",
        as: "candidate",
      },
    },
    { $unwind: "$candidate" },
    {
      $project: {
        _id: 0,
        candidateId: "$candidate._id",
        candidateName: "$candidate.fullName",
        votes: 1,
      },
    },
    { $sort: { votes: -1 } },
  ]);
};

// Add this method to your Election schema

electionSchema.methods.syncCandidatesToTopLevel = function () {
  // Extract all candidate IDs from all positions
  const allCandidates = [];

  this.positions.forEach((position) => {
    if (position.candidates && position.candidates.length > 0) {
      allCandidates.push(...position.candidates);
    }
  });

  // Remove duplicates (in case a candidate is in multiple positions)
  const uniqueCandidates = [
    ...new Set(allCandidates.map((id) => id.toString())),
  ];

  // Update the top-level candidates array
  this.candidates = uniqueCandidates.map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  return this.candidates;
};

// Add a pre-save hook to automatically sync candidates
electionSchema.pre("save", function (next) {
  // Only sync if positions have been modified
  if (this.isModified("positions")) {
    this.syncCandidatesToTopLevel();
  }
  next();
});

electionSchema.index({ status: 1, voteStart: 1, voteEnd: 1 });
electionSchema.index({ "votes.voterId": 1 });
electionSchema.index({ createdAt: -1 });
/* ───────────────────────── Model export ───────────────────────── */
module.exports = mongoose.model("Election", electionSchema);
