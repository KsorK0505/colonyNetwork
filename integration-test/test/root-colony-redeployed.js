// These globals are added by Truffle:
/* globals FakeNewRootColony, RootColony, Colony, RootColonyResolver, ColonyFactory, EternalStorage */
contract('RootColony', function () {
  const COLONY_KEY = 'COLONY_TEST';
  const NEW_COLONY_KEY = 'NEW_COLONY_TEST';
  let colonyFactory;
  let rootColony;
  let rootColonyNew;
  let rootColonyResolver;
  let eternalStorageRoot;

  before(function (done) {
    rootColony = RootColony.deployed();
    rootColonyResolver = RootColonyResolver.deployed();
    colonyFactory = ColonyFactory.deployed();
    done();
  });

  // Instantiate and register the new RootColony contract
  beforeEach(function (done) {
    EternalStorage.new()
    .then(function (contract) {
      eternalStorageRoot = contract;
    })
    .then(function () {
      return colonyFactory.registerRootColonyResolver(rootColonyResolver.address);
    })
    .then(function () {
      return rootColonyResolver.registerRootColony(rootColony.address);
    })
    .then(function () {
      return rootColony.registerColonyFactory(colonyFactory.address);
    })
    .then(function () {
      return eternalStorageRoot.changeOwner(rootColony.address);
    })
    .then(function () {
      return rootColony.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function () {
      return rootColony.createColony(COLONY_KEY);
    })
    .then(function () {
      return FakeNewRootColony.new();
    })
    .then(function (newRootContract) {
      rootColonyNew = newRootContract;
      return rootColonyResolver.registerRootColony(rootColonyNew.address);
    })
    .then(function () {
      return rootColonyNew.registerColonyFactory(colonyFactory.address);
    })
    .then(function () {
      return rootColony.changeEternalStorageOwner(rootColonyNew.address);
    })
    .then(function () {
      return rootColonyNew.registerEternalStorage(eternalStorageRoot.address);
    })
    .then(function () {
      done();
    })
    .catch(done);
  });

  describe('when redeploying root colony contract', function () {
    it('should update RootColony address at RootColonyResolver', function (done) {
      rootColonyNew.colonyFactory.call()
      .then(function (_newColonyFactoryAddress) {
        assert.equal(colonyFactory.address, _newColonyFactoryAddress, 'FakeNewRootColony factory was not updated');
        return rootColonyNew.createColony(NEW_COLONY_KEY);
      })
      .then(function () {
        return rootColonyNew.getColony.call(NEW_COLONY_KEY);
      })
      .then(function (_address) {
        const colonyNew = Colony.at(_address);
        return colonyNew.rootColonyResolver.call();
      })
      .then(function (_rootColonyResolverAddress) {
        return RootColonyResolver.at(_rootColonyResolverAddress).rootColonyAddress.call();
      })
      .then(function (rootColonyAddress_) {
        assert.equal(rootColonyAddress_, rootColonyNew.address, 'Root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });

    it('should be able to replace existing Colony\'s RootColony address at RootColonyResolver', function (done) {
      rootColonyNew.getColony.call(COLONY_KEY)
      .then(function (colonyAddress) {
        const oldColony = Colony.at(colonyAddress);
        return oldColony.rootColonyResolver.call();
      })
      .then(function (_rootColonyResolverAddress) {
        return RootColonyResolver.at(_rootColonyResolverAddress).rootColonyAddress.call();
      })
      .then(function (rootColonyAddress_) {
        assert.equal(rootColonyAddress_, rootColonyNew.address, 'Root colony address is incorrect');
      })
      .then(done)
      .catch(done);
    });
  });
});
