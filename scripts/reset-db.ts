import { getClient, initDatabase } from '../lib/db/turso';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  console.log('--- Database Reset ---');
  
  const db = getClient();
  
  try {
    console.log('Dropping tables in Turso...');
    await db.execute('DROP TABLE IF EXISTS deployments');
    await db.execute('DROP TABLE IF EXISTS sessions');
    await db.execute('DROP TABLE IF EXISTS users');
    console.log('✅ Turso tables dropped.');
    
    console.log('Re-initializing tables...');
    await initDatabase();
    console.log('✅ Turso database initialized.');
    
    const localDbPath = path.resolve(process.cwd(), 'data/umkm.db');
    if (fs.existsSync(localDbPath)) {
      console.log('Clearing local database file...');
      fs.writeFileSync(localDbPath, '');
      console.log('✅ Local database cleared.');
    }
    
    console.log('--- Reset Complete ---');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  }
}

main();
