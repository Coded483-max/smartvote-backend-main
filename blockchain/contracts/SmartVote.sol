// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "./Verifier.sol";

contract SmartVote {
    struct Election {
        string  title;
        uint256 startTime;   // unix seconds
        uint256 endTime;
        bool    exists;
        mapping(address => bool) hasVoted;
        mapping(uint256 => uint256) tally;   // candidateId → votes
    }

    address public owner;
    uint256 public electionCount;
    mapping(uint256 => Election) private elections;

    event ElectionCreated(uint256 indexed id, string title);
    event VoteCast(uint256 indexed electionId, uint256 candidateId, address voter);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

     Groth16Verifier public verifier;

    constructor(address _verifier) {
        owner = msg.sender;
        verifier = Groth16Verifier(_verifier);
    }

    function createElection(
        string calldata _title,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner returns (uint256) {
        require(_endTime > _startTime, "End must be after start");

        uint256 id = ++electionCount;
        Election storage e = elections[id];
        e.title      = _title;
        e.startTime  = _startTime;
        e.endTime    = _endTime;
        e.exists     = true;

        emit ElectionCreated(id, _title);
        return id;
    }

    function getElection(uint256 _electionId) external view returns (
    bool exists,
    uint256 startTime,
    uint256 endTime
) {
    Election storage e = elections[_electionId];
    return (e.exists, e.startTime, e.endTime);
}


    function vote(
   uint256 _electionId,
    uint256 _candidateId,
    uint[2] calldata a,
    uint[2][2] calldata b,
    uint[2] calldata c,
    uint[1] calldata input
) external {
    Election storage e = elections[_electionId];
    require(e.exists, "Election not found");
    require(block.timestamp >= e.startTime && block.timestamp <= e.endTime, "Election not active");
    require(!e.hasVoted[msg.sender], "Already voted");

    require(verifier.verifyProof(a, b, c, input), "Invalid ZKP proof");

    e.hasVoted[msg.sender] = true;
    e.tally[_candidateId] += 1;

    emit VoteCast(_electionId, _candidateId, msg.sender);
}

    function getVotes(uint256 _electionId, uint256 _candidateId)
        external
        view
        returns (uint256)
    {
        return elections[_electionId].tally[_candidateId];
    }

    function hasVoterVoted(uint256 _electionId, address _voter)
        external
        view
        returns (bool)
    {
        return elections[_electionId].hasVoted[_voter];
    }
}
