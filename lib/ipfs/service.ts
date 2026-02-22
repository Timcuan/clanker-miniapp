export class IPFSService {
    // Public developer keys for resilient free image hosts
    private readonly FREEIMAGE_KEY = '6d207e02198a847aa98d0a2a901485a5';
    private readonly IMGBB_KEY = '602e1c9dcfcf5205adccbb1356f91d94';

    /**
     * Sanitizes and extracts the pure Base64 payload or URL from the input.
     */
    private preparePayload(imageData: string): { type: 'url' | 'base64', payload: string } {
        const trimmed = imageData.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return { type: 'url', payload: trimmed };
        }

        // Strip data:image/...;base64, if present
        const base64Regex = /^data:image\/[a-zA-Z+]+;base64,/;
        if (base64Regex.test(trimmed)) {
            return { type: 'base64', payload: trimmed.replace(base64Regex, '') };
        }

        // Assume raw base64 if it looks like it (minimum crude check)
        if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 20) {
            return { type: 'base64', payload: trimmed };
        }

        throw new Error('Invalid payload: Must be a valid HTTP(S) URL or Base64 encoded string.');
    }

    /**
     * Primary Provider: FreeImage.host
     * Uses URLSearchParams to avoid Node.js native FormData multipart bugs.
     */
    private async uploadToFreeImage(payload: string): Promise<string> {
        const body = new URLSearchParams();
        body.append('key', this.FREEIMAGE_KEY);
        body.append('action', 'upload');
        body.append('format', 'json');
        body.append('source', payload);

        const res = await fetch('https://freeimage.host/api/1/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!res.ok) throw new Error(`FreeImage HTTP ${res.status}`);
        const json = await res.json();
        if (json?.status_code === 200 && json?.image?.url) {
            return json.image.url;
        }
        throw new Error('Invalid FreeImage Response');
    }

    /**
     * Fallback Provider 1: ImgBB
     * Uses identical engine/schema to FreeImage.host, serving as a perfect drop-in redundancy.
     */
    private async uploadToImgBB(payload: string): Promise<string> {
        const body = new URLSearchParams();
        body.append('key', this.IMGBB_KEY);
        body.append('image', payload);

        const res = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!res.ok) throw new Error(`ImgBB HTTP ${res.status}`);
        const json = await res.json();
        if (json?.success && json?.data?.url) {
            return json.data.url;
        }
        throw new Error('Invalid ImgBB Response');
    }

    /**
     * Uploads an image to a free, API-keyless permanent image host with built-in multi-gateway redundancies.
     * 
     * @param imageData Base64 string (data:image/...) or standard HTTP URL.
     * @param filename Optional filename (ignored here, since APIs auto-generate hash names).
     * @returns Object containing the raw URI and a resolved HTTPS gateway URL.
     */
    async uploadImage(imageData: string, filename: string = 'image.png'): Promise<{ ipfsUrl: string; gatewayUrl: string }> {
        try {
            if (!imageData || imageData.length < 10) {
                throw new Error('imageData is empty or too short.');
            }

            const { payload } = this.preparePayload(imageData);
            let finalUrl = '';

            // Engine 1: FreeImage.host
            try {
                finalUrl = await this.uploadToFreeImage(payload);
            } catch (e: any) {
                console.warn(`[IPFSService] Primary Upload Failed (${e.message}). Failing over to Secondary Engine...`);
                // Engine 2: ImgBB Redundancy Fallback
                finalUrl = await this.uploadToImgBB(payload);
            }

            if (!finalUrl.startsWith('http')) {
                throw new Error(`Upload succeeded but returned internal path: ${finalUrl}`);
            }

            // Force secure protocol
            finalUrl = finalUrl.replace('http://', 'https://');

            return {
                ipfsUrl: finalUrl,
                gatewayUrl: finalUrl
            };

        } catch (err: any) {
            console.error('[IPFSService] CRITICAL: All image upload engines failed.', err.message);
            throw new Error(`Image Upload Failed: ${err.message}`);
        }
    }

    /**
     * File upload shim (Unused in bot environments but included for interface parity)
     */
    async uploadFile(file: File): Promise<{ ipfsUrl: string; gatewayUrl: string }> {
        throw new Error("uploadFile is unsupported without polyfill. Use uploadImage with Base64 instead.");
    }
}

// Export a singleton instance
export const ipfsService = new IPFSService();
