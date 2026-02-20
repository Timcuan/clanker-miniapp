import { initDatabase } from '../lib/db/turso';

async function main() {
  console.log('Initializing Turso database...');
  
  try {
    await initDatabase();
    console.log('✅ Database initialized successfully!');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }
}

main();
