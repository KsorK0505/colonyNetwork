/* globals artifacts */
/* eslint-disable prefer-arrow-callback */
import chai from "chai";
import { checkErrorRevert } from "../../helpers/test-helper";

const namehash = require("eth-ens-namehash");

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IMetaColony = artifacts.require("IMetaColony");
const { expect } = chai;

contract("Colony contract upgrade", () => {
  let metaColony;
  let colony;
  let colonyNetwork;
  let newColonyNetworkResolverAddress;

  const COLONYNETWORK_ADDRESS = "0x5346D0f80e2816FaD329F2c140c870ffc3c3E2Ef";
  const COLONYNETWORK_OWNER = "0x56a9212f7f495fadce1f27967bef5158199b36c7";
  const TESTCOLONY_ADDRESS = "0x84bc20B584fA28a278B7a8d5D1Ec5c71224c9f7C";
  const TESTCOLONY_OWNER = "0xf780ee9f9e50248e7f8433a132a4b0b00b3da313";

  before(async function() {
    colonyNetwork = await IColonyNetwork.at(COLONYNETWORK_ADDRESS);

    // Upgrade the network to accommodate the new function. The migrations already deployed new versions of everything, so
    // we can hopefully just piggyback off of that.

    const etherRouter = await EtherRouter.deployed();
    newColonyNetworkResolverAddress = await etherRouter.resolver();
    const newlyDeployedNetwork = await IColonyNetwork.at(etherRouter.address);
    const newColonyVersionResolverAddress = await newlyDeployedNetwork.getColonyVersionResolver(3);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
    await metaColony.addNetworkColonyVersion(3, newColonyVersionResolverAddress, { from: COLONYNETWORK_OWNER });

    // These tests run against the developers colony. We assume we have forked main chain at 8046998
    colony = await IColony.at(TESTCOLONY_ADDRESS);
  });

  describe("check behaviour before colonyNetwork upgrade", function() {
    it("should not be able to update user orbit db", async function() {
      await colonyNetwork.registerUserLabel("username", "before update");
      await checkErrorRevert(colonyNetwork.updateUserOrbitDB("anotherstring"));
    });
  });

  describe("check behaviour after colonyNetwork upgrade", function() {
    before(async function() {
      // Upgrade the colony network
      const colonyNetworkAsER = await EtherRouter.at(COLONYNETWORK_ADDRESS);
      await colonyNetworkAsER.setResolver(newColonyNetworkResolverAddress, { from: COLONYNETWORK_OWNER });
    });

    it("should be able to update user orbit db", async function() {
      await colonyNetwork.updateUserOrbitDB("anotherstring");
      // Get stored orbitdb address
      const hash = namehash.hash("username.user.joincolony.eth");

      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      expect(retrievedOrbitDB).to.equal("anotherstring");
    });
  });

  describe("check behaviour before colony upgrade", function() {
    it("should not be able to update colony orbit db", async function() {
      await checkErrorRevert(
        colony.updateColonyOrbitDB("anotherstring", { from: TESTCOLONY_OWNER })
        // This throws with no error - this is not a failed require. The function just isn't registered
      );
    });
  });

  describe("check behaviour after colony upgrade", function() {
    before(async function() {
      // Upgrade the test colony
      await colony.upgrade(3, { from: TESTCOLONY_OWNER });
      await colony.finishUpgrade2To3();
    });

    it("should be able to update colony orbit db", async function() {
      await colony.updateColonyOrbitDB("anotherstring", { from: TESTCOLONY_OWNER });
      // Get stored orbitdb address
      const hash = namehash.hash("developers.colony.joincolony.eth");

      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      expect(retrievedOrbitDB).to.equal("anotherstring");
    });
  });
});
