import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { findUserByTelegramId, getUnsweptBurners, markBurnerStatus, getBurnerByAddress } from '@/lib/db/turso';
import { decrypt } from '@/lib/serverless-db';
import { sweepFunds } from '@/lib/bankr/x402';
import { sendAdminLog } from '@/lib/access-control';

export async function GET(request: NextRequest) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session || !session.telegramUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByTelegramId(session.telegramUserId);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const burners = await getUnsweptBurners(user.id);

        // Fetch balances for each burner to show in UI
        const burnersWithBalance = await Promise.all(burners.map(async b => {
            try {
                const { getPublicClient } = await import('@/lib/blockchain/client');
                const publicClient = getPublicClient();
                const balance = await publicClient.getBalance({ address: b.address as `0x${string}` });
                const { formatUnits } = await import('viem');
                return {
                    address: b.address,
                    created_at: b.created_at,
                    status: b.status,
                    balance: formatUnits(balance, 18),
                };
            } catch (e) {
                return {
                    address: b.address,
                    created_at: b.created_at,
                    status: b.status,
                    balance: '0',
                };
            }
        }));

        return NextResponse.json({
            success: true,
            burners: burnersWithBalance
        });
    } catch (error) {
        console.error('[Recover API] GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session || !session.telegramUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { address } = body;

        if (!address) {
            return NextResponse.json({ error: 'Burner address required' }, { status: 400 });
        }

        const burner = await getBurnerByAddress(address);
        if (!burner || burner.status === 'swept') {
            return NextResponse.json({ error: 'Burner not found or already swept' }, { status: 404 });
        }

        // Decrypt the private key
        const privateKey = decrypt(burner.encrypted_pk);
        if (!privateKey) {
            return NextResponse.json({ error: 'Failed to decrypt burner key' }, { status: 500 });
        }

        console.log(`[Recover API] Manual sweep triggered for ${address} by user ${session.address}`);

        const result = await sweepFunds(privateKey, session.address);

        if (result.success) {
            await markBurnerStatus(address, 'swept');
            sendAdminLog(`🧹 <b>Manual Recovery Successful</b>\nFunds recovered from <code>${address.substring(0, 10)}...</code> to <code>${session.address.substring(0, 10)}...</code>`);
            return NextResponse.json({ success: true, message: 'Funds successfully recovered.' });
        } else {
            return NextResponse.json({ error: 'Sweep failed. Burner may not have sufficient funds to cover gas or is already empty.' }, { status: 400 });
        }

    } catch (error) {
        console.error('[Recover API] POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
