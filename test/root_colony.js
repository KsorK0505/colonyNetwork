/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, RootColonyResolver, web3, ColonyFactory, assert */

var testHelper = require('./test-helper.js');
contract('RootColony', function (accounts) {
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var _GAS_PRICE_ = 20e9;
  var _COLONY_KEY_ = 'COLONY_TEST';
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;
  var ifUsingTestRPC = testHelper.ifUsingTestRPC;
  var checkAllGasSpent = testHelper.checkAllGasSpent;
  var removeColony = testHelper.removeColony;

  beforeEach(function(done)
  {
    colonyFactory = ColonyFactory.deployed();
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();

    rootColonyResolver.registerRootColony(rootColony.address)
    .then(function(){
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function(){
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function(){
      rootColony.registerColonyFactory(colonyFactory.address);
      done();
    })
    .catch(done);
  });

  afterEach(function(){
    removeColony(rootColony, _COLONY_KEY_);
  });

  describe('when spawning new colonies', function(){
    it('should allow users to create new colonies', function (done) {
      var colony;
      rootColony.createColony(_COLONY_KEY_, {from: _MAIN_ACCOUNT_})
      .then(function(){
        console.log("Colony key is: ", _COLONY_KEY_);
        return rootColony.getColony(_COLONY_KEY_);
      })
      .then(function (_address){
        console.log("Colony address is:", _address);
        colony = Colony.at(_address);
        return colony;
      })
      .then(function (colony) {
        return colony.getUserInfo.call(_MAIN_ACCOUNT_);
      })
      .then(function(_isAdmin){
        assert.isTrue(_isAdmin, 'creator user is an admin');
        return colony.getRootColony.call();
      })
      .then(function (_rootColonyAddress) {
        assert.equal(rootColony.address, _rootColonyAddress, 'root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if the key provided is empty', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      rootColony.createColony.call('',
      {
        from: _MAIN_ACCOUNT_,
        gasPrice : _GAS_PRICE_,
        gas: 1e6
      })
      .catch(ifUsingTestRPC)
      .then(function(){
        checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if ETH is sent', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      rootColony.createColony.call(_COLONY_KEY_,
      {
        from: _MAIN_ACCOUNT_,
        gasPrice : _GAS_PRICE_,
        gas: 1e6,
        value: 1
      })
      .catch(ifUsingTestRPC)
      .then(function(){
        checkAllGasSpent(1e6, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should pay root colony 5% fee of a completed task value', function (done) {
      var colony;
      var startingBalance = web3.eth.getBalance(rootColony.address);

      rootColony.createColony(_COLONY_KEY_, {from: _MAIN_ACCOUNT_})
      .then(function(){
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (_address){
        colony = Colony.at(_address);
        return colony.taskDB.call();
      })
      .then(function() {
        return colony.makeTask('name', 'summary', {from:_MAIN_ACCOUNT_});
      })
      .then(function() {
        console.log('calling updateTask');
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeEth(0, {from: _MAIN_ACCOUNT_, value: 1000});
      })
      .then(function () {
        console.log('calling completeAndPayTask');
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function () {
        var currentBalance = web3.eth.getBalance(rootColony.address).minus(startingBalance).toNumber();
        assert.equal(currentBalance, 50, 'balance is incorrect or has a unexpected value');
      })
      .then(done)
      .catch(done);
    });
  });
});
