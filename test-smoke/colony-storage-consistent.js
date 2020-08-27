/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { BN } from "bn.js";

import { UINT256_MAX, WAD, GLOBAL_SKILL_ID } from "../helpers/constants";
import { fundColonyWithTokens, setupColony } from "../helpers/test-data-generator";

const Account = require("ethereumjs-account").default;

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const utils = require("ethereumjs-util");

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");
const TokenAuthority = artifacts.require("TokenAuthority");
const ContractEditing = artifacts.require("ContractEditing");
const Resolver = artifacts.require("Resolver");

contract("Contract Storage", (accounts) => {
  const SLOT0 = 0;

  const RECIPIENT = accounts[3];
  const ADMIN = accounts[4];
  const ARBITRATOR = accounts[5];

  let colony;
  let token;
  let otherToken;
  let colonyNetwork;
  let metaColony;
  let domain1;
  let tokenLockingAddress;

  before(async () => {
    // We use our own providers for these test(s) so we can really get in to it...

    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    token = await Token.new("name", "symbol", 18);
    await token.unlock();
    colony = await setupColony(colonyNetwork, token.address);
    tokenLockingAddress = await colonyNetwork.getTokenLocking();
    const tokenAuthority = await TokenAuthority.new(token.address, colony.address, [tokenLockingAddress]);
    await token.setAuthority(tokenAuthority.address);

    await colony.setRewardInverse(100);
    await colony.setAdministrationRole(1, UINT256_MAX, ADMIN, 1, true);
    await colony.setArbitrationRole(1, UINT256_MAX, ARBITRATOR, 1, true);
    await fundColonyWithTokens(colony, token, UINT256_MAX);
    domain1 = await colony.getDomain(1);

    otherToken = await Token.new("otherName", "otherSymbol", 18);
    await otherToken.unlock();
    await fundColonyWithTokens(colony, otherToken, UINT256_MAX);
  });

  // x.engine.manager.state.blockchain.stateTrie.get(utils.toBuffer(y.address), (err, res)=>console.log(res.toString('hex')))
  function getAddressStateHash(address) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.engine.manager.state.blockchain.stateTrie.get(utils.toBuffer(address), (err, res) => {
        if (err !== null) return reject(err);
        return resolve(res.toString("hex"));
      });
    });
  }

  describe("Smoke tests to check our storage layout does not change", () => {
    // There are many things you could do that one would expect to change these hashes. If you've made changes that change the contents of storage of a
    // contract, then these hashes will change. This could include adding an extra transaction somewhere, which could cause the address a contract is
    // deployed to change, which if it is stored somewhere would cause the state hash of the storage to change.

    // If you haven't touched the contracts, however, and this test fails, then something is afoot.
    // In theory, the storage slots used by solidity could change in an upgrade,
    // which this test was written with in mind to try and detect. They don't guarantee this hasn't happened if they pass, but if they fail without just
    // cause then we need to think very carefully about what's going on.

    it("storage contents should be as expected", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: ADMIN });
      const expenditureId = await colony.getExpenditureCount();

      await colony.setExpenditureRecipient(expenditureId, SLOT0, RECIPIENT, { from: ADMIN });
      await colony.setExpenditurePayout(expenditureId, SLOT0, token.address, WAD, { from: ADMIN });
      await colony.setExpenditureSkill(expenditureId, SLOT0, GLOBAL_SKILL_ID, { from: ADMIN });

      const expenditure = await colony.getExpenditure(expenditureId);
      await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, domain1.fundingPotId, expenditure.fundingPotId, WAD, token.address);
      await colony.finalizeExpenditure(expenditureId, { from: ADMIN });
      await colony.claimExpenditurePayout(expenditureId, SLOT0, token.address);

      const miningCycleAddress = await colonyNetwork.getReputationMiningCycle(false);
      const miningCycleStateHash = await getAddressStateHash(miningCycleAddress);
      const miningCycleAccount = new Account(miningCycleStateHash);

      // For this test to be reproducible, have to zero timestamps / time depenedent things
      // For colonyNetwork, that means the mining staking timestamp

      const contractEditing = await ContractEditing.new();
      const networkAsER = await EtherRouter.at(colonyNetwork.address);
      const colonyNetworkResolverAddress = await networkAsER.resolver();
      const colonyNetworkResolver = await Resolver.at(colonyNetworkResolverAddress);
      await colonyNetworkResolver.register("setStorageSlot(uint256,bytes32)", contractEditing.address);
      const editableNetwork = await ContractEditing.at(colonyNetwork.address);

      let hashable = `0x000000000000000000000000${accounts[5].slice(2)}${new BN(33).toString(16, 64)}`;
      let hashed = web3.utils.sha3(hashable);
      let slot = new BN(hashed.slice(2), 16);
      slot = slot.addn(1);

      await editableNetwork.setStorageSlot(slot, "0x0000000000000000000000000000000000000000000000000000000000000000");

      const colonyNetworkStateHash = await getAddressStateHash(colonyNetwork.address);
      const colonyNetworkAccount = new Account(colonyNetworkStateHash);

      // We did a whole expenditure above, so let's take out the finalized timestamp

      hashable = `0x${new BN(1).toString(16, 64)}${new BN(25).toString(16, 64)}`;
      hashed = web3.utils.sha3(hashable);
      slot = new BN(hashed.slice(2), 16);
      slot = slot.addn(3);
      // const valueBefore = await web3.eth.getStorageAt(colony.address, slot);
      // console.log(valueBefore)
      const colonyAsER = await EtherRouter.at(colony.address);
      const colonyResolverAddress = await colonyAsER.resolver();
      const colonyResolver = await Resolver.at(colonyResolverAddress);
      await colonyResolver.register("setStorageSlot(uint256,bytes32)", contractEditing.address);
      const editableColony = await ContractEditing.at(colony.address);
      await editableColony.setStorageSlot(slot, "0x0000000000000000000000000000000000000000000000000000000000000000");

      const colonyStateHash = await getAddressStateHash(colony.address);
      const colonyAccount = new Account(colonyStateHash);

      const metaColonyStateHash = await getAddressStateHash(metaColony.address);
      const metaColonyAccount = new Account(metaColonyStateHash);

      const tokenLockingStateHash = await getAddressStateHash(tokenLockingAddress);
      const tokenLockingAccount = new Account(tokenLockingStateHash);

      console.log("colonyNetworkStateHash:", colonyNetworkAccount.stateRoot.toString("hex"));
      console.log("colonyStateHash:", colonyAccount.stateRoot.toString("hex"));
      console.log("metaColonyStateHash:", metaColonyAccount.stateRoot.toString("hex"));
      console.log("miningCycleStateHash:", miningCycleAccount.stateRoot.toString("hex"));
      console.log("tokenLockingStateHash:", tokenLockingAccount.stateRoot.toString("hex"));

      expect(colonyNetworkAccount.stateRoot.toString("hex")).to.equal("0941ada3434f80dfd130d0a2dc07fbc2a13b73e415f14e650bb725a9089a061f");

      expect(colonyAccount.stateRoot.toString("hex")).to.equal("f015594ef3fa0c15991fa41d255cfb7709f477545021b8fba487a50f6e8b404a");

      expect(metaColonyAccount.stateRoot.toString("hex")).to.equal("33454eeb259439cf54a923c76de531d18954bdafcf29a6ccf0be586a73a7dbd5");

      expect(miningCycleAccount.stateRoot.toString("hex")).to.equal("9b743931645356d469af52165654a497ee4af95ec1029601d10162d5d2d377c0");

      expect(tokenLockingAccount.stateRoot.toString("hex")).to.equal("90f687f776283dc8c84d7de3e9d233974cdf218e2e51536643d125ae0ae43ebf");
    });
  });
});
