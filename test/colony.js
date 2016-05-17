/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, Colony, EternalStorage, ColonyFactory, ColonyTokenLedger, RootColony, RootColonyResolver, web3, assert,  */
var testHelper = require('../helpers/test-helper.js');
contract('Colony', function (accounts) {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var _GAS_PRICE_ = 20e9;
  //this value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  var _GAS_TO_SPEND_ = 4e6;

  var optionsToSpotTransactionFailure = {
    from: _MAIN_ACCOUNT_,
    gasPrice : _GAS_PRICE_,
    gas: _GAS_TO_SPEND_
  };

  var colony;
  var eternalStorage;
  var colonyFactory;
  var rootColony;
  var rootColonyResolver;

  before(function(done)
  {
    colonyFactory = ColonyFactory.deployed();
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();

    rootColonyResolver.registerRootColony(rootColony.address)
    .then(function(){
      colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function(){
      rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(done)
    .catch(done);
  });

  afterEach(function(done){
    rootColony.removeColony(_COLONY_KEY_).then(function(){ done(); }).catch(done);
  });

  beforeEach(function(done){
    rootColony.createColony(_COLONY_KEY_, {from: _MAIN_ACCOUNT_})
    .then(function(){
      return rootColony.getColony.call(_COLONY_KEY_);
    })
    .then(function(colony_){
      colony = Colony.at(colony_);
    })
    .then(function(){
      return colony.eternalStorage.call();
    })
    .then(function(extStorageAddress){
      eternalStorage = EternalStorage.at(extStorageAddress);
    })
    .then(done)
    .catch(done);
  });
/*
  describe('when created', function () {

    it('should take deploying user as an admin', function (done) {
      colony.getUserInfo.call(_MAIN_ACCOUNT_)
      .then(function (admin) {
        assert.equal(admin, true, 'First user isn\'t an admin');
      })
      .then(done)
      .catch(done);
    });

    it('should other users not be an admin until I add s/he', function (done) {
      colony.getUserInfo.call(_OTHER_ACCOUNT_)
      .then(function (admin) {
        assert.equal(admin, false, 'Other user is an admin');
      })
      .then(done)
      .catch(done);
    });

    it('should keep a count of the number of admins', function (done) {
      colony.adminsCount.call()
      .then(function (_adminsCount) {
        assert.equal(_adminsCount, 1, 'Admin count is different from 1');
      })
      .then(done)
      .catch(done);
    });

    it('should increase admin count by the number of admins added', function (done) {
      colony.addAdmin(_OTHER_ACCOUNT_)
      .then(function () {
        return colony.adminsCount.call();
      })
      .then(function (_adminsCount) {
        assert.equal(_adminsCount, 2, 'Admin count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should decrease admin count by the number of admins removed', function (done) {
      colony.addAdmin(_OTHER_ACCOUNT_)
      .then(function(){
        return colony.removeAdmin(_OTHER_ACCOUNT_);
      })
      .then(function () {
        return colony.adminsCount.call();
      })
      .then(function (_adminsCount) {
        assert.equal(_adminsCount, 1, 'Admin count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should allow a revoked admin to be promoted to an admin again', function (done) {
      colony.addAdmin(_OTHER_ACCOUNT_)
      .then(function(){
        return colony.removeAdmin(_OTHER_ACCOUNT_);
      })
      .then(function(){
        return colony.addAdmin(_OTHER_ACCOUNT_);
      })
      .then(function(){
        return colony.getUserInfo.call(_OTHER_ACCOUNT_);
      })
      .then(function(_isAdmin){
        assert.isTrue(_isAdmin, 'previously revoked admins cannot be promoted to admin again');
      })
      .then(function(){
        return colony.adminsCount.call();
      })
      .then(function(_adminsCount){
        assert.equal(_adminsCount.toNumber(), 2, 'admins count is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove the last admin', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      colony.removeAdmin(_MAIN_ACCOUNT_,optionsToSpotTransactionFailure)
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to add the same address multiple times', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      colony.addAdmin(_MAIN_ACCOUNT_,optionsToSpotTransactionFailure)
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove an address that is currently not an admin', function (done) {
      var prevBalance;
      colony.addAdmin(_OTHER_ACCOUNT_)
      .then(function(){
        return colony.removeAdmin(_OTHER_ACCOUNT_);
      })
      .then(function(){
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.removeAdmin(_OTHER_ACCOUNT_,
        {
          from: _MAIN_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: _GAS_TO_SPEND_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail to remove an address that was never an admin', function (done) {
      var prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      colony.removeAdmin(_OTHER_ACCOUNT_, optionsToSpotTransactionFailure)
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should generate tokens and assign it to the colony', function(done){
      var tokenLedger;
      colony.tokenLedger.call()
      .then(function(tokenLedgerAddress) {
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
        return colony.generateColonyTokens(100);
      })
      .then(function(){
        return tokenLedger.balanceOf.call(colony.address);
      })
      .then(function(totalSupplyTokens){
        assert.equal(totalSupplyTokens.toNumber(), 100 * 1e18);
      })
      .then(done)
      .catch(done);
    });

    it('should set colony as the token ledger owner', function (done) {
      var tokenLedger;
      colony.tokenLedger.call()
      .then(function(tokenLedgerAddress){
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
        return tokenLedger.owner.call();
      })
      .then(function(_tokenLedgerOwner){
        assert.equal(_tokenLedgerOwner, colony.address, 'Colony admin should be set as the owner of its Token Ledger.');
      })
      .then(done)
      .catch(done);
    });
  });
*/
  describe('when creating/updating tasks', function () {
    it('should allow admins to make task', function (done) {
      colony.makeTask('name', 'summary')
      .then(function () {
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'name', 'Wrong task name');
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_summary', 0));
      })
      .then(function(_summary){
        assert.equal(_summary, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(testHelper.solSha3('task_accepted', 0));
      })
      .then(function(accepted){
        assert.equal(accepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_eth', 0));
      })
      .then(function(eth){
        assert.equal(eth.toNumber(), 0, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_tokensWei', 0));
      })
      .then(function(_tokensWei){
        assert.equal(_tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should allow admins to edit task', function (done) {
      colony.makeTask('name', 'summary')
      .then(function () {
        return colony.updateTask(0, 'nameedit', 'summaryedit');
      })
      .then(function () {
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_name', 0));
      })
      .then(function (_name) {
        assert.equal(_name, 'nameedit', 'Wrong task name');
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_summary', 0));
      })
      .then(function(summary){
        assert.equal(summary, 'summaryedit', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(testHelper.solSha3('task_accepted', 0));
      })
      .then(function(task_accepted){
        assert.equal(task_accepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_eth', 0));
      })
      .then(function(_eth){
        assert.equal(_eth.toNumber(), 0, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_tokensWei', 0));
      })
      .then(function(_tokensWei){
        assert.equal(_tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if other users non-admins try to edit a task', function (done) {
      var prevBalance;
      colony.makeTask('name', 'summary').then(function () {
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return colony.updateTask(0, 'nameedit', 'summary',
        {
          from: _OTHER_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: _GAS_TO_SPEND_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _OTHER_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if other users non-admins try to make a task', function (done) {
      var prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
      colony.makeTask('name', 'summary',
      {
        from: _OTHER_ACCOUNT_,
        gasPrice : _GAS_PRICE_,
        gas: _GAS_TO_SPEND_
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _OTHER_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });
  });

  describe('when contributing to tasks', function(){
    it('should allow admins to contribute ETH to task', function (done) {
      colony.makeTask('name', 'summary')
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summaryedit');
      })
      .then(function () {
        return colony.contributeEth(0, {
          value: 10000
        });
      })
      .then(function () {
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_name', 0));
      })
      .then(function (name) {
        assert.equal(name, 'nameedit', 'Wrong task name');
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_summary', 0));
      })
      .then(function(_summary){
        assert.equal(_summary, 'summaryedit', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(testHelper.solSha3('task_accepted', 0));
      })
      .then(function(_accepted){
        assert.equal(_accepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_eth', 0));
      })
      .then(function(_eth){
        assert.equal(_eth.toNumber(), 10000, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_tokensWei', 0));
      })
      .then(function(_tokensWei){
        assert.equal(_tokensWei.toNumber(), 0, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if non-admins try to contribute ETH to task', function (done) {
      var prevBalance;
      colony.makeTask('name', 'summary')
      .then(function () {
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return colony.contributeEth(0, {
          value: 10000,
          from: _OTHER_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: _GAS_TO_SPEND_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _OTHER_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should allow admins to contribute tokens to task', function (done) {
      var tokenLedger;
      colony.generateColonyTokens(100, {from: _MAIN_ACCOUNT_})
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function(){
        return colony.makeTask('name2', 'summary2');
      })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.tokenLedger.call();
      })
      .then(function(tokenLedgerAddress){
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
      })
      .then(function(){
        return tokenLedger.balanceOf.call(colony.address);
      })
      .then(function(colonyBalance){
        assert.equal(colonyBalance.toNumber(), 100 * 1e18 , 'Colony address balance should be 100 tokens.');
        return colony.contributeTokensFromPool(0, 100, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return colony.reservedTokensWei.call();
      })
      .then(function(reservedTokensWei){
        assert.equal(100 * 1e18, reservedTokensWei, 'Colony tokens were not reserved for task');
      })
      .then(function(){
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return tokenLedger.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function(otherAccountTokenBalance){
        assert.equal(otherAccountTokenBalance.toNumber(), 95 * 1e18, '_OTHER_ACCOUNT_ balance should be 95 tokens.');
        return tokenLedger.approve(colony.address, 95 * 1e18, {from: _OTHER_ACCOUNT_});
      })
      .then(function(){
        return colony.addAdmin(_OTHER_ACCOUNT_);
      })
      .then(function(){
        return colony.contributeTokens(1, 95, {from: _OTHER_ACCOUNT_});
      })
      .then(function () {
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_name', 1));
      })
      .then(function (_name) {
        assert.equal(_name, 'name2', 'Wrong task name');
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_summary', 1));
      })
      .then(function(_summary){
        assert.equal(_summary, 'summary2', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(testHelper.solSha3('task_accepted', 1));
      })
      .then(function(_accepted){
        assert.equal(_accepted, false, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_eth', 1));
      })
      .then(function(_eth){
        assert.equal(_eth.toNumber(), 0, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_tokensWei', 1));
      })
      .then(function(_tokensWei){
        assert.equal(_tokensWei.toNumber(), 95000000000000000000, 'Wrong tokens wei value');
      })
      .then(done)
      .catch(done);
    });

    it('should allow colonies to assign tokens to tasks', function (done) {
      var prevBalance;
      colony.generateColonyTokens(100, {from: _MAIN_ACCOUNT_})
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function(){
        return colony.contributeTokensFromPool(0, 70, {from:_MAIN_ACCOUNT_});
      })
      .then(function(){
        return colony.reservedTokensWei.call();
      })
      .then(function(reservedTokensWei){
        assert.equal(reservedTokensWei.toNumber(), 70 * 1e18, 'Has not reserved the right amount of colony tokens.');
        prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
        return colony.contributeTokens(0, 100, {from:_MAIN_ACCOUNT_, gasPrice: _GAS_PRICE_, gas:_GAS_TO_SPEND_});
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(function(){
        done();
      })
      .catch(done);
    });

    it('should not allow colonies to assign more tokens to tasks than they have', function (done) {
      var prevBalance;
      colony.generateColonyTokens(100, {from: _MAIN_ACCOUNT_})
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function(){
        return colony.makeTask('name2', 'summary2');
      })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function(){
        return colony.contributeTokensFromPool(0, 100, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        colony.generateColonyTokens(100, {from: _MAIN_ACCOUNT_});
      })
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function(){
          prevBalance = web3.eth.getBalance(_MAIN_ACCOUNT_);
      })
      .then(function(){
        //More than the pool, less than totalsupply
        return colony.contributeTokensFromPool(1, 150, {from:_MAIN_ACCOUNT_, gasPrice:_GAS_PRICE_, gas:_GAS_TO_SPEND_});
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _MAIN_ACCOUNT_, prevBalance);
      })
      .then(function(){
        done();
      })
      .catch(done);
    });

    it('should not allow non-admin to close task', function (done) {
      var prevBalance;
      colony.makeTask('name', 'summary')
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeEth(0, {
          value: 10000
        });
      })
      .then(function () {
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _OTHER_ACCOUNT_ });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function () {
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_name', 0));
      })
      .then(function (task_name) {
        assert.equal(task_name, 'nameedit', 'Wrong task name');
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_summary', 0));
      })
      .then(function(summary){
        assert.equal(summary, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(testHelper.solSha3('task_accepted', 0));
      })
      .then(function(_accepted){
        assert.equal(_accepted, false, 'Wrong accepted value');
        assert.equal(web3.eth.getBalance(_OTHER_ACCOUNT_).lessThan(prevBalance), true);
      })
      .then(done)
      .catch(done);
    });

    it('should allow admin to close task', function (done) {
      var prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
      colony.makeTask('name', 'summary')
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeEth(0, {
          value: 10000
        });
      })
      .then(function () {
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function () {
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_name', 0));
      })
      .then(function (n) {
        assert.equal(n, 'nameedit', 'Wrong task name');
        return eternalStorage.getStringValue.call(testHelper.solSha3('task_summary', 0));
      })
      .then(function(s){
        assert.equal(s, 'summary', 'Wrong task summary');
        return eternalStorage.getBooleanValue.call(testHelper.solSha3('task_accepted', 0));
      })
      .then(function(_accepted){
        assert.equal(_accepted, true, 'Wrong accepted value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_eth', 0));
      })
      .then(function(eth){
        assert.equal(eth.toNumber(), 10000, 'Wrong task ether value');
        return eternalStorage.getUIntValue.call(testHelper.solSha3('task_tokensWei', 0));
      })
      .then(function(_tokensWei){
        assert.equal(_tokensWei.toNumber(), 0, 'Wrong tokens wei value');
        assert.equal(web3.eth.getBalance(_OTHER_ACCOUNT_).minus(prevBalance).toNumber(), 9500);
      })
      .then(done)
      .catch(done);
    });

    it('should transfer 95% of tokens to task completor and 5% to rootColony on completing a task', function (done) {
      var tokenLedger;
      colony.generateColonyTokens(100)
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function() {
        return colony.updateTask(0, 'nameedit', 'summary');
      })
      .then(function () {
        return colony.contributeTokensFromPool(0, 100);
      })
      .then(function () {
        return colony.completeAndPayTask(0, _OTHER_ACCOUNT_, { from: _MAIN_ACCOUNT_ });
      })
      .then(function(){
        return colony.tokenLedger.call();
      })
      .then(function(tokenLedgerAddress){
        tokenLedger = ColonyTokenLedger.at(tokenLedgerAddress);
      })
      .then(function(){
        return tokenLedger.balanceOf.call(_OTHER_ACCOUNT_);
      })
      .then(function(otherAccountTokenBalance){
        assert.strictEqual(otherAccountTokenBalance.toNumber(), 95 * 1e18, 'Token balance is not 95% of task token value');
        return tokenLedger.balanceOf.call(rootColony.address);
      })
      .then(function(rootColonyTokenBalance){
        assert.strictEqual(rootColonyTokenBalance.toNumber(), 5 * 1e18, 'RootColony token balance is not 5% of task token value');
      })
      .then(done)
      .catch(done);
    });

    it('should fail if non-admins try to contribute with tokens from the pool', function (done) {
      var prevBalance;
      colony.generateColonyTokens(100)
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return colony.contributeTokens(0, 100, {
          from: _OTHER_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: _GAS_TO_SPEND_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _OTHER_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

    it('should fail if non-admins try to contribute with tokens', function (done) {
      var prevBalance;
      colony.generateColonyTokens(100)
      .then(function(){
        return colony.makeTask('name', 'summary');
      })
      .then(function () {
        prevBalance = web3.eth.getBalance(_OTHER_ACCOUNT_);
        return colony.contributeTokensFromPool(0, 100, {
          from: _OTHER_ACCOUNT_,
          gasPrice : _GAS_PRICE_,
          gas: _GAS_TO_SPEND_
        });
      })
      .catch(testHelper.ifUsingTestRPC)
      .then(function(){
        testHelper.checkAllGasSpent(_GAS_TO_SPEND_, _GAS_PRICE_, _OTHER_ACCOUNT_, prevBalance);
      })
      .then(done)
      .catch(done);
    });

  });
});
