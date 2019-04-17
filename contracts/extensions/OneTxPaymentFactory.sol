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

pragma solidity >=0.5.3;
pragma experimental ABIEncoderV2;

import "./../ColonyDataTypes.sol";
import "./../IColony.sol";
import "./../ColonyAuthority.sol";
import "./ExtensionFactory.sol";
import "./OneTxPayment.sol";


contract OneTxPaymentFactory is ExtensionFactory, ColonyDataTypes {
  mapping (address => OneTxPayment) public deployedExtensions;	

  function deployExtension(address _colony) external {
    require(
      ColonyAuthority(IColony(_colony).authority()).hasUserRole(msg.sender, 1, uint8(ColonyRole.Root)) == true, 
      "colony-extension-user-not-root"
    );
    require(deployedExtensions[_colony] == OneTxPayment(0x00), "colony-extension-already-deployed");
    OneTxPayment newExtensionAddress = new OneTxPayment(_colony);
    deployedExtensions[_colony] = newExtensionAddress;
  }

  function removeExtension(address _colony) external {
    require(
      ColonyAuthority(IColony(_colony).authority()).hasUserRole(msg.sender, 1, uint8(ColonyRole.Root)) == true,
      "colony-extension-user-not-root"
    );
    deployedExtensions[_colony] = OneTxPayment(0x00);
  }

}
