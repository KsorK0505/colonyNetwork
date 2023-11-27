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

import { IColony } from "./../colony/IColony.sol";
import { ExtractCallData } from "./ExtractCallData.sol";
import { GetActionDomainSkillId } from "./GetActionDomainSkillId.sol";
import { ColonyDataTypes } from "./../colony/ColonyDataTypes.sol";
import { ColonyRoles } from "./../colony/ColonyRoles.sol";

pragma solidity 0.8.23;
pragma experimental ABIEncoderV2;

struct ActionSummary {
  bytes4 sig;
  uint256 domainSkillId;
  uint256 expenditureId;
  bytes32 requiredPermissions;
}

contract GetSingleActionSummary is ExtractCallData, GetActionDomainSkillId {
  bytes4 constant MULTICALL = bytes4(keccak256("multicall(bytes[])"));
  bytes4 constant NO_ACTION = 0x12345678;
  bytes4 constant OLD_MOVE_FUNDS =
    bytes4(
      keccak256("moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)")
    );
  bytes4 constant SET_EXPENDITURE_STATE =
    bytes4(
      keccak256("setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)")
    );
  bytes4 constant SET_EXPENDITURE_PAYOUT =
    bytes4(keccak256("setExpenditurePayout(uint256,uint256,uint256,uint256,address,uint256)"));

  bytes32 constant ROOT_ROLES = ((bytes32(uint256(1)) <<
    uint8(ColonyDataTypes.ColonyRole.Recovery)) |
    (bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root)));

  bytes32 constant ONLY_ROOT_ROLE_MASK =
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root);

  bytes4 constant SET_USER_ROLES =
    bytes4(keccak256("setUserRoles(uint256,uint256,address,uint256,bytes32)"));

  bytes32 constant ONLY_ARCHITECTURE_ROLE_MASK =
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Architecture);

  function getExpenditureId(bytes memory action) internal pure returns (uint256 expenditureId) {
    bytes4 sig = getSig(action);
    assert(isExpenditureSig(sig));

    assembly {
      expenditureId := mload(add(action, 0x64))
    }
  }

  function getSingleActionSummary(
    address colonyNetworkAddress,
    address colonyAddress,
    bytes memory _action,
    address _altTarget
  ) public view returns (ActionSummary memory) {
    bytes4 sig = getSig(_action);

    require(sig != MULTICALL, "colony-get-action-summary-no-nested-multicalls");

    address target = getTarget(_altTarget, colonyAddress);
    ActionSummary memory summary;

    summary.sig = sig;
    bytes32 permissionMask = ColonyRoles(target).getCapabilityRoles(sig);

    if (isExpenditureSig(sig)) {
      summary.domainSkillId = getActionDomainSkillId(_action, colonyNetworkAddress, colonyAddress);
      summary.expenditureId = getExpenditureId(_action);
    } else if (permissionMask | ROOT_ROLES == ROOT_ROLES) {
      summary.domainSkillId = IColony(colonyAddress).getDomain(1).skillId;
      if (permissionMask == bytes32(0)) {
        summary.requiredPermissions = ONLY_ROOT_ROLE_MASK;
      } else {
        summary.requiredPermissions = permissionMask;
      }
    } else {
      summary.domainSkillId = getActionDomainSkillId(_action, colonyNetworkAddress, colonyAddress);
      // A special case for setUserRoles, which can be called by root (in root) and
      // by architecture (if being used in a child domain of where you have the permission)
      if (sig == SET_USER_ROLES) {
        // slither-disable-next-line incorrect-equality
        if (summary.domainSkillId == IColony(colonyAddress).getDomain(1).skillId) {
          permissionMask = ONLY_ROOT_ROLE_MASK;
        } else {
          permissionMask = ONLY_ARCHITECTURE_ROLE_MASK;
        }
      }
      summary.requiredPermissions = permissionMask;
    }
    return summary;
  }

  function isExpenditureSig(bytes4 sig) internal pure returns (bool) {
    return sig == SET_EXPENDITURE_STATE || sig == SET_EXPENDITURE_PAYOUT;
  }

  function getTarget(address _target, address colonyAddress) internal pure returns (address) {
    return (_target == address(0x0)) ? colonyAddress : _target;
  }

  function getSig(bytes memory action) internal pure returns (bytes4 sig) {
    assembly {
      sig := mload(add(action, 0x20))
    }
  }
}