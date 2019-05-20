import { soliditySha3, padLeft } from "web3-utils";
import { hashPersonalMessage, ecsign } from "ethereumjs-util";
import fs from "fs";
import { ethers } from "ethers";

export async function executeSignedTaskChange({ colony, taskId, functionName, signers, sigTypes, args }) {
  const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({ colony, taskId, functionName, signers, sigTypes, args });
  return colony.executeTaskChange(sigV, sigR, sigS, sigTypes, 0, txData);
}

export async function executeSignedRoleAssignment({ colony, taskId, functionName, signers, sigTypes, args }) {
  const { sigV, sigR, sigS, txData } = await getSigsAndTransactionData({ colony, taskId, functionName, signers, sigTypes, args });
  return colony.executeTaskRoleAssignment(sigV, sigR, sigS, sigTypes, 0, txData);
}

export async function getSigsAndTransactionData({ colony, taskId, functionName, signers, sigTypes, args }) {
  // We have to pass in an ethers BN because of https://github.com/ethereum/web3.js/issues/1920
  // and https://github.com/ethereum/web3.js/issues/2077
  const ethersBNTaskId = ethers.utils.bigNumberify(taskId.toString());
  const convertedArgs = [];
  args.forEach(arg => {
    if (Number.isInteger(arg)) {
      const convertedArg = ethers.utils.bigNumberify(arg);
      convertedArgs.push(convertedArg);
    } else if (web3.utils.isBN(arg) || web3.utils.isBigNumber(arg)) {
      const convertedArg = ethers.utils.bigNumberify(arg.toString());
      convertedArgs.push(convertedArg);
    } else {
      convertedArgs.push(arg);
    }
  });

  const txData = await colony.contract.methods[functionName](...convertedArgs).encodeABI();
  const sigsPromises = sigTypes.map((type, i) => {
    if (type === 0) {
      return createSignatures(colony, ethersBNTaskId, [signers[i]], 0, txData);
    }
    return createSignaturesTrezor(colony, ethersBNTaskId, [signers[i]], 0, txData);
  });
  const sigs = await Promise.all(sigsPromises);
  const sigV = sigs.map(sig => sig.sigV[0]);
  const sigR = sigs.map(sig => sig.sigR[0]);
  const sigS = sigs.map(sig => sig.sigS[0]);
  return { sigV, sigR, sigS, txData };
}

async function createSignatures(colony, taskId, signers, value, data) {
  const sourceAddress = colony.address;
  const destinationAddress = colony.address;
  const nonce = await colony.getTaskChangeNonce(taskId);
  const accountsJson = JSON.parse(fs.readFileSync("./ganache-accounts.json", "utf8"));

  const input = `0x${sourceAddress.slice(2)}${destinationAddress.slice(2)}${padLeft(value.toString(16), "64", "0")}${data.slice(2)}${padLeft(
    nonce.toString(16),
    "64",
    "0"
  )}`; // eslint-disable-line max-len
  const sigV = [];
  const sigR = [];
  const sigS = [];
  const msgHash = soliditySha3(input);

  for (let i = 0; i < signers.length; i += 1) {
    let user = signers[i].toString();
    user = user.toLowerCase();
    const privKey = accountsJson.private_keys[user];
    const prefixedMessageHash = await hashPersonalMessage(Buffer.from(msgHash.slice(2), "hex"));
    const sig = await ecsign(prefixedMessageHash, Buffer.from(privKey, "hex"));

    sigV.push(sig.v);
    sigR.push(`0x${sig.r.toString("hex")}`);
    sigS.push(`0x${sig.s.toString("hex")}`);
  }

  return { sigV, sigR, sigS };
}

async function createSignaturesTrezor(colony, taskId, signers, value, data) {
  const sourceAddress = colony.address;
  const destinationAddress = colony.address;
  const nonce = await colony.getTaskChangeNonce(taskId);
  const accountsJson = JSON.parse(fs.readFileSync("./ganache-accounts.json", "utf8"));
  const input = `0x${sourceAddress.slice(2)}${destinationAddress.slice(2)}${padLeft(value.toString(16), "64", "0")}${data.slice(2)}${padLeft(
    nonce.toString(16),
    "64",
    "0"
  )}`; // eslint-disable-line max-len
  const sigV = [];
  const sigR = [];
  const sigS = [];
  const msgHash = soliditySha3(input);

  for (let i = 0; i < signers.length; i += 1) {
    let user = signers[i].toString();
    user = user.toLowerCase();
    const privKey = accountsJson.private_keys[user];
    const prefixedMessageHash = soliditySha3("\x19Ethereum Signed Message:\n\x20", msgHash);
    const sig = ecsign(Buffer.from(prefixedMessageHash.slice(2), "hex"), Buffer.from(privKey, "hex"));
    sigV.push(sig.v);
    sigR.push(`0x${sig.r.toString("hex")}`);
    sigS.push(`0x${sig.s.toString("hex")}`);
  }

  return { sigV, sigR, sigS };
}
