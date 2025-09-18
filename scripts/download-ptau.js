// scripts/download-ptau.js - Updated with multiple sources
const https = require("https");
const fs = require("fs");
const path = require("path");

// Multiple sources for ptau files
const PTAU_SOURCES = {
  12: [
    "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_12.ptau",
    "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau",
    "https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/sealed/phase1radix2m12",
  ],
  14: [
    "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau",
    "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau",
  ],
};

async function downloadPowerOfTau(size = 12) {
  console.log(`🔧 Downloading Powers of Tau (2^${size})...`);

  const buildDir = path.join(__dirname, "..", "build");
  const ptauPath = path.join(buildDir, "powersoftau.ptau");

  // Ensure build directory exists
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // Check if file already exists
  if (fs.existsSync(ptauPath)) {
    const stats = fs.statSync(ptauPath);
    console.log(
      `✅ Powers of Tau file already exists (${(
        stats.size /
        1024 /
        1024
      ).toFixed(2)} MB)`
    );
    return ptauPath;
  }

  const urls = PTAU_SOURCES[size];
  if (!urls) {
    throw new Error(`No sources available for size ${size}`);
  }

  // Try each URL until one works
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`📥 Trying source ${i + 1}/${urls.length}: ${url}`);

    try {
      await downloadFromUrl(url, ptauPath);
      console.log(`✅ Download successful from source ${i + 1}`);
      return ptauPath;
    } catch (error) {
      console.log(`❌ Source ${i + 1} failed: ${error.message}`);

      // Clean up partial file
      if (fs.existsSync(ptauPath)) {
        fs.unlinkSync(ptauPath);
      }

      // If this was the last URL, throw the error
      if (i === urls.length - 1) {
        throw new Error(
          `All download sources failed. Last error: ${error.message}`
        );
      }
    }
  }
}

function downloadFromUrl(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    let redirectCount = 0;
    const maxRedirects = 5;

    function makeRequest(requestUrl) {
      const protocol = requestUrl.startsWith("https:")
        ? https
        : require("http");

      protocol
        .get(requestUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            if (redirectCount >= maxRedirects) {
              reject(new Error("Too many redirects"));
              return;
            }
            redirectCount++;
            console.log(`🔄 Redirect to: ${response.headers.location}`);
            return makeRequest(response.headers.location);
          }

          if (response.statusCode !== 200) {
            reject(
              new Error(
                `HTTP ${response.statusCode}: ${response.statusMessage}`
              )
            );
            return;
          }

          const totalSize = parseInt(response.headers["content-length"] || "0");
          let downloadedSize = 0;
          let lastProgress = 0;

          console.log(
            `📊 File size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`
          );

          response.on("data", (chunk) => {
            downloadedSize += chunk.length;
            const progress = Math.floor((downloadedSize / totalSize) * 100);

            // Update progress every 10%
            if (progress >= lastProgress + 10 || progress === 100) {
              lastProgress = progress;
              process.stdout.write(
                `\r📊 Progress: ${progress}% (${(
                  downloadedSize /
                  1024 /
                  1024
                ).toFixed(1)} MB / ${(totalSize / 1024 / 1024).toFixed(1)} MB)`
              );
            }
          });

          response.pipe(file);

          file.on("finish", () => {
            file.close();
            console.log("\n✅ Download completed!");

            // Verify file size
            const stats = fs.statSync(outputPath);
            console.log(
              `📊 Final file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
            );

            resolve(outputPath);
          });

          file.on("error", (err) => {
            fs.unlink(outputPath, () => {});
            reject(err);
          });
        })
        .on("error", (error) => {
          fs.unlink(outputPath, () => {});
          reject(error);
        });
    }

    makeRequest(url);
  });
}

if (require.main === module) {
  const size = process.argv[2] || 12;
  downloadPowerOfTau(parseInt(size))
    .then((path) => {
      console.log(`🎉 Powers of Tau ready at: ${path}`);
    })
    .catch((error) => {
      console.error("❌ Download failed:", error.message);
      console.log("\n💡 Alternative options:");
      console.log(
        "1. Try generating a development version: npm run zkp:generate-dev"
      );
      console.log("2. Download manually and place in build/powersoftau.ptau");
      process.exit(1);
    });
}

module.exports = { downloadPowerOfTau };
