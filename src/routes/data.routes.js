const express = require("express");
const router = express.Router();

const dataController = require("../controllers/data.controller");

// **New Public Data Routes** (for frontend dropdowns)
router.get("/colleges", dataController.getAllColleges);
router.get("/departments", dataController.getAllDepartments);
router.get("/departments/by-college", dataController.getDepartmentsByCollege);
router.get("/academic-years", dataController.getAcademicYears);

module.exports = router;
