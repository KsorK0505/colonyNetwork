/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, FakeNewRootColony, RootColony, Colony, RootColonyResolver, ColonyFactory, assert, EternalStorage
*/
var testHelper = require('../../helpers/test-helper.js');

contract('RootColony', function () {
  var _COLONY_KEY_ = 'COLONY_TEST';
  var _NEW_COLONY_KEY_ = 'NEW_COLONY_TEST';
  var colonyFactory;
  var rootColony;
  var rootColonyNew;
  var rootColonyResolver;
  var eternalStorageRoot;

  before(function(done){
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();
    colonyFactory = ColonyFactory.deployed();

    EternalStorage.new()
    .then(function(contract){
      eternalStorageRoot = contract;
      return;
    })
    .then(function(){
      return eternalStorageRoot.changeOwner(colonyFactory.address);
    })
    .then(function(){
      return rootColonyResolver.registerRootColony(rootColony.address);
    })
    .then(function(){
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function(){
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function(){
      return colonyFactory.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function(){
      return rootColony.createColony(_COLONY_KEY_);
    })
    .then(function(){
      done();
    })
    .catch(done);
  });

  // Instantiate and register the new RootColony contract
  beforeEach(function(done){
    FakeNewRootColony.new({gas: 4e6, gasPrice: 20e9})
    .then(function(newRootContract){
      rootColonyNew = newRootContract;
      return rootColonyResolver.registerRootColony(rootColonyNew.address);
    })
    .then(function() {
      return rootColonyNew.registerColonyFactory(colonyFactory.address);
    })
    .then(function(){
      done();
    })
    .catch(done);
  });

  describe('when redeploying root colony contract', function () {
    it('should update RootColony address at RootColonyResolver', function (done) {
      rootColonyNew.colonyFactory.call()
      .then(function(_newColonyFactoryAddress){
        assert.equal(colonyFactory.address, _newColonyFactoryAddress, 'FakeNewRootColony factory was not updated');
        return rootColonyNew.createColony(_NEW_COLONY_KEY_);
      })
      .then(function(){
        return rootColonyNew.getColony.call(_NEW_COLONY_KEY_);
      })
      .then(function (_address) {
        var colonyNew = Colony.at(_address);
        return colonyNew.rootColonyResolver.call();
      })
      .then(function(_rootColonyResolverAddress){
        return RootColonyResolver.at(_rootColonyResolverAddress).rootColonyAddress.call();
      })
      .then(function(rootColonyAddress_){
        assert.equal(rootColonyAddress_, rootColonyNew.address, 'Root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to replace existing Colony\'s RootColony address at RootColonyResolver', function (done) {
      rootColonyNew.getColony.call(_COLONY_KEY_)
      .then(function(colonyAddress){
        var oldColony = Colony.at(colonyAddress);
        return oldColony.rootColonyResolver.call();
      })
      .then(function(_rootColonyResolverAddress){
        return RootColonyResolver.at(_rootColonyResolverAddress).rootColonyAddress.call();
      })
      .then(function(rootColonyAddress_){
        assert.equal(rootColonyAddress_, rootColonyNew.address, 'Root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
