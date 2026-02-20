import { createClient, type Client, type Row } from '@libsql/client/web';
import { PRIMARY_ADMIN_ID } from '../access-control';

// ============================================
// Types
// ============================================
export interface DbUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  wallet_address: string | null;
  encrypted_session: string | null;
  last_active_at?: string;
  is_admin: number;
  is_authorized: number;
  total_deployments: number;
  created_at: string;
  updated_at: string;
}

export interface DbSession {
  id: number;
  user_id: number;
  token: string;
  wallet_address: string | null;
  expires_at: string;
  created_at: string;
}

export interface DbDeployment {
  id: number;
  user_id: number;
  token_address: string | null;
  token_name: string;
  token_symbol: string;
  token_image: string | null;
  pool_address: string | null;
  tx_hash: string | null;
  status: 'pending' | 'success' | 'failed';
  error_message: string | null;
  gas_used: string | null;
  created_at: string;
}

// ============================================
// Database Client
// ============================================
let client: Client | null = null;
let initPromise: Promise<void> | null = null;

function getClient(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('TURSO_DATABASE_URL is not configured');
    }

    client = createClient({
      url,
      authToken: authToken || undefined,
    });
  }
  return client;
}

// Ensure DB is initialized
async function ensureDb() {
  if (!initPromise) {
    initPromise = initDatabase();
  }
  return initPromise;
}

// Helper to convert Row to typed object
function rowToUser(row: Row): DbUser {
  return {
    id: row.id as number,
    telegram_id: row.telegram_id as number,
    username: row.username as string | null,
    first_name: row.first_name as string | null,
    wallet_address: row.wallet_address as string | null,
    encrypted_session: row.encrypted_session as string | null,
    is_admin: row.is_admin as number,
    is_authorized: row.is_authorized as number || 0,
    total_deployments: row.total_deployments as number || 0,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function rowToDeployment(row: Row): DbDeployment {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    token_address: row.token_address as string | null,
    token_name: row.token_name as string,
    token_symbol: row.token_symbol as string,
    token_image: row.token_image as string | null,
    pool_address: row.pool_address as string | null,
    tx_hash: row.tx_hash as string | null,
    status: row.status as 'pending' | 'success' | 'failed',
    error_message: row.error_message as string | null,
    gas_used: row.gas_used as string | null,
    created_at: row.created_at as string,
  };
}

export default getClient;

// ============================================
// Database Schema
// ============================================
export async function initDatabase() {
  const db = getClient();

  // Ensure required columns exist
  const migrationQueries = [
    "ALTER TABLE users ADD COLUMN encrypted_session TEXT",
    "ALTER TABLE users ADD COLUMN is_authorized INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_active_at TEXT",
  ];

  for (const query of migrationQueries) {
    try {
      await db.execute(query);
    } catch (e) {
      // Column probably exists
    }
  }

  await db.batch([
    // Users table - enhanced with platform and activity tracking
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      wallet_address TEXT,
      encrypted_session TEXT,
      last_active_at TEXT,
      is_admin INTEGER DEFAULT 0,
      is_authorized INTEGER DEFAULT 0,
      total_deployments INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    // Sessions table - with wallet address
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      wallet_address TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    // Deployments table - enhanced with error tracking
    `CREATE TABLE IF NOT EXISTS deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_address TEXT,
      token_name TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      token_image TEXT,
      pool_address TEXT,
      tx_hash TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed')),
      error_message TEXT,
      gas_used TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    // Create indexes for faster queries
    `CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`,
    `CREATE INDEX IF NOT EXISTS idx_deployments_user_id ON deployments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)`,
  ]);
}

// ============================================
// User Operations
// ============================================
export async function findUserByTelegramId(telegramId: number): Promise<DbUser | null> {
  try {
    await ensureDb();
    const db = getClient();
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE telegram_id = ?',
      args: [telegramId],
    });
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  } catch (error) {
    console.error('[DB] findUserByTelegramId error:', error);
    throw error;
  }
}

export async function findUserById(userId: number): Promise<DbUser | null> {
  try {
    await ensureDb();
    const db = getClient();
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId],
    });
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  } catch (error) {
    console.error('[DB] findUserById error:', error);
    throw error;
  }
}

export async function createUser(
  telegramId: number,
  username?: string,
  firstName?: string
): Promise<DbUser> {
  try {
    await ensureDb();
    const db = getClient();
    const result = await db.execute({
      sql: 'INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?) RETURNING *',
      args: [telegramId, username || null, firstName || null],
    });
    return rowToUser(result.rows[0]);
  } catch (error) {
    console.error('[DB] createUser error:', error);
    throw error;
  }
}

export async function updateUser(
  telegramId: number,
  data: {
    username?: string;
    first_name?: string;
    wallet_address?: string | null;
    encrypted_session?: string | null;
    last_active_at?: string;
    is_admin?: number;
    is_authorized?: number;
  }
): Promise<void> {
  try {
    const db = getClient();
    const updates: string[] = [];
    const args: (string | number | null)[] = [];

    if (data.username !== undefined) {
      updates.push('username = ?');
      args.push(data.username);
    }
    if (data.first_name !== undefined) {
      updates.push('first_name = ?');
      args.push(data.first_name);
    }
    if (data.wallet_address !== undefined) {
      updates.push('wallet_address = ?');
      args.push(data.wallet_address);
    }
    if (data.encrypted_session !== undefined) {
      updates.push('encrypted_session = ?');
      args.push(data.encrypted_session);
    }
    if (data.last_active_at !== undefined) {
      updates.push('last_active_at = ?');
      args.push(data.last_active_at);
    }
    if (data.is_admin !== undefined) {
      updates.push('is_admin = ?');
      args.push(data.is_admin);
    }
    if (data.is_authorized !== undefined) {
      updates.push('is_authorized = ?');
      args.push(data.is_authorized);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    args.push(telegramId);

    await db.execute({
      sql: `UPDATE users SET ${updates.join(', ')} WHERE telegram_id = ?`,
      args,
    });
  } catch (error) {
    console.error('[DB] updateUser error:', error);
    throw error;
  }
}

export async function authorizeUser(telegramId: number): Promise<void> {
  try {
    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      const db = getClient();
      await db.execute({
        sql: 'INSERT INTO users (telegram_id, is_authorized) VALUES (?, 1)',
        args: [telegramId],
      });
    } else {
      await updateUser(telegramId, { is_authorized: 1 });
    }
  } catch (error) {
    console.error('[DB] authorizeUser error:', error);
    throw error;
  }
}

export async function unauthorizeUser(telegramId: number): Promise<void> {
  try {
    await updateUser(telegramId, { is_authorized: 0 });
  } catch (error) {
    console.error('[DB] unauthorizeUser error:', error);
    throw error;
  }
}

export async function isUserAuthorized(telegramId: number): Promise<boolean> {
  try {
    // Primary admin is always authorized by default
    if (telegramId === Number(process.env.PRIMARY_ADMIN_ID) || telegramId === 1558397457) {
      return true;
    }

    await ensureDb();
    const user = await findUserByTelegramId(telegramId);
    return user ? user.is_authorized === 1 : false;
  } catch (error) {
    console.error('[DB] isUserAuthorized error:', error);
    return false;
  }
}


export async function getAllUsersWithAccess(): Promise<DbUser[]> {
  try {
    await ensureDb();
    const db = getClient();
    const result = await db.execute(
      'SELECT * FROM users WHERE is_authorized = 1 ORDER BY updated_at DESC'
    );
    return result.rows.map(rowToUser);
  } catch (error) {
    console.error('[DB] getAllUsersWithAccess error:', error);
    throw error;
  }
}

export async function getUserStats(): Promise<{
  totalUsers: number;
  usersWithAccess: number;
  totalDeployments: number;
  successfulDeployments: number;
}> {
  try {
    await ensureDb();
    const db = getClient();
    const [users, access, deployments, successful] = await Promise.all([
      db.execute('SELECT COUNT(*) as count FROM users'),
      db.execute('SELECT COUNT(*) as count FROM users WHERE is_authorized = 1'),
      db.execute('SELECT COUNT(*) as count FROM deployments'),
      db.execute("SELECT COUNT(*) as count FROM deployments WHERE status = 'success'"),
    ]);
    return {
      totalUsers: users.rows[0]?.count as number || 0,
      usersWithAccess: access.rows[0]?.count as number || 0,
      totalDeployments: deployments.rows[0]?.count as number || 0,
      successfulDeployments: successful.rows[0]?.count as number || 0,
    };
  } catch (error) {
    console.error('[DB] getUserStats error:', error);
    throw error;
  }
}

// ============================================
// Session Operations
// ============================================
export async function createSession(
  userId: number,
  token: string,
  expiresAt: Date,
  walletAddress?: string
): Promise<void> {
  try {
    await ensureDb();
    const db = getClient();
    await db.execute({
      sql: 'INSERT INTO sessions (user_id, token, wallet_address, expires_at) VALUES (?, ?, ?, ?)',
      args: [userId, token, walletAddress || null, expiresAt.toISOString()],
    });
  } catch (error) {
    console.error('[DB] createSession error:', error);
    throw error;
  }
}

export async function getSession(token: string): Promise<(DbSession & { user: DbUser }) | null> {
  try {
    await ensureDb();
    const db = getClient();
    const result = await db.execute({
      sql: `SELECT s.*, u.telegram_id, u.username, u.first_name, u.is_admin, u.is_authorized, u.encrypted_session, u.wallet_address as user_wallet
            FROM sessions s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.token = ? AND s.expires_at > datetime('now')`,
      args: [token],
    });
    if (!result.rows[0]) return null;

    const row = result.rows[0];
    return {
      id: row.id as number,
      user_id: row.user_id as number,
      token: row.token as string,
      wallet_address: row.wallet_address as string | null,
      expires_at: row.expires_at as string,
      created_at: row.created_at as string,
      user: {
        id: row.user_id as number,
        telegram_id: row.telegram_id as number,
        username: row.username as string | null,
        first_name: row.first_name as string | null,
        wallet_address: row.user_wallet as string | null,
        encrypted_session: row.encrypted_session as string | null,
        is_admin: row.is_admin as number,
        is_authorized: row.is_authorized as number || 0,
        total_deployments: 0,
        created_at: '',
        updated_at: '',
      },
    };
  } catch (error) {
    console.error('[DB] getSession error:', error);
    throw error;
  }
}

export async function deleteSession(token: string): Promise<void> {
  try {
    const db = getClient();
    await db.execute({
      sql: 'DELETE FROM sessions WHERE token = ?',
      args: [token],
    });
  } catch (error) {
    console.error('[DB] deleteSession error:', error);
    throw error;
  }
}

export async function deleteUserSessions(userId: number): Promise<void> {
  try {
    const db = getClient();
    await db.execute({
      sql: 'DELETE FROM sessions WHERE user_id = ?',
      args: [userId],
    });
  } catch (error) {
    console.error('[DB] deleteUserSessions error:', error);
    throw error;
  }
}

export async function cleanExpiredSessions(): Promise<number> {
  try {
    const db = getClient();
    const result = await db.execute("DELETE FROM sessions WHERE expires_at < datetime('now')");
    return result.rowsAffected;
  } catch (error) {
    console.error('[DB] cleanExpiredSessions error:', error);
    throw error;
  }
}

// ============================================
// Deployment Operations
// ============================================
export async function createDeployment(
  userId: number,
  tokenName: string,
  tokenSymbol: string,
  tokenImage?: string
): Promise<DbDeployment> {
  try {
    await ensureDb();
    const db = getClient();
    const result = await db.execute({
      sql: `INSERT INTO deployments (user_id, token_name, token_symbol, token_image, status) 
            VALUES (?, ?, ?, ?, 'pending') RETURNING *`,
      args: [userId, tokenName, tokenSymbol, tokenImage || null],
    });
    return rowToDeployment(result.rows[0]);
  } catch (error) {
    console.error('[DB] createDeployment error:', error);
    throw error;
  }
}

export async function updateDeployment(
  id: number,
  data: {
    token_address?: string;
    pool_address?: string;
    tx_hash?: string;
    status?: 'pending' | 'success' | 'failed';
    error_message?: string;
    gas_used?: string;
  }
): Promise<void> {
  try {
    const updates: string[] = [];
    const args: (string | number | null)[] = [];

    if (data.token_address !== undefined) {
      updates.push('token_address = ?');
      args.push(data.token_address);
    }
    if (data.pool_address !== undefined) {
      updates.push('pool_address = ?');
      args.push(data.pool_address);
    }
    if (data.tx_hash !== undefined) {
      updates.push('tx_hash = ?');
      args.push(data.tx_hash);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      args.push(data.status);
    }
    if (data.error_message !== undefined) {
      updates.push('error_message = ?');
      args.push(data.error_message);
    }
    if (data.gas_used !== undefined) {
      updates.push('gas_used = ?');
      args.push(data.gas_used);
    }

    if (updates.length === 0) return;

    const db = getClient();
    args.push(id);
    await db.execute({
      sql: `UPDATE deployments SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });

    // Update user's total deployments count if status is success
    if (data.status === 'success') {
      await ensureDb();
      const db = getClient();
      await db.execute({
        sql: `UPDATE users SET total_deployments = total_deployments + 1 
              WHERE id = (SELECT user_id FROM deployments WHERE id = ?)`,
        args: [id],
      });
    }
  } catch (error) {
    console.error('[DB] updateDeployment error:', error);
    throw error;
  }
}

export async function getDeploymentById(id: number): Promise<DbDeployment | null> {
  try {
    await ensureDb();
    const db = getClient();
    const result = await db.execute({
      sql: 'SELECT * FROM deployments WHERE id = ?',
      args: [id],
    });
    return result.rows[0] ? rowToDeployment(result.rows[0]) : null;
  } catch (error) {
    console.error('[DB] getDeploymentById error:', error);
    throw error;
  }
}

export async function getUserDeployments(
  userId: number,
  limit = 10,
  offset = 0
): Promise<DbDeployment[]> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: 'SELECT * FROM deployments WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      args: [userId, limit, offset],
    });
    return result.rows.map(rowToDeployment);
  } catch (error) {
    console.error('[DB] getUserDeployments error:', error);
    throw error;
  }
}

export async function getDeploymentsByTelegramId(
  telegramId: number,
  limit: number = 20,
  offset: number = 0
): Promise<DbDeployment[]> {
  try {
    const user = await findUserByTelegramId(telegramId);
    if (!user) return [];

    const db = getClient();
    const result = await db.execute({
      sql: `SELECT * FROM deployments 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?`,
      args: [user.id, limit, offset],
    });

    return result.rows as unknown as DbDeployment[];
  } catch (error) {
    console.error(`[DB] getDeploymentsByTelegramId error for ${telegramId}:`, error);
    return [];
  }
}

export async function getRecentDeployments(limit = 20): Promise<(DbDeployment & { username: string | null })[]> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: `SELECT d.*, u.username FROM deployments d 
            JOIN users u ON d.user_id = u.id 
            ORDER BY d.created_at DESC LIMIT ?`,
      args: [limit],
    });
    return result.rows.map((row: any) => ({
      ...rowToDeployment(row),
      username: row.username as string | null,
    }));
  } catch (error) {
    console.error('[DB] getRecentDeployments error:', error);
    throw error;
  }
}
