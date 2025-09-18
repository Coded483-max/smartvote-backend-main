require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SmartVoteV2 gas & logic", function () {
  let sv, owner, voter;

  beforeEach(async () => {
    [owner, voter] = await ethers.getSigners();
    const SV = await ethers.getContractFactory("SmartVoteV2");
    sv = await SV.deploy();
    await sv.waitForDeployment();
  });

  it("records a vote and prevents double-vote", async () => {
    const eId = 1n, cId = 2n;

    const tx = await sv.connect(voter).vote(eId, cId);
    await tx.wait();

    expect(await sv.getVotes(eId, cId)).to.equal(1);

    await expect(sv.connect(voter).vote(eId, cId))
      .to.be.revertedWith("Already voted");
  });
});
