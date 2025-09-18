const cron = require("node-cron");
const Election = require("../models/election.model");

cron.schedule("*/5 * * * *", async () => {
  const now = new Date();

  console.log("Election status scheduler running at", new Date());
  const elections = await Election.find();

  for (const election of elections) {
    let newStatus = election.status;

    if (now < election.candidateRegStart) {
      newStatus = "draft";
    } else if (
      now >= election.candidateRegStart &&
      now < election.candidateRegEnd
    ) {
      newStatus = "candidate_registration";
    } else if (now >= election.campaignStart && now < election.campaignEnd) {
      newStatus = "campaign";
    } else if (now >= election.voteStart && now < election.voteEnd) {
      newStatus = "voting";
    } else if (now >= election.voteEnd) {
      newStatus = "completed";
    }

    if (newStatus !== election.status) {
      election.status = newStatus;
      election.statusUpdatedAt = now;
      await election.save();
      console.log(`Election ${election.title} status updated to ${newStatus}`);
    }
  }
});
