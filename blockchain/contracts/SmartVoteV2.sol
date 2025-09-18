pragma solidity ^0.8.28;

/// @title SmartVote V2 – cheaper gas using mappings
contract SmartVoteV2 {
    /* ─────────────────── Storage ─────────────────── */
    // electionId => candidateId => votes
    mapping(uint256 => mapping(uint256 => uint256)) public voteCount;

    // voter => electionId => voted?
    mapping(address => mapping(uint256 => bool)) public hasVoted;

    /* ─────────────────── Events ─────────────────── */
    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed candidateId,
        address indexed voter
    );

    /* ─────────────────── Public API ─────────────────── */
    function vote(uint256 electionId, uint256 candidateId) external {
        require(!hasVoted[msg.sender][electionId], "Already voted");

        hasVoted[msg.sender][electionId] = true;
        voteCount[electionId][candidateId] += 1;

        emit VoteCast(electionId, candidateId, msg.sender);
    }

    function getVotes(uint256 electionId, uint256 candidateId)
        external
        view
        returns (uint256)
    {
        return voteCount[electionId][candidateId];
    }
}
