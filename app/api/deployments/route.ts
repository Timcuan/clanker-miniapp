import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findUserByTelegramId, createDeployment, updateDeployment, getDeploymentsByTelegramId, getDeploymentById } from '@/lib/db/turso';
import { decodeSession, getSessionCookieName } from '@/lib/serverless-db';
import { cookies } from 'next/headers';

// Schema for creating a deployment
const CreateDeploymentSchema = z.object({
  telegramUserId: z.number(),
  tokenName: z.string().min(1).max(50),
  tokenSymbol: z.string().min(1).max(10),
  tokenImage: z.string().url().optional(),
});

// Schema for updating a deployment
const UpdateDeploymentSchema = z.object({
  deploymentId: z.number(),
  tokenAddress: z.string().optional(),
  poolAddress: z.string().optional(),
  txHash: z.string().optional(),
  status: z.enum(['pending', 'success', 'failed']).optional(),
  errorMessage: z.string().optional(),
  gasUsed: z.string().optional(),
});

// Helper to get Telegram user ID from request
function getTelegramUserId(request: NextRequest): number | undefined {
  const headerUserId = request.headers.get('x-telegram-user-id');
  if (headerUserId) {
    const parsed = parseInt(headerUserId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  const queryUserId = request.nextUrl.searchParams.get('telegramUserId');
  if (queryUserId) {
    const parsed = parseInt(queryUserId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return undefined;
}

// GET - Get user's deployments
export async function GET(request: NextRequest) {
  try {
    const telegramUserId = getTelegramUserId(request);

    if (!telegramUserId) {
      return NextResponse.json(
        { error: 'Telegram user ID required' },
        { status: 400 }
      );
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

    // 1. Get Local Database Deployments
    let localDeployments: any[] = [];
    try {
      localDeployments = await getDeploymentsByTelegramId(telegramUserId, limit, offset);
    } catch (e) {
      console.warn("Failed to fetch local deployments", e);
    }

    // 2. Fetch Global Deployments from Clanker World API
    let globalDeployments: any[] = [];
    try {
      // Decode session to get user's wallet address
      const cookieStore = await cookies();
      const sessionCookieName = getSessionCookieName(telegramUserId);
      const sessionCookie = cookieStore.get(sessionCookieName)?.value;

      let walletAddress = null;
      if (sessionCookie) {
        const session = decodeSession(sessionCookie);
        walletAddress = session?.address || (session as any)?.walletAddress;
      }

      if (walletAddress) {
        const clankerRes = await fetch(`https://www.clanker.world/api/tokens?deployer=${walletAddress}`);
        if (clankerRes.ok) {
          const clankerData = await clankerRes.json();
          if (clankerData.data && Array.isArray(clankerData.data)) {
            globalDeployments = clankerData.data.map((token: any) => ({
              id: `api-${token.id}`,
              name: token.name,
              symbol: token.symbol,
              image: token.img_url || null,
              tokenAddress: token.contract_address,
              txHash: token.tx_hash,
              timestamp: new Date(token.created_at).getTime(),
              status: 'confirmed', // Clanker API only returns confirmed tokens
              errorMessage: null
            }));
          }
        }
      }
    } catch (e) {
      console.warn("Failed to fetch global Clanker deployments", e);
    }

    // 3. Merge and Deduplicate (prefer local for accurate timestamp/status if pending, otherwise they should be identical)
    const mergedMap = new Map<string, any>();

    localDeployments.forEach(d => {
      // Use tokenAddress or txHash as unique identifier if available, otherwise just use its ID
      const key = d.tokenAddress?.toLowerCase() || d.txHash?.toLowerCase() || `local-${d.id}`;
      mergedMap.set(key, d);
    });

    globalDeployments.forEach(d => {
      const key = d.tokenAddress?.toLowerCase() || d.txHash?.toLowerCase();
      // Only add if not already present from local DB (or if local DB is missing it)
      if (key && !mergedMap.has(key)) {
        mergedMap.set(key, d);
      }
    });

    // Sort combined list by timestamp descending
    const finalDeployments = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({
      success: true,
      deployments: finalDeployments,
      count: finalDeployments.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Deployments GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deployments' },
      { status: 500 }
    );
  }
}

// POST - Create a new deployment record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateDeploymentSchema.parse(body);

    // Find user
    const user = await findUserByTelegramId(data.telegramUserId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Create deployment record
    const deployment = await createDeployment(
      user.id,
      data.tokenName,
      data.tokenSymbol,
      data.tokenImage
    );

    return NextResponse.json({
      success: true,
      deployment,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[Deployments POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create deployment' },
      { status: 500 }
    );
  }
}

// PATCH - Update deployment status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const data = UpdateDeploymentSchema.parse(body);

    // Verify deployment exists
    const deployment = await getDeploymentById(data.deploymentId);
    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    // Update deployment
    await updateDeployment(data.deploymentId, {
      token_address: data.tokenAddress,
      pool_address: data.poolAddress,
      tx_hash: data.txHash,
      status: data.status,
      error_message: data.errorMessage,
      gas_used: data.gasUsed,
    });

    // Get updated deployment
    const updated = await getDeploymentById(data.deploymentId);

    return NextResponse.json({
      success: true,
      deployment: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[Deployments PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update deployment' },
      { status: 500 }
    );
  }
}
