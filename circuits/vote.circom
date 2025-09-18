pragma circom 2.0.0;
include "poseidon.circom";


template VoteProof() {
    // Private inputs
    signal input voterId;
    signal input candidateId;
    signal input electionId;
    signal input salt;
    signal input nullifierHash;   // public nullifier to prevent double voting
    signal input commitmentHash;  // public commitment to the vote

    // Public output
    signal output valid;

    // Internal signals for computed hashes
    signal computedNullifier;
    signal computedCommitment;

    // Instantiate Poseidon components (fixed 2-input hash)
    component h1 = Poseidon(2);
    h1.inputs[0] <== voterId;
    h1.inputs[1] <== electionId;
    computedNullifier <== h1.out;

    component h2 = Poseidon(2);
    h2.inputs[0] <== candidateId;
    h2.inputs[1] <== salt;
    computedCommitment <== h2.out;

    // Enforce that provided public hashes match computed hashes
    computedNullifier === nullifierHash;
    computedCommitment === commitmentHash;

    valid <== 1; // passes if hashes match
}

// Instantiate main component
component main = VoteProof();
