// circuits/verify_vote.circom
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/merkletree.circom";

template VoteVerification(levels) {
    // Private inputs
    signal private input leaf;
    signal private input pathElements[levels];
    signal private input pathIndices[levels];
    
    // Public inputs
    signal input root;
    signal input nullifierHash;
    
    // Output
    signal output valid;
    
    // Components
    component merkleProof = MerkleTreeChecker(levels);
    component nullifierCheck = Poseidon(1);
    
    // Verify merkle proof
    merkleProof.leaf <== leaf;
    merkleProof.root <== root;
    
    for (var i = 0; i < levels; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }
    
    // Verify nullifier
    nullifierCheck.inputs[0] <== leaf;
    nullifierCheck.out === nullifierHash;
    
    valid <== merkleProof.valid;
}

component main = VoteVerification(20); // 20 levels for merkle tree