export class IPFSService {
    // Public developer keys for resilient free image hosts
    private readonly FREEIMAGE_KEY = '6d207e02198a847aa98d0a2a901485a5';

    /**
     * Sanitizes and extracts the pure Base64 payload or URL from the input.
     */
    private preparePayload(imageData: string): { type: 'url' | 'base64', payload: string } {
        const trimmed = imageData.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return { type: 'url', payload: trimmed };
        }

        const base64Regex = /^data:image\/[a-zA-Z+]+;base64,/;
        if (base64Regex.test(trimmed)) {
            return { type: 'base64', payload: trimmed.replace(base64Regex, '') };
        }

        if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 20) {
            return { type: 'base64', payload: trimmed };
        }

        throw new Error('Invalid payload: Must be a valid HTTP(S) URL or Base64 encoded string.');
    }

    /**
     * Fetch image bytes either from external URL or Base64 string.
     */
    private async getBufferProps(type: 'url' | 'base64', payload: string): Promise<Buffer> {
        if (type === 'base64') {
            return Buffer.from(payload, 'base64');
        }
        // Download from URL
        const response = await fetch(payload);
        if (!response.ok) throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Primary Provider: The Graph Public IPFS Node
     * 
     * Returns: A genuine IPFS CID (Qm...) string.
     */
    private async uploadToTheGraph(buffer: Buffer): Promise<string> {
        const boundary = '----WebKitFormBoundary7MAbn372Z8qYn8xO';
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;

        const body = Buffer.concat([
            Buffer.from(header, 'utf8'),
            buffer,
            Buffer.from(footer, 'utf8')
        ]);

        const res = await fetch('https://api.thegraph.com/ipfs/api/v0/add', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: body
        });

        if (!res.ok) throw new Error(`TheGraph IPFS HTTP ${res.status}`);
        const json = await res.json();
        if (json?.Hash) {
            // Return the specific CID expected by Clanker and Blockchain Ecosystems
            return json.Hash;
        }
        throw new Error(`Invalid TheGraph IPFS Response: ${JSON.stringify(json)}`);
    }

    /**
     * Fallback Provider: FreeImage.host (Web2 URL)
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
     * Uploads an image to public IPFS to acquire a genuine CID (Qm...) or falls back to standard HTTPS url.
     * 
     * @returns Object containing the raw URI and a resolved HTTPS gateway URL.
     */
    async uploadImage(imageData: string, filename: string = 'image.png'): Promise<{ ipfsUrl: string; gatewayUrl: string }> {
        try {
            if (!imageData || imageData.length < 10) {
                throw new Error('imageData is empty or too short.');
            }

            const { type, payload } = this.preparePayload(imageData);

            // Attempt 1: The Graph IPFS (Strict CID request string requirements)
            try {
                const buffer = await this.getBufferProps(type, payload);
                const cid = await this.uploadToTheGraph(buffer);

                return {
                    ipfsUrl: `ipfs://${cid}`,
                    gatewayUrl: `https://ipfs.io/ipfs/${cid}`
                };
            } catch (ipfsError: any) {
                console.warn(`[IPFSService] Primary IPFS Upload Failed (${ipfsError.message}). Failing over to FreeImage Web2 host...`);
            }

            // Attempt 2: FreeImage redundancy backup 
            const web2Url = await this.uploadToFreeImage(payload);
            const secureUrl = web2Url.replace('http://', 'https://');

            return {
                ipfsUrl: secureUrl, // Some contracts accept standard HTTPS URLs
                gatewayUrl: secureUrl
            };

        } catch (err: any) {
            console.error('[IPFSService] CRITICAL: All image upload engines failed.', err.message);
            throw new Error(`Image Upload Failed: ${err.message}`);
        }
    }

    /**
     * File upload shim
     */
    async uploadFile(file: File): Promise<{ ipfsUrl: string; gatewayUrl: string }> {
        throw new Error("uploadFile is unsupported without polyfill. Use uploadImage with Base64 instead.");
    }
}

// Export a singleton instance
export const ipfsService = new IPFSService();
