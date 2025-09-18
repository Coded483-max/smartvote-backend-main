const express = require("express");
const router = express.Router();
const Candidate = require("../models/candidate.model");

// GET /files/:category/:filename
router.get("/:category/:filename", async (req, res) => {
  try {
    const { category, filename } = req.params;

    // Find the candidate record by filename
    const candidate = await Candidate.findOne({
      $or: [
        { photoFilename: filename },
        { transcriptFilename: filename },
        { manifestoFilename: filename },
      ],
    });

    if (!candidate) {
      return res.status(404).json({ message: "File not found" });
    }

    let fileUrl;
    switch (category) {
      case "photos":
        fileUrl = candidate.photoUrl;
        break;
      case "transcript":
        fileUrl = candidate.transcriptUrl;
        break;
      case "manifesto":
        fileUrl = candidate.manifestoUrl;
        break;
      default:
        return res.status(400).json({ message: "Invalid category" });
    }

    if (!fileUrl) {
      return res.status(404).json({ message: "File URL not found" });
    }

    return res.json({ url: fileUrl });
  } catch (error) {
    console.error("Error serving file:", error);
    res.status(500).json({ message: "Error serving file" });
  }
});

module.exports = router;
