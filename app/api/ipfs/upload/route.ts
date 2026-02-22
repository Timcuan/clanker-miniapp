import { NextRequest, NextResponse } from 'next/server';
import { ipfsService } from '@/lib/ipfs/service';
import { getSessionFromRequest } from '@/lib/auth/session';
import { z } from 'zod';

const UploadBodySchema = z.object({
    imageData: z.string().min(1, 'imageData is required'),
    filename: z.string().optional()
});

export async function POST(request: NextRequest) {
    // We use the same Auth Bridge so Telegram Bots or Headless Agents can authenticate
    // using X-Agent-Key or standard sessions.
    const session = await getSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const parsedArgs = UploadBodySchema.safeParse(body);

        if (!parsedArgs.success) {
            return NextResponse.json({
                error: 'Invalid arguments',
                details: parsedArgs.error.errors
            }, { status: 400 });
        }

        const { imageData, filename } = parsedArgs.data;

        // Utilize the centralized IPFS Service
        const result = await ipfsService.uploadImage(imageData, filename);

        return NextResponse.json({
            success: true,
            result
        });

    } catch (err: any) {
        console.error('[IPFS Upload API Error]', err);
        return NextResponse.json({
            error: `Image upload failed: ${err.message}`
        }, { status: 500 });
    }
}
