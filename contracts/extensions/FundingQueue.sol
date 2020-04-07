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

pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/math.sol";
import "./../colony/IColony.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../common/ERC20Extended.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./../tokenLocking/ITokenLocking.sol";


contract FundingQueue is DSMath, PatriciaTreeProofs {

  // Constants
  uint256 constant HEAD = 0;
  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant FUNDING_MULTIPLE = WAD / 2;

  // Initialization data
  IColony colony;
  IColonyNetwork colonyNetwork;
  ITokenLocking tokenLocking;
  address token;

  constructor(address _colony) public {
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    tokenLocking = ITokenLocking(colonyNetwork.getTokenLocking());
    token = colony.getToken();

    proposals[HEAD].totalSupport = UINT256_MAX; // Initialize queue
  }

  // Data structures
  enum ProposalState { Inactive, Active, Completed, Cancelled }

  struct Proposal {
    ProposalState state;
    address creator;
    address token;
    uint256 domainSkillId;
    uint256 domainTotalRep;
    uint256 fromPot;
    uint256 toPot;
    uint256 totalRequested;
    uint256 totalPaid;
    uint256 lastUpdated;
    uint256 totalSupport;
  }

  // Storage
  uint256 proposalCount;
  mapping (uint256 => Proposal) proposals;
  mapping (uint256 => mapping (address => uint256)) supporters;
  mapping (uint256 => uint256) queue; // proposalId => nextProposalId

  // Public functions

  function createBasicProposal(
    uint256 _domainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _totalRequested,
    address _token
  )
    public
  {
    uint256 fromDomain = colony.getDomainFromFundingPot(_fromPot);
    uint256 toDomain = colony.getDomainFromFundingPot(_toPot);

    uint256 domainSkillId = colony.getDomain(_domainId).skillId;
    uint256 fromSkillId = colony.getDomain(fromDomain).skillId;
    uint256 toSkillId = colony.getDomain(toDomain).skillId;

    require(
      domainSkillId == fromSkillId ||
      fromSkillId == colonyNetwork.getChildSkillId(domainSkillId, _fromChildSkillIndex),
      "funding-queue-bad-inheritence-from"
    );
    require(
      domainSkillId == toSkillId ||
      toSkillId == colonyNetwork.getChildSkillId(domainSkillId, _toChildSkillIndex),
      "funding-queue-bad-inheritence-to"
    );

    proposalCount++;
    proposals[proposalCount] = Proposal(
      ProposalState.Active, msg.sender, _token, domainSkillId, 0, _fromPot, _toPot, _totalRequested, 0, now, 0
    );
    queue[proposalCount] = proposalCount; // Initialize as a disconnected self-edge
  }

  function updateProposalTotalRep(
    uint256 _id,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    proposals[_id].domainTotalRep = checkReputation(_id, address(0x0), _key, _value, _branchMask, _siblings);
  }

  function backBasicProposal(
    uint256 _id,
    uint256 _currPrevId,
    uint256 _newPrevId,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Proposal storage proposal = proposals[_id];
    require(proposal.state == ProposalState.Active, "funding-queue-proposal-not-active");
    require(_id != _newPrevId, "funding-queue-cannot-insert-after-self");

    require(supporters[_id][msg.sender] == 0, "funding-queue-already-supported");
    uint256 userReputation = checkReputation(_id, msg.sender, _key, _value, _branchMask, _siblings);

    proposal.totalSupport = add(proposal.totalSupport, userReputation);
    supporters[_id][msg.sender] = userReputation;

    // Remove the proposal from its current position, if exists
    require(queue[_currPrevId] == _id, "funding-queue-bad-prev-id");
    queue[_currPrevId] = queue[_id];

    // Insert into the right location
    uint256 nextId = queue[_newPrevId];
    // Does this proposal have less or equal support than the previous proposal?
    require(
      proposals[_newPrevId].totalSupport >= proposal.totalSupport,
      "funding-queue-excess-support"
    );
    // Does this proposal have more support than the next proposal?
    require(
      nextId == HEAD || proposals[nextId].totalSupport < proposal.totalSupport,
      "funding-queue-insufficient-support"
    );
    queue[_newPrevId] = _id; // prev proposal => this proposal
    queue[_id] = nextId; // this proposal => next proposal
  }

  function pingProposal(
    uint256 _id,
    uint256 _permissionDomainId,
    uint256 _toChildSkillIndex,
    uint256 _fromChildSkillIndex
  )
    public
  {
    Proposal storage proposal = proposals[_id];
    require(proposal.domainTotalRep > 0, "funding-queue-zero-domain-total-rep");

    uint256 backingPercent = min(WAD, wdiv(proposal.totalSupport, proposal.domainTotalRep));
    uint256 elapsedPeriods = wdiv(now - proposal.lastUpdated, 7 days);

    uint256 fromPotBalance = colony.getFundingPotBalance(proposal.fromPot, token);
    uint256 fundingPerPeriod = wmul(fromPotBalance, wmul(backingPercent, FUNDING_MULTIPLE));
    uint256 fundingToTransfer = wmul(fundingPerPeriod, elapsedPeriods);

    proposal.lastUpdated = now;

    colony.moveFundsBetweenPots(
      _permissionDomainId,
      _toChildSkillIndex,
      _fromChildSkillIndex,
      proposal.fromPot,
      proposal.toPot,
      fundingToTransfer,
      proposal.token
    );
  }

  // Public view functions

  function getProposalCount() public view returns (uint256) {
    return proposalCount;
  }

  function getProposal(uint256 _id) public view returns (Proposal memory proposal) {
    return proposals[_id];
  }

  function getSupport(uint256 _id, address _supporter) public view returns (uint256) {
    return supporters[_id][_supporter];
  }

  function getHeadId() public view returns (uint256) {
    return queue[HEAD];
  }

  function getNextProposalId(uint256 _id) public view returns (uint256) {
    return queue[_id];
  }

  // Internal functions

  function checkReputation(
    uint256 _id,
    address _who,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    internal view returns (uint256)
  {
    bytes32 impliedRoot = getImpliedRootHashKey(_key, _value, _branchMask, _siblings);
    require(colonyNetwork.getReputationRootHash() == impliedRoot, "funding-queue-invalid-root-hash");

    uint256 reputationValue;
    address keyColonyAddress;
    uint256 keySkill;
    address keyUserAddress;

    assembly {
      reputationValue := mload(add(_value, 32))
      keyColonyAddress := mload(add(_key, 20))
      keySkill := mload(add(_key, 52))
      keyUserAddress := mload(add(_key, 72))
    }

    require(keyColonyAddress == address(colony), "funding-queue-invalid-colony-address");
    require(keySkill == proposals[_id].domainSkillId, "funding-queue-invalid-skill-id");
    require(keyUserAddress == _who, "funding-queue-invalid-user-address");

    return reputationValue;
  }
}
