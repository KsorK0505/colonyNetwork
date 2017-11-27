/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const IColony = artifacts.require('IColony');
const ColonyNetwork = artifacts.require('ColonyNetwork');
const EtherRouter = artifacts.require('EtherRouter');

contract('Colony', function (accounts) {
  let COLONY_KEY;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const THIRD_ACCOUNT = accounts[2];
  const FOURTH_ACCOUNT = accounts[3];
  // This value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  const GAS_TO_SPEND = 4700000;
  // The base58 decoded, bytes32 converted value of the task ipfsHash
  const specificationHash = '9bb76d8e6c89b524d34a454b3140df28';
  const deliverableHash = '9cc89e3e3d12a672d67a424b3640ce34';
  const _RATING_SECRET_1_ = sha3(testHelper.getRandomString(5));

  let colony;
  let colonyNetwork;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);
    await colonyNetwork.createColony("Common Colony");
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    let address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await IColony.at(address);
  });

  describe('when rating a task deliverable', () => {
    it('should allow worker to submit rating', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      await colony.setTaskWorker(1, THIRD_ACCOUNT);
      await colony.submitTaskWorkRating(1, 2, _RATING_SECRET_1_, { from: THIRD_ACCOUNT });
      
      let rating = await colony.getTaskWorkRating.call(1, 2);
      assert.equal(rating, _RATING_SECRET_1_);      
    });

    it('should allow evaluator to submit rating', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      await colony.setTaskWorker(1, THIRD_ACCOUNT);
      await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { from: OTHER_ACCOUNT });
        
      let rating = await colony.getTaskWorkRating.call(1, 1);
      assert.equal(rating, _RATING_SECRET_1_);      
    });

    it('should fail if I try to rate work on behalf of a worker', async function () {
      await colony.makeTask(specificationHash);
      await colony.setTaskEvaluator(1, OTHER_ACCOUNT);
      await colony.setTaskWorker(1, THIRD_ACCOUNT);

      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { from: FOURTH_ACCOUNT, gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);

      let rating = await colony.getTaskWorkRating.call(1, 1);
      assert.notEqual(rating, _RATING_SECRET_1_);
    });

    it('should fail if I try to submit work for a task using an invalid id', async function () {
      let tx;
      try {
        tx = await colony.submitTaskWorkRating(1, 1, _RATING_SECRET_1_, { gas: GAS_TO_SPEND });
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      await testHelper.checkAllGasSpent(GAS_TO_SPEND, tx);
    });
  });

});