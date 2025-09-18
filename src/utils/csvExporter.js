const { Parser } = require("json2csv");

/**
 * Stream an array of plain objects as CSV to the response.
 *
 * @param {import("express").Response} res
 * @param {Array<Object>} data
 * @param {string} [filename="export.csv"]
 */
function exportCSV(res, data, filename = "export.csv") {
  const parser = new Parser();
  const csv    = parser.parse(data);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  res.status(200).send(csv);
}

module.exports = { exportCSV };
