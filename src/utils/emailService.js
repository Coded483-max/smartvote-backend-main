const nodemailer = require("nodemailer");

// ✅ FIX: Use createTransport (not createTransporter)
const createTransporter = () => {
  const isSecure = process.env.SMTP_SECURE === "true";

  return nodemailer.createTransport({
    // ✅ FIXED: createTransport not createTransporter
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || (isSecure ? 465 : 587)),
    secure: isSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });
};

// ✅ Create single transporter instance
const transporter = createTransporter();

/* ───────── Verify once on boot ───────── */
transporter.verify((err) => {
  if (err) {
    console.error("❌ SMTP connection failed:", err.message);
  } else {
    console.log("✅ SMTP transporter ready");
  }
});

/* ───────── Generic wrapper ───────── */
async function sendEmail({ to, subject, html, text }) {
  return transporter.sendMail({
    from: `"SmartVote" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    text,
  });
}

/* ───────── Convenience helpers ───────── */
async function sendVerificationEmail(to, code) {
  return sendEmail({
    to,
    subject: "Verify your University of Ghana e-mail",
    html: `
      <p>Hello,</p>
      <p>Your SmartVote verification code is:</p>
      <h2 style="letter-spacing:3px">${code}</h2>
      <p>This code will expire in <strong>15 minutes</strong>.</p>
    `,
    text: `Your SmartVote verification code is: ${code}`,
  });
}

async function sendPasswordResetEmail(to, link) {
  return sendEmail({
    to,
    subject: "SmartVote Password Reset",
    html: `
      <p>You requested a password reset for your SmartVote account.</p>
      <p>Click the link below to set a new password. The link is valid for 1 hour.</p>
      <a href="${link}" target="_blank">${link}</a>
    `,
    text: `Reset your SmartVote password here (valid 1 h): ${link}`,
  });
}

const getElectionAnnouncementTemplate = (voter, election) => {
  const voterName = `${voter.firstName} ${voter.lastName}`;
  const electionUrl = `${process.env.FRONTEND_URL}/elections/${election._id}`;

  return {
    subject: `📢 New Election Available: ${election.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .election-info { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #667eea; }
          .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🗳️ SmartVote</h1>
            <h2>New Election Announcement</h2>
          </div>
          
          <div class="content">
            <h3>Hello ${voterName}! 👋</h3>
            
            <p>Great news! A new election has been created and you're eligible to participate.</p>
            
            <div class="election-info">
              <h4>📋 Election Details:</h4>
              <p><strong>Title:</strong> ${election.title}</p>
              <p><strong>Description:</strong> ${election.description}</p>
              <p><strong>Level:</strong> ${
                election.level.charAt(0).toUpperCase() + election.level.slice(1)
              }</p>
              ${
                election.department
                  ? `<p><strong>Department:</strong> ${election.department}</p>`
                  : ""
              }
              ${
                election.college
                  ? `<p><strong>College:</strong> ${election.college}</p>`
                  : ""
              }
              <p><strong>Election Period:</strong> ${new Date(
                election.startDate
              ).toLocaleDateString()} - ${new Date(
      election.endDate
    ).toLocaleDateString()}</p>
              ${
                election.candidateRegStart
                  ? `<p><strong>Candidate Registration:</strong> ${new Date(
                      election.candidateRegStart
                    ).toLocaleDateString()} - ${new Date(
                      election.candidateRegEnd
                    ).toLocaleDateString()}</p>`
                  : ""
              }
              ${
                election.voteStart
                  ? `<p><strong>Voting Period:</strong> ${new Date(
                      election.voteStart
                    ).toLocaleDateString()} - ${new Date(
                      election.voteEnd
                    ).toLocaleDateString()}</p>`
                  : ""
              }
            </div>

            <div class="election-info">
              <h4>🏆 Available Positions:</h4>
              <ul>
                ${election.positions
                  .map(
                    (pos) =>
                      `<li><strong>${pos.name}</strong> - ${pos.description}</li>`
                  )
                  .join("")}
              </ul>
            </div>

            <p><strong>What you can do:</strong></p>
            <ul>
              <li>✅ <strong>Vote</strong> for your preferred candidates when voting opens</li>
              <li>🎯 <strong>Apply as a candidate</strong> if you meet the requirements</li>
              <li>📖 <strong>Read election rules</strong> and candidate information</li>
            </ul>

            <div style="text-align: center;">
              <a href="${electionUrl}" class="cta-button">
                View Election Details 🗳️
              </a>
            </div>

            <div class="footer">
              <p>📧 This email was sent to you because you're a verified voter eligible for this election.</p>
              <p>If you have any questions, please contact the election administrators.</p>
              <p><small>SmartVote - University of Ghana Student Elections</small></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      New Election Available: ${election.title}
      
      Hello ${voterName}!
      
      A new election has been created and you're eligible to participate.
      
      Election Details:
      - Title: ${election.title}
      - Description: ${election.description}
      - Level: ${election.level}
      ${election.department ? `- Department: ${election.department}` : ""}
      ${election.college ? `- College: ${election.college}` : ""}
      - Election Period: ${new Date(
        election.startDate
      ).toLocaleDateString()} - ${new Date(
      election.endDate
    ).toLocaleDateString()}
      
      Available Positions:
      ${election.positions
        .map((pos) => `- ${pos.name}: ${pos.description}`)
        .join("\n")}
      
      View full details: ${electionUrl}
      
      SmartVote - University of Ghana Student Elections
    `,
  };
};

const sendElectionAnnouncement = async (voters, election) => {
  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  console.log(
    `📧 Sending election announcements to ${voters.length} voters...`
  );

  // Send emails in batches to avoid overwhelming the server
  const batchSize = 10;
  for (let i = 0; i < voters.length; i += batchSize) {
    const batch = voters.slice(i, i + batchSize);

    const promises = batch.map(async (voter) => {
      try {
        const emailTemplate = getElectionAnnouncementTemplate(voter, election);

        await sendEmail({
          to: voter.email,
          subject: emailTemplate.subject,
          html: emailTemplate.html,
          text: emailTemplate.text,
        });

        console.log(`✅ Email sent to ${voter.email}`);
        results.success++;
      } catch (error) {
        console.error(
          `❌ Failed to send email to ${voter.email}:`,
          error.message
        );
        results.failed++;
        results.errors.push({
          email: voter.email,
          error: error.message,
        });
      }
    });

    await Promise.allSettled(promises);

    // Small delay between batches
    if (i + batchSize < voters.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(
    `📊 Email sending complete: ${results.success} sent, ${results.failed} failed`
  );
  return results;
};

const testEmailConfig = async () => {
  try {
    await transporter.verify();
    console.log("✅ Email configuration is valid");
    return true;
  } catch (error) {
    console.error("❌ Email configuration error:", error.message);
    return false;
  }
};

/* ───────── Exports ───────── */
module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendElectionAnnouncement,
  testEmailConfig,
};
