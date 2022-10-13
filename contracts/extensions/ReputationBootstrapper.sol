/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/erc20.sol";
import "./ColonyExtensionMeta.sol";

// ignore-file-swc-108


contract ReputationBootstrapper is ColonyExtensionMeta {

  // Constants

  uint256 constant INT128_MAX = 2**127 - 1;
  // Based on a 90-day half-life
  uint256 constant HOURLY_DECAY_NUMERATOR = 999679150010889; // e ** -(ln(2)/2160)
  uint256 constant DAILY_DECAY_NUMERATOR =  992327946262943; // e ** -(ln(2)/90)
  uint256 constant DECAY_DENOMINATOR =     1000000000000000;

  // Events

  event GrantSet(bytes32 hashedSecret, uint256 reputationAmount);
  event GrantClaimed(address recipient, uint256 reputationAmount, uint256 tokenAmount);

  // Data structures

  struct Grant {
    uint256 amount;
    uint256 timestamp;
  }

  // Storage

  address public token;
  bool public giveTokens;

  mapping (bytes32 => Grant) public grants;

  // Modifiers

  modifier onlyRoot() {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "reputation-bootsrapper-caller-not-root");
    _;
  }

  // Overrides

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("ReputationBootstrapper");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 1;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    token = colony.getToken();
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {}

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    uint256 balance = ERC20(token).balanceOf(address(this));
    require(ERC20(token).transfer(address(colony), balance), "reputation-bootstrapper-transfer-failed");

    selfdestruct(address(uint160(address(colony))));
  }

  // Public

  function setGiveTokens(bool _giveTokens) public onlyRoot {
    giveTokens = _giveTokens;
  }

  function setGrants(bytes32[] memory _hashedSecrets, uint256[] memory _amounts) public onlyRoot notDeprecated {
    require(_hashedSecrets.length == _amounts.length, "reputation-bootsrapper-invalid-arguments");

    for (uint256 i; i < _hashedSecrets.length; i++) {
      require(_amounts[i] <= INT128_MAX, "reputation-bootstrapper-invalid-amount");
      grants[_hashedSecrets[i]] = Grant(_amounts[i], block.timestamp);

      emit GrantSet(_hashedSecrets[i], _amounts[i]);
    }
  }

  function claimGrant(uint256 _secret) public {
    bytes32 hashedSecret = keccak256(abi.encodePacked(_secret));
    uint256 grantAmount = grants[hashedSecret].amount;
    uint256 tokenAmount = grants[hashedSecret].amount;
    uint256 grantTimestamp = grants[hashedSecret].timestamp;

    require(grantAmount > 0, "reputation-bootstrapper-nothing-to-claim");

    delete grants[hashedSecret];

    // First, decay by any full days
    for (; grantTimestamp <= block.timestamp - 1 days; grantTimestamp += 1 days) {
      // slither-disable-next-line divide-before-multiply
      grantAmount = grantAmount * DAILY_DECAY_NUMERATOR / DECAY_DENOMINATOR;
    }
    // Then, decay by remaining hours
    for (; grantTimestamp <= block.timestamp - 1 hours; grantTimestamp += 1 hours) {
      // slither-disable-next-line divide-before-multiply
      grantAmount = grantAmount * HOURLY_DECAY_NUMERATOR / DECAY_DENOMINATOR;
     }

    colony.emitDomainReputationReward(1, msgSender(), int256(grantAmount));

    if (giveTokens) {
      require(ERC20(token).transfer(msgSender(), tokenAmount), "reputation-bootstrapper-transfer-failed");
    }

    emit GrantClaimed(msgSender(), grantAmount, tokenAmount);
  }


}
