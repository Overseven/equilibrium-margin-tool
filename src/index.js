import {ApiPromise, WsProvider } from '@polkadot/api';

// const nodeRpc = "wss://history.ksm.genshiro.io";
const nodeRpc = "wss://equilibrium.api.onfinality.io/public-ws";
const account = "cg7LN5pvAiLM2pBdKS4NavK2EmMpqprrwHHAqGnmnWguZUZUU";
const useHistory = false;
const blockNumber = 2949590;

const main = async () => {
  const provider = new WsProvider(nodeRpc);
  const apiLatest = await ApiPromise.create({provider});
  const blockHash = await apiLatest.rpc.chain.getBlockHash(blockNumber);
  const apiHistory = await apiLatest.at(blockHash);
  let api;
  if (useHistory) {
    api = apiHistory;
  } else {
    api = apiLatest;
  }
  const [chain, nodeName, nodeVersion, latestBlock] = await Promise.all([
    apiLatest.rpc.system.chain(),
    apiLatest.rpc.system.name(),
    apiLatest.rpc.system.version(),
    apiLatest.rpc.chain.getBlock()
  ]);
  const latestBlockNumber = JSON.parse(latestBlock).block.header.number;
  console.log(`You are connected to chain ${chain} using ${nodeName} v${nodeVersion}\n\n`);

  console.log(`Account: ${account}`);
  console.log(`Block number: ${useHistory ? blockNumber : latestBlockNumber}`);

  const systemInfo = JSON.parse(await api.query.system.account(account))
  const assetsInfo = JSON.parse(await api.query.eqAssets.assets());
  const maintenanceTimer = await getMaintenanceTimers(api, account);
  let collateral = 0;
  let debt = 0;

  for (const b of systemInfo.data.v0.balance) {
    const assetId = b[0];
    const assetName = dec2ascii(assetId);
    const balance = parseBalance(b[1]);
    const price = await getPrice(api, assetId, assetName);
    let coeff = 1;
    if (balance > 0) {
      coeff = await getCollateralCoeff(assetsInfo, assetId);
      collateral += balance * price * coeff;
    } else if (balance < 0) {
      debt += -1 * balance * price;
    }
    if (balance !== 0) {
      console.log(`${assetName.padStart(8, ' ')}: ${balance.toString().padStart(25, ' ')},   disc coeff: ${coeff.toString().padStart(6, ' ')},   discounted: ${(balance * price * coeff).toString().padStart(25, ' ')} USD,   price: ${price.toString().padStart(25, ' ')} USD`);
    }
  }

  const margin = collateral > 0 ? (collateral - debt) / collateral * 100 : 0;
  console.log(`\nCollateral: ${collateral} USD`);
  console.log(`Debt: ${debt} USD`);
  console.log(`Margin: ${margin} %`)
  console.log(`Maintenance timer: ${maintenanceTimer}`)
}

function dec2ascii(dec) {
    const hex = dec.toString(16);
    let str = '';
    for (let i = 0; i < hex.length; i += 2)
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

function parseBalance(balance) {
  let amount = 0;
  if (Object.keys(balance).includes("positive")) {
    amount = balance["positive"];
  } else if (Object.keys(balance).includes("negative")) {
    amount = -1 * balance["negative"];
  }

  return amount / 1000000000;
}

async function getPrice(api, assetId, assetName) {
  if (assetName.toLowerCase() === "eqd") {
    return 1.0;
  }
  return (await api.query.oracle.pricePoints(assetId)).toJSON().price / 1000000000;
}

async function getCollateralCoeff(assetsInfo, assetId) {
  const assetInfo = assetsInfo.find(x => x.id === assetId);
  return assetInfo.collateralDiscount / 100.0;
}

async function getMaintenanceTimers(api, account) {
  return api.query.eqMarginCall.maintenanceTimers(account);
}

main()
