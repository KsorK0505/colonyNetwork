import "Modifiable.sol";
import "IUpgradable.sol";
import "IRootColonyResolver.sol";
import "TokenLibrary.sol";
import "Ownable.sol";
import "ColonyPaymentProvider.sol";
import "TaskLibrary.sol";
import "SecurityLibrary.sol";

contract Colony is Modifiable, IUpgradable  {

  modifier onlyRootColony(){
    if(msg.sender != IRootColonyResolver(rootColonyResolver).rootColonyAddress()) { throw; }
    _
  }

  modifier onlyAdmins {
    if (!this.isUserAdmin(msg.sender)) { throw; }
    _
  }

  IRootColonyResolver public rootColonyResolver;

  // Link libraries containing business logic to EternalStorage
  using TaskLibrary for address;
  using SecurityLibrary for address;
  using TokenLibrary for address;
  address public eternalStorage;

  function Colony(address rootColonyResolverAddress_, address _eternalStorage)
  {
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
    eternalStorage = _eternalStorage;
  }

  /// @notice registers a new RootColonyResolver contract used to keep the reference of the RootColony.
  /// @param rootColonyResolverAddress_ the RootColonyResolver address
  function registerRootColonyResolver(address rootColonyResolverAddress_)
  onlyAdmins
  throwIfAddressIsInvalid(rootColonyResolverAddress_)
  {
    rootColonyResolver = IRootColonyResolver(rootColonyResolverAddress_);
  }

  /// @notice returns the number of admins for this colony
  function adminsCount()
  constant returns(uint256)
  {
    return eternalStorage.getAdminsCount();
  }

  /// @notice adds a new admin user to the colony
  /// @param _user the address of the new admin user
  function addAdmin(address _user)
  onlyAdmins
  {
    eternalStorage.addAdmin(_user);
  }

  /// @notice removes an admin from the colony
  /// @param _user the address of the admin to be removed
  function removeAdmin(address _user)
  onlyAdmins
  {
    eternalStorage.removeAdmin(_user);
  }

  /// @notice returns user info based in a given address
  /// @param _user the address to be verified
  /// @return a boolean value indicating if the user is an admin
  function isUserAdmin(address _user)
  constant returns (bool)
  {
    return eternalStorage.isUserAdmin(_user);
  }

  /// @notice gets the reserved colony tokens for funding tasks
  /// This is to understand the amount of 'unavailable' tokens due to them been promised to be paid once a task completes.
  /// @return a uint value indicating if the amount of reserved colony tokens
  function reservedTokensWei() constant returns (uint256)
  {
    return eternalStorage.getReservedTokensWei();
  }

  /// @notice contribute ETH to a task
  /// @param taskId the task ID
  function contributeEthToTask(uint256 taskId)
  onlyAdmins
  {
    eternalStorage.contributeEthToTask(taskId, msg.value);
  }

  /// @notice contribute tokens from an admin to fund a task
  /// @param taskId the task ID
  /// @param tokensWei the amount of tokens wei to fund the task
  function contributeTokensWeiToTask(uint256 taskId, uint256 tokensWei)
  onlyAdmins
  {
    // When a user funds a task, the actually is a transfer of tokens ocurring from their address to the colony's one.
    if (eternalStorage.transfer(this, tokensWei)) {
      eternalStorage.contributeTokensWeiToTask(taskId, tokensWei, false);
    }
    else{
      throw;
    }
  }

  /// @notice contribute tokens from the colony pool to fund a task
  /// @param taskId the task ID
  /// @param tokensWei the amount of tokens wei to fund the task
  function contributeTokensWeiFromPool(uint256 taskId, uint256 tokensWei)
  onlyAdmins
  {
    // When tasks are funded from the pool of unassigned tokens,
    // no transfer takes place - we just mark them as assigned.
    var reservedTokensWei = eternalStorage.getReservedTokensWei();
    if ((reservedTokensWei + tokensWei) <= eternalStorage.balanceOf(this)) {
      eternalStorage.contributeTokensWeiToTask(taskId, tokensWei, true);
    }
    else {
      throw;
    }
  }

  function getTaskCount() constant returns (uint256)
  {
    return eternalStorage.getTaskCount();
  }

  /// @notice this function adds a task to the task DB.
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function makeTask(
    string _name,
    string _summary
  )
  onlyAdmins
  throwIfIsEmptyString(_name)
  {
      eternalStorage.makeTask(_name, _summary);
  }

  /// @notice this function updates the 'accepted' flag in the task
  /// @param _id the task id
  function acceptTask(uint256 _id)
  onlyAdmins
  {
    eternalStorage.acceptTask(_id);
  }

  /// @notice this function is used to update task data.
  /// @param _id the task id
  /// @param _name the task name
  /// @param _summary an IPFS hash
  function updateTask(
    uint256 _id,
    string _name,
    string _summary
  )
  onlyAdmins
  throwIfIsEmptyString(_name)
  {
    eternalStorage.updateTask(_id, _name, _summary);
  }

  /// @notice set the colony tokens symbol
  /// @param symbol_ the symbol of the colony tokens
  function setTokensSymbol(bytes symbol_)
  refundEtherSentByAccident
  onlyAdmins
  {
    eternalStorage.setTokensSymbol(symbol_);
  }

  /// @notice set the colony tokens title
  /// @param title_ the title of the colony tokens
  function setTokensTitle(bytes title_)
  refundEtherSentByAccident
  onlyAdmins
  {
    eternalStorage.setTokensTitle(title_);
  }

  /// @notice mark a task as completed, pay the user who completed it and root colony fee
  /// @param taskId the task ID to be completed and paid
  /// @param paymentAddress the address of the user to be paid
  function completeAndPayTask(uint256 taskId, address paymentAddress)
  onlyAdmins
  {
    eternalStorage.acceptTask(taskId);

    var (taskEth, taskTokens) = eternalStorage.getTaskBalance(taskId);
    if (taskEth > 0) {
      ColonyPaymentProvider.settleTaskFees(taskEth, paymentAddress, rootColonyResolver.rootColonyAddress());
    }

    if (taskTokens > 0) {
      var payout = ((taskTokens * 95)/100);
      var fee = taskTokens - payout;
      if (eternalStorage.transferFromColony(paymentAddress, payout) && eternalStorage.transferFromColony(rootColonyResolver.rootColonyAddress(), fee)) {
        var reservedTokensWei = eternalStorage.getReservedTokensWei();
        eternalStorage.setReservedTokensWei(reservedTokensWei - taskTokens);
        eternalStorage.removeReservedTokensWeiForTask(taskId);
      }
      else{
        throw;
      }
    }
  }

  function transfer(address _to, uint256 _value)
  refundEtherSentByAccident
  returns (bool success)
  {
    return eternalStorage.transfer(_to, _value);
  }

   function transferFrom(address _from, address _to, uint256 _value)
   refundEtherSentByAccident
   returns (bool success)
   {
     return eternalStorage.transferFrom(_from, _to, _value);
   }

   function balanceOf(address _account) constant returns (uint256 balance)
   {
     return eternalStorage.balanceOf(_account);
   }

   function allowance(address _owner, address _spender) constant returns (uint256)
   {
     return eternalStorage.allowance(_owner, _spender);
   }

   function approve(address _spender, uint256 _value)
   refundEtherSentByAccident
   returns (bool success)
   {
     return eternalStorage.approve(_spender, _value);
   }

  /// @notice this function is used to generate Colony tokens
  /// @param _tokensWei The amount of tokens wei to be generated
  function generateTokensWei(uint256 _tokensWei)
  onlyAdmins
  refundEtherSentByAccident
  {
    eternalStorage.generateTokensWei(_tokensWei);
  }

  function totalSupply()
  onlyAdmins
  constant returns (uint256)
  {
    return eternalStorage.totalSupply();
  }

  /// @notice upgrade the colony migrating its data to another colony instance
  /// @param newColonyAddress_ the address of the new colony instance
  function upgrade(address newColonyAddress_)
  onlyRootColony
  {
    var tokensBalance = eternalStorage.balanceOf(this);
    if(tokensBalance > 0 && !eternalStorage.transferFromColony(newColonyAddress_, tokensBalance)) {
      throw;
    }

    Ownable(eternalStorage).changeOwner(newColonyAddress_);
    selfdestruct(newColonyAddress_);
  }
}
