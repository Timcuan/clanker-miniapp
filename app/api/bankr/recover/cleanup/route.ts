import { NextRequest, NextResponse } from 'next/server';
import { getAllUnsweptBurnersWithUser, markBurnerStatus } from '@/lib/db/turso';
import { decrypt } from '@/lib/serverless-db';
import { sweepFunds } from '@/lib/bankr/x402';
import { sendAdminLog } from '@/lib/access-control';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Basic security check (Cron Secret or Admin Key)
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET || process.env.ENCRYPTION_KEY;

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const burners = await getAllUnsweptBurnersWithUser();
        console.log(`[Cleanup] Found ${burners.length} active burners to process.`);

        let successCount = 0;
        let failedCount = 0;
        const results = [];

        for (const burner of burners) {
            try {
                const privateKey = decrypt(burner.encrypted_pk);
                if (!privateKey) throw new Error('Decryption failed');

                const sweepRes = await sweepFunds(privateKey, burner.userAddress);

                if (sweepRes.success) {
                    await markBurnerStatus(burner.address, 'swept');
                    successCount++;
                    results.push({ address: burner.address, status: 'swept', ethHash: sweepRes.ethHash });
                } else {
                    // Don't mark as failed yet, just skip
                    failedCount++;
                    results.push({ address: burner.address, status: 'skipped', error: sweepRes.error });
                }
            } catch (err) {
                console.error(`[Cleanup] Error processing ${burner.address}:`, err);
                failedCount++;
            }
        }

        if (successCount > 0) {
            sendAdminLog(`🧹 <b>Auto-Cleanup Complete</b>\nProcessed <code>${burners.length}</code> burners.\n✅ Success: <code>${successCount}</code>\n❌ Failed/Skipped: <code>${failedCount}</code>`);
        }

        return NextResponse.json({
            success: true,
            processed: burners.length,
            recovered: successCount,
            results
        });

    } catch (error) {
        console.error('[Cleanup API] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
