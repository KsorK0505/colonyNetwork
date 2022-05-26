const { soliditySha3, padLeft } = require("web3-utils");
const { hashPersonalMessage, ecsign } = require("ethereumjs-util");
const fs = require("fs");
const { ethers } = require("ethers");
const { encodeTxData } = require("./test-helper");

exports.executeSignedTaskChange = async function executeSignedTaskChange({ colony, taskId, functionName, signers, privKeys, sigTypes, args }) {
  const { sigV, sigR, sigS, txData } = await exports.getSigsAndTransactionData({ colony, taskId, functionName, signers, privKeys, sigTypes, args });
  return colony.executeTaskChange(sigV, sigR, sigS, sigTypes, 0, txData);
};

exports.executeSignedRoleAssignment = async function executeSignedRoleAssignment({
  colony,
  taskId,
  functionName,
  signers,
  privKeys,
  sigTypes,
  args,
}) {
  const { sigV, sigR, sigS, txData } = await exports.getSigsAndTransactionData({ colony, taskId, functionName, signers, privKeys, sigTypes, args });
  return colony.executeTaskRoleAssignment(sigV, sigR, sigS, sigTypes, 0, txData);
};

exports.getSigsAndTransactionData = async function getSigsAndTransactionData({ colony, taskId, functionName, signers, privKeys, sigTypes, args }) {
  // We have to pass in an ethers BN because of https://github.com/ethereum/web3.js/issues/1920
  // and https://github.com/ethereum/web3.js/issues/2077
  const txData = await encodeTxData(colony, functionName, args);
  const ethersBNTaskId = ethers.BigNumber.from(taskId.toString());
  const sigsPromises = sigTypes.map((type, i) => {
    let privKey = [];
    if (privKeys) {
      privKey = [privKeys[i]];
    }
    if (type === 0) {
      return exports.createSignatures(colony, ethersBNTaskId, [signers[i]], privKey, 0, txData);
    }
    return exports.createSignaturesTrezor(colony, ethersBNTaskId, [signers[i]], privKey, 0, txData);
  });
  const sigs = await Promise.all(sigsPromises);
  const sigV = sigs.map((sig) => sig.sigV[0]);
  const sigR = sigs.map((sig) => sig.sigR[0]);
  const sigS = sigs.map((sig) => sig.sigS[0]);
  return { sigV, sigR, sigS, txData };
};

exports.createSignatures = async function createSignatures(colony, taskId, signers, privKeys, value, data) {
  const sourceAddress = colony.address;
  const destinationAddress = colony.address;
  const nonce = await colony.getTaskChangeNonce(taskId);
  const input = `0x${sourceAddress.slice(2)}${destinationAddress.slice(2)}${padLeft(value.toString(16), "64", "0")}${data.slice(2)}${padLeft(
    nonce.toString(16),
    "64",
    "0"
  )}`; // eslint-disable-line max-len
  const sigV = [];
  const sigR = [];
  const sigS = [];
  const msgHash = soliditySha3(input);

  let accountsJson;
  // When private keys are not provided, refer to the local test accounts generated by ganache-cli
  if (privKeys.length === 0) {
    accountsJson = JSON.parse(fs.readFileSync("./ganache-accounts.json", "utf8"));
  }

  for (let i = 0; i < signers.length; i += 1) {
    let user = signers[i].toString();
    user = user.toLowerCase();

    let privKey;
    if (privKeys[i]) {
      privKey = privKeys[i].replace("0x", "");
    } else {
      privKey = accountsJson.private_keys[user].replace("0x", "");
    }

    const prefixedMessageHash = hashPersonalMessage(Buffer.from(msgHash.slice(2), "hex"));
    const sig = ecsign(prefixedMessageHash, Buffer.from(privKey, "hex"));

    sigV.push(sig.v);
    sigR.push(`0x${sig.r.toString("hex")}`);
    sigS.push(`0x${sig.s.toString("hex")}`);
  }

  return { sigV, sigR, sigS };
};

exports.createSignaturesTrezor = async function createSignaturesTrezor(colony, taskId, signers, privKeys, value, data) {
  const sourceAddress = colony.address;
  const destinationAddress = colony.address;
  const nonce = await colony.getTaskChangeNonce(taskId);
  const input = `0x${sourceAddress.slice(2)}${destinationAddress.slice(2)}${padLeft(value.toString(16), "64", "0")}${data.slice(2)}${padLeft(
    nonce.toString(16),
    "64",
    "0"
  )}`; // eslint-disable-line max-len
  const sigV = [];
  const sigR = [];
  const sigS = [];
  const msgHash = soliditySha3(input);

  let accountsJson;
  // When private keys are not provided, refer to the local test accounts generated by ganache-cli
  if (privKeys.length === 0) {
    accountsJson = JSON.parse(fs.readFileSync("./ganache-accounts.json", "utf8"));
  }

  for (let i = 0; i < signers.length; i += 1) {
    let user = signers[i].toString();
    user = user.toLowerCase();

    let privKey;
    if (privKeys[i]) {
      privKey = privKeys[i].replace("0x", "");
    } else {
      privKey = accountsJson.private_keys[user].replace("0x", "");
    }

    const prefixedMessageHash = soliditySha3("\x19Ethereum Signed Message:\n\x20", msgHash);
    const sig = ecsign(Buffer.from(prefixedMessageHash.slice(2), "hex"), Buffer.from(privKey, "hex"));
    sigV.push(sig.v);
    sigR.push(`0x${sig.r.toString("hex")}`);
    sigS.push(`0x${sig.s.toString("hex")}`);
  }

  return { sigV, sigR, sigS };
};
