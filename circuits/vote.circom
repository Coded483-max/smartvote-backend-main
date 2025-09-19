pragma circom 2.0.0;
include "poseidon.circom";
include "poseidon_constants.circom";

template VoteProof() {
    // Private inputs
    signal input voterId;
    signal input candidateId;
    signal input electionId;
    signal input salt;

    // Public signals
    signal output nullifierHash;   // prevent double voting
    signal output commitmentHash;  // commitment to the vote
    signal output valid;           // proof validity flag

    // Internal signals for computed hashes
    signal computedNullifier;
    signal computedCommitment;

    // Instantiate Poseidon components
    component h1 = Poseidon(2);
    h1.inputs[0] <== voterId;
    h1.inputs[1] <== electionId;
    computedNullifier <== h1.out;

    component h2 = Poseidon(2);
    h2.inputs[0] <== candidateId;
    h2.inputs[1] <== salt;
    computedCommitment <== h2.out;

    // Enforce constraints
    nullifierHash <== computedNullifier;
    commitmentHash <== computedCommitment;
    valid <== 1; 
}

// Instantiate main component
component main = VoteProof();
