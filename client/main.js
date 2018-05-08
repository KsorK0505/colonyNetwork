import BN from "bn.js";
import web3Utils from "web3-utils";

const ganache = require("ganache-core");

// We disable the import/no-unresolved rule for these lines because when ESLint is run on Circle, the contracts haven't
// been compiled yet and so would fail here.
const ReputationMiningCycleJSON = require("../build/contracts/ReputationMiningCycle.json"); // eslint-disable-line import/no-unresolved
const ColonyNetworkJSON = require("../build/contracts/IColonyNetwork.json"); // eslint-disable-line import/no-unresolved
const PatriciaTreeJSON = require("../build/contracts/PatriciaTree.json"); // eslint-disable-line import/no-unresolved

const jsonfile = require("jsonfile");

const file = "./reputations.json";

const ethers = require("ethers");

// We don't need the account address right now for this secret key, but I'm leaving it in in case we
// do in the future.
// const accountAddress = "0xbb46703786c2049d4d6dd43f5b4edf52a20fefe4";
const secretKey = "0xe5c050bb6bfdd9c29397b8fe6ed59ad2f7df83d6fd213b473f84b489205d9fc7";

// Adapted from https://github.com/ethers-io/ethers.js/issues/59
// ===================================
function MetamaskSigner(minerAddress, provider) {
  this.address = minerAddress;
  this.provider = provider;
  const signer = this;
  this.sendTransaction = function sendTransaction(transaction) {
    const tx = this.buildTx(transaction);
    return signer.provider.send("eth_sendTransaction", [tx]);
  };

  this.estimateGas = async function estimateGas(transaction) {
    const tx = this.buildTx(transaction);
    const res = await signer.provider.send("eth_estimateGas", [tx]);
    return ethers.utils.bigNumberify(res);
  };

  this.buildTx = function buildTx(transaction) {
    const tx = {
      from: this.address
    };
    ["to", "data"].forEach(key => {
      if (transaction[key] != null) {
        tx[key] = transaction[key];
      }
    });
    ["gasPrice", "nonce", "value"].forEach(key => {
      if (transaction[key] != null) {
        tx[key] = ethers.utils.hexlify(transaction[key]);
      }
    });
    if (transaction.gasLimit != null) {
      tx.gas = ethers.utils.hexlify(transaction.gasLimit);
    }
    return tx;
  };
}
// ===================================

class ReputationMiningClient {
  /**
   * Constructor for ReputationMiningClient
   * @param {string} minerAddress            The address that is staking CLNY that will allow the miner to submit reputation hashes
   * @param {Number} [realProviderPort=8545] The port that the RPC node with the ability to sign transactions from `minerAddress` is responding on. The address is assumed to be `localhost`.
   */
  constructor(minerAddress, realProviderPort = 8545) {
    this.minerAddress = minerAddress;
    const ganacheProvider = ganache.provider({
      network_id: 515,
      vmErrorsOnRPCResponse: false,
      locked: false,
      verbose: true,
      accounts: [
        {
          balance: "0x10000000000000000000000000",
          secretKey
        }
      ]
    });
    this.ganacheProvider = new ethers.providers.Web3Provider(ganacheProvider);
    this.ganacheWallet = new ethers.Wallet(secretKey, this.ganacheProvider);

    this.realProvider = new ethers.providers.JsonRpcProvider(`http://localhost:${realProviderPort}`);
    this.realWallet = new MetamaskSigner(minerAddress, this.realProvider);

    try {
      this.reputations = jsonfile.readFileSync(file);
    } catch (err) {
      this.reputations = {};
    }
  }

  /**
   * Initialises the mining client so that it knows where to find the `ColonyNetwork` contract
   * @param  {string}  colonyNetworkAddress The address of the current `ColonyNetwork` contract
   * @return {Promise}
   */
  async initialise(colonyNetworkAddress) {
    const patriciaTreeDeployTx = ethers.Contract.getDeployTransaction(PatriciaTreeJSON.bytecode, PatriciaTreeJSON.abi);
    const tx = await this.ganacheWallet.sendTransaction(patriciaTreeDeployTx);
    this.reputationTree = new ethers.Contract(ethers.utils.getContractAddress(tx), PatriciaTreeJSON.abi, this.ganacheWallet);
    this.nReputations = 0;
    this.setColonyNetworkAddress(colonyNetworkAddress);
  }

  async setColonyNetworkAddress(address) {
    this.colonyNetwork = new ethers.Contract(address, ColonyNetworkJSON.abi, this.realWallet);
  }
  /**
   * When called, adds the entire contents of the current (inactive) log to its reputation tree. It also builds a Justification Tree as it does so
   * in case a dispute is called which would require it.
   * @return {Promise}
   */
  async addLogContentsToReputationTree() {
    // Snapshot the current state, in case we get in to a dispute, and have to roll back
    // to generated the justification tree.
    let justUpdatedProof = { value: this.getValueAsBytes(0, 0), branchMask: 0, siblings: [] };
    let nextUpdateProof = { value: this.getValueAsBytes(0, 0), branchMask: 0, siblings: [] };

    const patriciaTreeDeployTx = ethers.Contract.getDeployTransaction(PatriciaTreeJSON.bytecode, PatriciaTreeJSON.abi);

    const tx = await this.ganacheWallet.sendTransaction(patriciaTreeDeployTx);
    this.justificationTree = new ethers.Contract(ethers.utils.getContractAddress(tx), PatriciaTreeJSON.abi, this.ganacheWallet);

    this.justificationHashes = {};

    let nLogEntries = await this.colonyNetwork.getReputationUpdateLogLength(false);
    nLogEntries = new BN(nLogEntries.toString());
    let interimHash;
    let jhLeafValue;
    for (let i = new BN("0"); i.lt(nLogEntries); i.iadd(new BN("1"))) {
      interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
      // console.log(interimHash);
      jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
      // console.log(jhLeafValue);
      const logEntry = await this.colonyNetwork.getReputationUpdateLogEntry(i.toString(), false); // eslint-disable-line no-await-in-loop
      const score = this.getScore(i, logEntry);
      let newestReputationKey = 0x0;
      let newestReputationValue = 0x0;
      let newestReputationBranchMask = 0x0;
      let newestReputationSiblings = [];
      if (i.toString() === "0") {
        // TODO If it's not already this value, then something has gone wrong, and we're working with the wrong state.
        // This 'if' statement is only in for now to make tests easier to write.
        interimHash = await this.colonyNetwork.getReputationRootHash(); // eslint-disable-line no-await-in-loop
        jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
      } else {
        const prevLogEntry = await this.colonyNetwork.getReputationUpdateLogEntry(i.subn(1).toString(), false); // eslint-disable-line no-await-in-loop
        const prevColonyAddress = prevLogEntry[3].slice(2);
        const prevSkillId = prevLogEntry[2];
        const prevUserAddress = prevLogEntry[0].slice(2);
        const prevKey = `0x${new BN(prevColonyAddress, 16).toString(16, 40)}${new BN(prevSkillId.toString()).toString(16, 64)}${new BN(
          prevUserAddress,
          16
        ).toString(16, 40)}`;

        justUpdatedProof.value = this.reputations[prevKey];
        justUpdatedProof.key = prevKey;
        justUpdatedProof.nNodes = this.nReputations;
        [justUpdatedProof.branchMask, justUpdatedProof.siblings] = await this.getProof(prevKey); // eslint-disable-line no-await-in-loop

        [
          newestReputationKey,
          newestReputationValue,
          newestReputationBranchMask,
          newestReputationSiblings
        ] = await this.getNewestReputationInformation(i); // eslint-disable-line no-await-in-loop
      }
      await this.justificationTree.insert(`0x${i.toString(16, 64)}`, jhLeafValue, { gasLimit: 4000000 }); // eslint-disable-line no-await-in-loop
      const colonyAddress = logEntry[3].slice(2);
      const skillId = logEntry[2];
      const userAddress = logEntry[0].slice(2);
      const key = `0x${new BN(colonyAddress, 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(userAddress, 16).toString(
        16,
        40
      )}`;
      let branchMask;
      let siblings;
      let value;

      try {
        [branchMask, siblings] = await this.getProof(key); // eslint-disable-line no-await-in-loop
        value = this.reputations[key];
      } catch (err) {
        // Doesn't exist yet.
        branchMask = 0x0;
        siblings = [];
        value = this.getValueAsBytes(0, 0);
      }
      nextUpdateProof = { branchMask: `0x${branchMask.toString(16)}`, siblings, key, value, nNodes: this.nReputations };
      this.justificationHashes[`0x${i.toString(16, 64)}`] = JSON.parse(
        JSON.stringify({
          interimHash,
          nNodes: this.nReputations,
          jhLeafValue,
          justUpdatedProof,
          nextUpdateProof,
          newestReputationKey,
          newestReputationValue,
          newestReputationBranchMask,
          newestReputationSiblings
        })
      );

      // We have to process these sequentially - if two updates affected the
      // same entry, we would have a potential race condition.
      // Hence, we are awaiting inside these loops.
      // TODO: Include updates for all parent skills (and child, if x.amount is negative)
      // TODO: Include updates for colony-wide sums of skills.
      await this.insert(logEntry[3], logEntry[2], logEntry[0], score, i); // eslint-disable-line no-await-in-loop
    }
    // Add the last entry to the justification tree
    justUpdatedProof = nextUpdateProof;
    nextUpdateProof = {};
    interimHash = await this.reputationTree.getRootHash();
    jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);

    await this.justificationTree.insert(`0x${nLogEntries.toString(16, 64)}`, jhLeafValue, { gasLimit: 4000000 });
    if (nLogEntries.gtn(0)) {
      const prevLogEntry = await this.colonyNetwork.getReputationUpdateLogEntry(nLogEntries.subn(1).toString(), false);
      const prevColonyAddress = prevLogEntry[3].slice(2);
      const prevSkillId = prevLogEntry[2];
      const prevUserAddress = prevLogEntry[0].slice(2);
      const prevKey = `0x${new BN(prevColonyAddress, 16).toString(16, 40)}${new BN(prevSkillId.toString()).toString(16, 64)}${new BN(
        prevUserAddress,
        16
      ).toString(16, 40)}`;
      justUpdatedProof.value = this.reputations[prevKey];
    }
    this.justificationHashes[`0x${nLogEntries.toString(16, 64)}`] = {
      interimHash,
      nNodes: this.nReputations,
      jhLeafValue,
      justUpdatedProof,
      nextUpdateProof
    };
    // console.log(this.justificationHashes);
  }

  /**
   * Formats `_reputationState` and `nNodes` in to the format used for the Justification Tree
   * @param  {bigNumber or string} _reputationState The reputation state root hashes
   * @param  {bigNumber or string} nNodes           The number of nodes in the reputation state Tree
   * @return {string}                               The correctly formatted hex string for inclusion in the justification tree
   */
  getJRHEntryValueAsBytes(_reputationState, nNodes) { //eslint-disable-line
    let reputationState = _reputationState.toString(16);
    if (reputationState.substring(0, 2) === "0x") {
      reputationState = reputationState.slice(2);
    }
    return `0x${new BN(reputationState.toString(), 16).toString(16, 64)}${new BN(nNodes.toString()).toString(16, 64)}`;
  }

  /**
   * Formats `reputation` and `uid` in to the format used for the Reputation Tree
   * @param  {bigNumber or string} reputation The reputation score
   * @param  {bigNumber or string} uid        The global UID assigned to this reputation
   * @return {string}            Appropriately formatted hex string
   */
  getValueAsBytes(reputation, uid) { //eslint-disable-line
    return `0x${new BN(reputation.toString()).toString(16, 64)}${new BN(uid.toString()).toString(16, 64)}`;
  }

  /**
   * Get the reputation change from the supplied logEntry
   * @param  {Number} i        The number of the log entry. Not used here, but is in malicious.js to know whether to lie
   * @param  {Array} logEntry The log entry
   * @return {BigNumber}        The entry's reputation change
   * @dev The version of this function in malicious.js uses `this`, but not this version.
   */
  // eslint-disable-next-line class-methods-use-this
  getScore(i, logEntry) {
    return logEntry[1];
  }

  /**
   * Get the key and value of the most recently added reputation (i.e. the one with the highest UID),
   * and proof (branchMask and siblings) that it exists in the current reputation state.
   * @return {Promise}    The returned promise will resolve to `[key, value, branchMask, siblings]`
   */
  async getNewestReputationInformation() {
    let newestReputationKey = Object.keys(this.reputations)[this.nReputations - 1];
    let newestReputationValue;
    if (!newestReputationKey) {
      newestReputationKey = 0x0;
      newestReputationValue = `0x${new BN("0").toString(16, 64)}`;
    } else {
      newestReputationValue = this.reputations[newestReputationKey];
    }
    const [newestReputationBranchMask, newestReputationSiblings] = await this.getProof(newestReputationKey);
    return [newestReputationKey, newestReputationValue, newestReputationBranchMask, newestReputationSiblings];
  }

  /**
   * Submit what the client believes should be the next reputation state root hash to the `ReputationMiningCycle` contract
   * @return {Promise}
   */
  async submitRootHash() {
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

    const hash = await this.getRootHash();
    // TODO: Work out what entry we should use when we submit
    const gas = await repCycle.estimate.submitNewHash(hash, this.nReputations, 1);
    await repCycle.submitNewHash(hash, this.nReputations, 1, { gasLimit: `0x${gas.mul(2).toString()}` });
  }

  /**
   * Get what the client believes should be the next reputation state root hash.
   * @return {Promise}      Resolves to the root hash
   */
  async getRootHash() {
    return this.reputationTree.getRootHash();
  }

  /**
   * Get a Merkle proof for `key` in the current (local) reputation state.
   * @param  {string}  key The reputation key the proof is being asked for
   * @return {Promise}     Resolves to [branchMask, siblings]
   */
  async getProof(key) {
    const [branchMask, siblings] = await this.reputationTree.getProof(key);
    const retBranchMask = branchMask.toHexString();
    return [retBranchMask, siblings];
  }

  /**
   * Submit the Justification Root Hash (JRH) for the hash that (presumably) we submitted this round
   * @return {Promise}
   */
  async submitJustificationRootHash() {
    const jrh = await this.justificationTree.getRootHash();
    const [branchMask1, siblings1] = await this.justificationTree.getProof(`0x${new BN("0").toString(16, 64)}`);
    const nLogEntries = await this.colonyNetwork.getReputationUpdateLogLength(false);
    const [branchMask2, siblings2] = await this.justificationTree.getProof(`0x${new BN(nLogEntries.toString()).toString(16, 64)}`);
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

    const [round, index] = await this.getMySubmissionRoundAndIndex();
    await repCycle.submitJRH(round.toString(), index.toString(), jrh, branchMask1, siblings1, branchMask2, siblings2, {
      gasLimit: 6000000
    });
  }

  /**
   * Returns the round and index that our submission is currently at in the dispute cycle.
   * @return {Promise} Resolves to [round, index] which are `BigNumber`.
   */
  async getMySubmissionRoundAndIndex() {
    const submittedHash = await this.reputationTree.getRootHash();
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

    let index = new BN("-1");
    const round = new BN("0");
    let submission = [];
    while (submission[0] !== submittedHash) {
      try {
        index.iaddn(1);
        submission = await repCycle.disputeRounds(round.toString(), index.toString()); // eslint-disable-line no-await-in-loop
      } catch (err) {
        round.iaddn(1);
        index = new BN("-1");
      }
    }
    return [round, index];
  }

  /**
   * Respond to the next stage in the binary search occurring on `ReputationMiningCycle` contract in order to find
   * the first log entry where our submitted hash and the hash we are paired off against differ.
   * @return {Promise} Resolves to the tx hash of the response
   */
  async respondToBinarySearchForChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);
    let submission = await repCycle.disputeRounds(round.toString(), index.toString());
    const targetNode = new BN(
      submission[8]
        .add(submission[9])
        .div(2)
        .toString()
    );
    const intermediateReputationHash = this.justificationHashes[`0x${targetNode.toString(16, 64)}`].jhLeafValue;
    const [branchMask, siblings] = await this.justificationTree.getProof(`0x${targetNode.toString(16, 64)}`);

    const tx = await repCycle.binarySearchForChallenge(round.toString(), index.toString(), intermediateReputationHash, branchMask, siblings, {
      gasLimit: 1000000
    });
    submission = await repCycle.disputeRounds(round.toString(), index.toString());
    return tx;
  }

  /**
   * Respond to a specific challenge over the effect of a specific log entry once the binary search has been completed to establish
   * the log entry where the two submitted hashes differ.
   * @return {Promise} Resolves to tx hash of the response
   */
  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);
    const submission = await repCycle.disputeRounds(round.toString(), index.toString());
    // console.log(submission);
    const firstDisagreeIdx = new BN(submission[8].toString());
    const lastAgreeIdx = firstDisagreeIdx.subn(1);
    // console.log('getReputationUPdateLogEntry', lastAgreeIdx);
    const logEntry = await this.colonyNetwork.getReputationUpdateLogEntry(lastAgreeIdx.toString(), false);
    // console.log('getReputationUPdateLogEntry done');
    const colonyAddress = logEntry[3];
    const skillId = logEntry[2];
    const userAddress = logEntry[0];
    const reputationKey = `0x${new BN(colonyAddress.slice(2), 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(
      userAddress.slice(2),
      16
    ).toString(16, 40)}`;
    // console.log('get justification tree');
    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(`0x${lastAgreeIdx.toString(16, 64)}`);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(`0x${firstDisagreeIdx.toString(16, 64)}`);
    // console.log('get justification tree done');

    // These comments can help with debugging. This implied root is the intermediate root hash that is implied
    // const impliedRoot = await this.justificationTree.getImpliedRoot(
    //   reputationKey,
    //   this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
    //   this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.branchMask,
    //   this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.siblings
    // );
    // console.log('intermediatRootHash', impliedRoot);
    // // This one is the JRH implied by the proof provided alongside the above implied root - we expect this to
    // // be the JRH that has been submitted.
    // const impliedRoot2 = await this.justificationTree.getImpliedRoot(
    //   `0x${new BN(lastAgreeIdx).toString(16, 64)}`,
    //   impliedRoot,
    //   agreeStateBranchMask,
    //   agreeStateSiblings
    // );
    // const jrh = await this.justificationTree.getRootHash();
    // console.log('implied jrh', impliedRoot2)
    // console.log('actual jrh', jrh)
    // const impliedRoot3 = await this.justificationTree.getImpliedRoot(
    //   reputationKey,
    //   this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
    //   this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask,
    //   this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings
    // );
    // const impliedRoot4 = await this.justificationTree.getImpliedRoot(
    //   `0x${new BN(firstDisagreeIdx).toString(16, 64)}`,
    //   impliedRoot3,
    //   disagreeStateBranchMask,
    //   disagreeStateSiblings
    // );
    // console.log('intermediatRootHash2', impliedRoot3);
    // console.log('implied jrh from irh2', impliedRoot4);
    // console.log('about to respondToChallengeReal')
    const tx = await repCycle.respondToChallenge(
      [
        round.toString(),
        index.toString(),
        this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask,
        this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.nNodes,
        agreeStateBranchMask.toHexString(),
        this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.nNodes,
        disagreeStateBranchMask.toHexString(),
        this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationBranchMask,
        0
      ],
      reputationKey,
      this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
      agreeStateSiblings,
      this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
      disagreeStateSiblings,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationKey,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationValue,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationSiblings,
      { gasLimit: 4000000 }
    );
    return tx;
  }

  /**
   * Insert (or update) the reputation for a user in the local reputation tree
   * @param  {string}  _colonyAddress  Hex address of the colony in which the reputation is being updated
   * @param  {Number or BigNumber or String}  skillId        The id of the skill being updated
   * @param  {string}  _userAddress    Hex address of the user who is having their reputation being updated
   * @param  {Number of BigNumber or String}  reputationScore The new reputation value
   * @param  {Number or BigNumber}  index           The index of the log entry being considered
   * @return {Promise}                 Resolves to `true` or `false` depending on whether the insertion was successful
   */
  async insert(_colonyAddress, skillId, _userAddress, reputationScore, index) {
    let colonyAddress = _colonyAddress;
    let userAddress = _userAddress;

    let isAddress = web3Utils.isAddress(colonyAddress);
    // TODO should we return errors here?
    if (!isAddress) {
      return false;
    }
    isAddress = web3Utils.isAddress(userAddress);
    if (!isAddress) {
      return false;
    }
    if (colonyAddress.substring(0, 2) === "0x") {
      colonyAddress = colonyAddress.slice(2);
    }
    if (userAddress.substring(0, 2) === "0x") {
      userAddress = userAddress.slice(2);
    }
    colonyAddress = colonyAddress.toLowerCase();
    userAddress = userAddress.toLowerCase();
    const key = `0x${new BN(colonyAddress, 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(userAddress, 16).toString(
      16,
      40
    )}`;
    // const keyAlreadyExists = await this.keyExists(key);
    // If we already have this key, then we lookup the unique identifier we assigned this key.
    // Otherwise, give it the new one.
    let value;
    const keyAlreadyExists = this.reputations[key] !== undefined;
    if (keyAlreadyExists) {
      // Look up value from our JSON.
      value = this.reputations[key];
      // Extract uid
      const uid = ethers.utils.bigNumberify(`0x${value.slice(-64)}`);
      const existingValue = ethers.utils.bigNumberify(`0x${value.slice(2, 66)}`);
      value = this.getValueAsBytes(existingValue.add(reputationScore), uid, index);
    } else {
      value = this.getValueAsBytes(reputationScore, this.nReputations + 1, index);
      this.nReputations += 1;
    }
    await this.reputationTree.insert(key, value, { gasLimit: 4000000 });
    // If successful, add to our JSON.
    this.reputations[key] = value;
    return true;
  }
}

export default ReputationMiningClient;
