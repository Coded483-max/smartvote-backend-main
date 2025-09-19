const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Schema } = mongoose;

const candidateSchema = new Schema(
  {
    /* ————————————————— Personal Profile ————————————————— */
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    studentId: {
      type: String,
      required: true,
      // unique: true,
      match: [/^\d{8}$/, "Student ID must be exactly 8 digits"],
    },

    email: {
      type: String,
      required: true,
      // unique: true,
      lowercase: true,
      match: [
        /^[a-z0-9]+@st\.ug\.edu\.gh$/,
        "Must use your UG school e-mail (@st.ug.edu.gh)",
      ],
    },

    /* ————————————————— Contact Information ————————————————— */
    mobileNumber: {
      type: String,
      required: true,
      match: [/^\+?[0-9\s]{10,15}$/, "Phone number is invalid"],
    },

    /* ————————————————— Academic Information ————————————————— */
    department: {
      type: String,
      required: true,
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
    },

    college: {
      type: String,
      required: true,
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
    },

    yearOfStudy: {
      type: String,
      required: true,
      min: 1,
      max: 7,
    },

    gpa: {
      type: Number,
      min: 0,
      max: 4.0,
      required: function () {
        // GPA required if applying for positions that require it
        return this.requiresGPA || false;
      },
    },
    candidateBlockchainId: {
      type: Number, // or String if you store it as BigInt then cast
      required: true,
      unique: false, // unique per election, but multiple elections can reuse
    },
    electionId: {
      type: Schema.Types.ObjectId,
      ref: "Election",
      required: true,
    },

    positionId: {
      type: Schema.Types.ObjectId,
      ref: "Position",
      required: true,
    },

    // election: { type: mongoose.Schema.Types.ObjectId, ref: "Election" },

    /* ————————————————— Position Information ————————————————— */
    position: { type: String, required: true, trim: true },

    /* ————————————————— Authentication (for candidate portal) ————————————————— */
    password: {
      type: String,
      required: function () {
        return this.hasAccount || false;
      },
      minlength: 6,
    },

    hasAccount: { type: Boolean, default: false },

    /* ————————————————— File Uploads ————————————————— */
    photoUrl: { type: String, default: null },
    transcriptUrl: { type: String, default: null },
    manifestoUrl: { type: String, default: null },

    /* ————————————————— Additional Documents ————————————————— */
    documentsUploaded: {
      transcript: { type: Boolean, default: false },
      manifesto: { type: Boolean, default: false },
      photo: { type: Boolean, default: false },
      additionalDocs: [
        {
          name: String,
          url: String,
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
    },

    /* ————————————————— Candidate Qualifications ————————————————— */
    qualifications: [
      {
        type: String,
        trim: true,
      },
    ],

    experience: [
      {
        title: { type: String, required: true, trim: true },
        organization: { type: String, required: true, trim: true },
        startDate: { type: Date, required: true },
        endDate: Date,
        description: { type: String, trim: true },
        isCurrent: { type: Boolean, default: false },
      },
    ],

    achievements: [
      {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        dateAchieved: Date,
        organization: String,
      },
    ],

    /* ————————————————— Manifesto & Campaign ————————————————— */
    manifesto: {
      type: String,
      trim: true,
      maxlength: 5000, // Character limit for manifesto
    },

    campaignSlogan: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    promises: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Promise",
      },
    ],

    /* ————————————————— Social Media & Contact ————————————————— */
    socialLinks: {
      facebook: { type: String, trim: true, default: "" },
      twitter: { type: String, trim: true, default: "" },
      instagram: { type: String, trim: true, default: "" },
      linkedin: { type: String, trim: true, default: "" },
      website: { type: String, trim: true, default: "" },
      youtube: { type: String, trim: true, default: "" },
    },

    /* ————————————————— Approval Workflow ————————————————— */
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    approvalStatusMessage: {
      type: String,
      default: "Awaiting review",
    },

    /* ————————————————— Admin Actions ————————————————— */
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    approvalNote: {
      type: String,
      trim: true,
      default: null,
    },

    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    /* ————————————————— Campaign Features ————————————————— */
    forumInteractions: [
      {
        voterId: { type: Schema.Types.ObjectId, ref: "Voter" },
        message: { type: String, required: true, trim: true },
        timestamp: { type: Date, default: Date.now },
        isResponse: { type: Boolean, default: false },
        parentId: { type: Schema.Types.ObjectId, default: null },
      },
    ],

    /* ————————————————— Statistics & Analytics ————————————————— */
    campaignStats: {
      profileViews: { type: Number, default: 0 },
      manifestoViews: { type: Number, default: 0 },
      socialMediaClicks: { type: Number, default: 0 },
      forumEngagement: { type: Number, default: 0 },
      lastViewedAt: Date,
    },

    /* ————————————————— Verification & Security ————————————————— */
    isVerified: { type: Boolean, default: false },

    verificationCode: {
      type: String,
      default: function () {
        return crypto.randomInt(100000, 1000000).toString();
      },
    },

    verificationCodeExpires: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      },
    },

    /* ————————————————— Password Reset ————————————————— */
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    /* ————————————————— Activity Tracking ————————————————— */
    lastLoginAt: Date,
    loginAttempts: { type: Number, default: 0 },
    accountLocked: { type: Boolean, default: false },
    lockUntil: Date,

    /* ————————————————— Application Status ————————————————— */
    applicationStage: {
      type: String,
      enum: [
        "profile_setup", // Initial registration
        "document_upload", // Uploading required documents
        "manifesto_writing", // Writing campaign manifesto
        "review_pending", // Submitted for admin review
        "approved", // Approved by admin
        "rejected", // Rejected by admin
        "campaigning", // Active campaigning phase
      ],
      default: "profile_setup",
    },

    applicationCompletedAt: Date,
    applicationSubmittedAt: Date,

    campaignBudget: {
      allocated: { type: Number, default: 0 },
      spent: { type: Number, default: 0 },
      currency: { type: String, default: "GHS" },
    },

    /* ————————————————— Additional Settings ————————————————— */
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      profileVisibility: {
        type: String,
        enum: ["public", "voters_only", "private"],
        default: "public",
      },
    },

    /* ————————————————— Metadata ————————————————— */
    registrationIP: String,
    userAgent: String,

    tags: [{ type: String, trim: true }], // Admin tags for organization

    notes: {
      type: String,
      trim: true, // Admin notes
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ————————————————— Virtual Fields ————————————————— */
candidateSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

candidateSchema.virtual("name").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

candidateSchema.virtual("isApplicationComplete").get(function () {
  return (
    this.applicationStage === "approved" ||
    this.applicationStage === "campaigning"
  );
});

candidateSchema.virtual("canCampaign").get(function () {
  return (
    this.approvalStatus === "approved" && this.applicationStage !== "rejected"
  );
});

candidateSchema.virtual("profileCompletionPercentage").get(function () {
  let completed = 0;
  const totalFields = 8;

  if (this.firstName && this.lastName) completed += 1;
  if (this.email) completed += 1;
  if (this.mobileNumber) completed += 1; // Correct field name
  if (this.department) completed += 1;
  if (this.photoUrl) completed += 1;
  if (this.manifesto) completed += 1;
  if (Array.isArray(this.qualifications) && this.qualifications.length > 0)
    completed += 1;
  if (Array.isArray(this.campaignPromises) && this.campaignPromises.length > 0)
    completed += 1;

  return Math.round((completed / totalFields) * 100);
});

/* ————————————————— Indexes ————————————————— */
// candidateSchema.index({ studentId: 1 });
// candidateSchema.index({ email: 1 });
candidateSchema.index({ approvalStatus: 1 });
candidateSchema.index({ position: 1 });
candidateSchema.index({ department: 1 });
candidateSchema.index({ college: 1 });
candidateSchema.index({ electionId: 1 });
candidateSchema.index({ createdAt: -1 });
candidateSchema.index({ approvedAt: -1 });
candidateSchema.index({ electionId: 1, approvalStatus: 1 });
candidateSchema.index(
  { studentId: 1, electionId: 1, positionId: 1 },
  { unique: true }
);

/* ————————————————— Pre-save Middleware ————————————————— */
candidateSchema.pre("save", async function (next) {
  // Hash password if modified and account exists
  if (this.isModified("password") && this.hasAccount) {
    this.password = await bcrypt.hash(this.password, 10);
  }

  // Rejection must carry a reason
  if (this.approvalStatus === "rejected" && !this.rejectionReason) {
    return next(
      new Error(
        "Rejection reason is required when approval status is 'rejected'."
      )
    );
  }

  // Prevent campaigning before approval
  if (
    this.approvalStatus !== "approved" &&
    ((Array.isArray(this.promises) && this.promises.length > 0) ||
      (Array.isArray(this.forumInteractions) &&
        this.forumInteractions.length > 0))
  ) {
    return next(
      new Error(
        "Candidate must be approved before posting campaign promises or forum messages."
      )
    );
  }

  // Update application completion status
  if (this.isModified("approvalStatus") && this.approvalStatus === "approved") {
    this.applicationCompletedAt = new Date();
    this.applicationStage = "approved";
  }

  // Update timestamps for approval/rejection
  if (this.isModified("approvalStatus")) {
    if (this.approvalStatus === "approved" && !this.approvedAt) {
      this.approvedAt = new Date();
    } else if (this.approvalStatus === "rejected" && !this.rejectedAt) {
      this.rejectedAt = new Date();
    }
  }

  next();
});

/* ————————————————— Instance Methods ————————————————— */
candidateSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.hasAccount || !this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

candidateSchema.methods.generateVerificationCode = function () {
  this.verificationCode = crypto.randomInt(100000, 1000000).toString();
  this.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
  return this.verificationCode;
};

candidateSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000);
  return resetToken;
};

candidateSchema.methods.incrementProfileView = function () {
  this.campaignStats.profileViews += 1;
  this.campaignStats.lastViewedAt = new Date();
  return this.save();
};

candidateSchema.methods.lockAccount = function () {
  this.accountLocked = true;
  this.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
  this.loginAttempts = 0;
};

candidateSchema.methods.updateLoginInfo = function (ip, userAgent) {
  this.lastLoginAt = new Date();
  this.registrationIP = this.registrationIP || ip;
  this.userAgent = this.userAgent || userAgent;
  this.loginAttempts = 0;
};

/* ————————————————— Static Methods ————————————————— */
candidateSchema.statics.findByStudentId = function (studentId) {
  return this.findOne({ studentId });
};

candidateSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

candidateSchema.statics.findApproved = function () {
  return this.find({ approvalStatus: "approved" });
};

candidateSchema.statics.findPending = function () {
  return this.find({ approvalStatus: "pending" });
};

candidateSchema.statics.findByPosition = function (position) {
  return this.find({ position });
};

candidateSchema.statics.findByElection = function (electionId) {
  return this.find({ electionId });
};

candidateSchema.statics.findByDepartment = function (department) {
  return this.find({ department });
};

/* ————————————————— Model Export ————————————————— */
module.exports = mongoose.model("Candidate", candidateSchema);
