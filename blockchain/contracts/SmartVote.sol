// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Groth16Verifier.sol";

contract SmartVote {
 Groth16Verifier public verifier;
 address public owner;
 uint256 public electionCount;
 uint256 public candidateCount; // 🔹 global candidate counter

 event ElectionCreated(uint256 indexed id, string title);
 event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId);
 event VoteCast(
     uint256 indexed electionId,
     uint256 indexed candidateId,
     uint256 nullifierHash,
     uint256 commitmentHash
 );

 modifier onlyOwner() {
     require(msg.sender == owner, "Only owner");
     _;
 }

 constructor(address _verifier) {
     owner = msg.sender;
     verifier = Groth16Verifier(_verifier);
 }

 struct Election {
     string title;
     bool exists;
     uint256 startTime;
     uint256 endTime;
     uint256[] candidateIds;               
     mapping(uint256 => uint256) tally;    
     mapping(uint256 => bool) isCandidate; 
     mapping(uint256 => bool) usedNullifiers; 
     uint256[] commitments;                
 }

 mapping(uint256 => Election) private elections;

 // ---------- Create election ----------
 function createElection(
     string calldata _title,
     uint256 _startTime,
     uint256 _endTime
 ) external onlyOwner returns (uint256) {
     require(_endTime > _startTime, "End must be after start");

     uint256 id = ++electionCount;
     Election storage e = elections[id];
     e.title = _title;
     e.startTime = _startTime;
     e.endTime = _endTime;
     e.exists = true;

     emit ElectionCreated(id, _title);
     return id;
 }

 // ---------- Add candidate(s) ----------
 // Auto-ID candidate
 function addCandidate(uint256 _electionId) external onlyOwner returns (uint256) {
     require(elections[_electionId].exists, "Election not found");

     candidateCount += 1;
     uint256 candidateId = candidateCount;

     Election storage e = elections[_electionId];
     require(!e.isCandidate[candidateId], "Candidate already added");

     e.isCandidate[candidateId] = true;
     e.candidateIds.push(candidateId);

     emit CandidateAdded(_electionId, candidateId);
     return candidateId; 
 }

 // Add multiple candidates in one call
 function addCandidatesBatch(uint256 _electionId, uint256 numCandidates) 
     external onlyOwner returns (uint256[] memory) 
 {
     require(elections[_electionId].exists, "Election not found");
     uint256[] memory assignedIds = new uint256[](numCandidates);

     for (uint i = 0; i < numCandidates; i++) {
         candidateCount += 1;
         uint256 candidateId = candidateCount;

         Election storage e = elections[_electionId];
         e.isCandidate[candidateId] = true;
         e.candidateIds.push(candidateId);

         emit CandidateAdded(_electionId, candidateId);
         assignedIds[i] = candidateId;
     }

     return assignedIds;
 }

 // ---------- View helpers ----------
 function getElection(uint256 _electionId)
     external
     view
     returns (bool exists, uint256 startTime, uint256 endTime)
 {
     Election storage e = elections[_electionId];
     return (e.exists, e.startTime, e.endTime);
 }

 function getCandidates(uint256 _electionId) external view returns (uint256[] memory) {
     require(elections[_electionId].exists, "Election not found");
     return elections[_electionId].candidateIds;
 }

 // ---------- Batch voting ----------
 function voteBatch(
     uint256 _electionId,
     uint256[] calldata candidateIds,
     uint[2][] calldata a,
     uint[2][2][] calldata b,
     uint[2][] calldata c,
     uint256[3][] calldata input
 ) external {
     require(elections[_electionId].exists, "Election does not exist");
     require(
         candidateIds.length == a.length &&
         a.length == b.length &&
         b.length == c.length &&
         c.length == input.length,
         "Mismatched input lengths"
     );

     Election storage e = elections[_electionId];

     for (uint256 i = 0; i < candidateIds.length; i++) {
         uint256 candidateId = candidateIds[i];
         require(e.isCandidate[candidateId], "Candidate not registered");

         uint256 nullifierHash = input[i][0];
         uint256 commitmentHash = input[i][1];
         uint256 validFlag = input[i][2];

         require(verifier.verifyProof(a[i], b[i], c[i], input[i]), "Invalid proof");
         require(validFlag == 1, "Proof not valid");
         require(!e.usedNullifiers[nullifierHash], "Nullifier already used");

         e.usedNullifiers[nullifierHash] = true;
         e.tally[candidateId] += 1;
         e.commitments.push(commitmentHash);

         emit VoteCast(_electionId, candidateId, nullifierHash, commitmentHash);
     }
 }

 // ---------- Single voting ----------
 function vote(
     uint256 _electionId,
     uint256 _candidateId,
     uint[2] calldata a,
     uint[2][2] calldata b,
     uint[2] calldata c,
     uint256[3] calldata input
 ) external {
     require(elections[_electionId].exists, "Election does not exist");

     uint256 nullifierHash = input[0];
     uint256 commitmentHash = input[1];
     uint256 validFlag = input[2];

     require(verifier.verifyProof(a, b, c, input), "Invalid ZKP proof");
     require(validFlag == 1, "Proof not valid");

     Election storage e = elections[_electionId];
     require(e.isCandidate[_candidateId], "Candidate not registered");

     require(!e.usedNullifiers[nullifierHash], "Nullifier already used");
     e.usedNullifiers[nullifierHash] = true;

     e.tally[_candidateId] += 1;
     e.commitments.push(commitmentHash);

     emit VoteCast(_electionId, _candidateId, nullifierHash, commitmentHash);
 }

 // ---------- Views ----------
 function getVotes(uint256 _electionId, uint256 _candidateId) external view returns (uint256) {
     require(elections[_electionId].exists, "Election not found");
     return elections[_electionId].tally[_candidateId];
 }

 function isNullifierUsed(uint256 _electionId, uint256 nullifier) external view returns (bool) {
     require(elections[_electionId].exists, "Election not found");
     return elections[_electionId].usedNullifiers[nullifier];
 }

 function isCandidate(uint256 _electionId, uint256 _candidateId) external view returns (bool) {
     require(elections[_electionId].exists, "Election not found");
     return elections[_electionId].isCandidate[_candidateId];
 }
}