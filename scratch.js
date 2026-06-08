import { createPublicClient, http } from 'viem';
import { defineChain } from 'viem';

const liteforge = defineChain({
  id: 4441,
  name: 'LitVM LiteForge',
  nativeCurrency: { name: 'LitVM ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://liteforge.rpc.caldera.xyz/http'] } },
});

const client = createPublicClient({ chain: liteforge, transport: http() });

const ABI = [
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
];

async function main() {
  try {
    const code = await client.getBytecode({ address: '0xA79C6b3922949fcaBb518f56f0B6e68Ca7115771' });
    console.log('Contract Code exists:', !!code && code.length > 2);
    
    const [name, symbol, supply] = await Promise.all([
      client.readContract({ address: '0xA79C6b3922949fcaBb518f56f0B6e68Ca7115771', abi: ABI, functionName: 'name' }).catch(() => null),
      client.readContract({ address: '0xA79C6b3922949fcaBb518f56f0B6e68Ca7115771', abi: ABI, functionName: 'symbol' }).catch(() => null),
      client.readContract({ address: '0xA79C6b3922949fcaBb518f56f0B6e68Ca7115771', abi: ABI, functionName: 'totalSupply' }).catch(() => null),
    ]);
    console.log('Name:', name);
    console.log('Symbol:', symbol);
    console.log('Supply:', supply);
  } catch (e) {
    console.error(e);
  }
}
main();
