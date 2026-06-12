import { getInventoryDetails } from './src/lib/database/warehouse';

async function test() {
  const result = await getInventoryDetails();
  console.log('Array.isArray?', Array.isArray(result));
  console.log('Result:', typeof result);
  console.log('Result keys:', Object.keys(result));
}

test();
