pragma circom 2.0.0;

template VoteProof() {
    // Test without private keyword first
    signal input voterId;
    signal input candidateId;
    signal input electionId;
    signal input salt;
    signal input nullifierHash;
    signal input commitmentHash;
    signal output valid;
    
    // Simple validation
    signal temp1;
    signal temp2;
    
    temp1 <== voterId * candidateId;
    temp2 <== electionId * salt;
    
    valid <== 1;
}

component main = VoteProof();