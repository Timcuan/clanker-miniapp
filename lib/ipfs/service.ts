export class IPFSService {
    private readonly FREEIMAGE_KEY = '6d207e02198a847aa98d0a2a901485a5';
    private readonly MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
    private readonly TIMEOUT_MS = 20000; // 20s timeout

    private async fetchWithTimeout(url: string, options: any = {}) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(id);
        }
    }

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

    private async getBuffer(type: 'url' | 'base64', payload: string): Promise<Buffer> {
        let buffer: Buffer;
        if (type === 'base64') {
            buffer = Buffer.from(payload, 'base64');
        } else {
            const response = await this.fetchWithTimeout(payload);
            if (!response.ok) throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        }

        if (buffer.length > this.MAX_SIZE) {
            throw new Error(`Image is too large (${(buffer.length / 1024 / 1024).toFixed(2)}MB). Max 5MB allowed.`);
        }
        return buffer;
    }

    private async tryUploadToTheGraph(buffer: Buffer): Promise<string> {
        const boundary = '----WebKitFormBoundary7MAbn372Z8qYn8xO';
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;

        const body = Buffer.concat([
            Buffer.from(header, 'utf8'),
            buffer,
            Buffer.from(footer, 'utf8')
        ]);

        const res = await this.fetchWithTimeout('https://api.thegraph.com/ipfs/api/v0/add', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: body
        });

        if (!res.ok) throw new Error(`TheGraph IPFS HTTP ${res.status}`);
        const json = await res.json();
        if (json?.Hash) return json.Hash;
        throw new Error('Invalid TheGraph Response');
    }

    private async uploadToFreeImage(payload: string): Promise<string> {
        const body = new URLSearchParams();
        body.append('key', this.FREEIMAGE_KEY);
        body.append('action', 'upload');
        body.append('format', 'json');
        body.append('source', payload);

        const res = await this.fetchWithTimeout('https://freeimage.host/api/1/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!res.ok) throw new Error(`FreeImage HTTP ${res.status}`);
        const json = await res.json();
        if (json?.status_code === 200 && json?.image?.url) return json.image.url;
        throw new Error('Invalid FreeImage Response');
    }

    async uploadImage(imageData: string, filename: string = 'image.png'): Promise<{ ipfsUrl: string; gatewayUrl: string }> {
        const { type, payload } = this.preparePayload(imageData);
        const buffer = await this.getBuffer(type, payload);

        // Hardened Multi-try with Backoff for IPFS
        let lastError = '';
        for (let i = 0; i < 3; i++) {
            try {
                const cid = await this.tryUploadToTheGraph(buffer);
                return {
                    ipfsUrl: `ipfs://${cid}`,
                    gatewayUrl: `https://ipfs.io/ipfs/${cid}`
                };
            } catch (e: any) {
                lastError = e.message;
                console.warn(`[IPFSService] IPFS Attempt ${i + 1} failed: ${lastError}`);
                if (i < 2) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
        }

        // Failover to Web2
        console.warn(`[IPFSService] Primary IPFS failed 3 times. Failing over to Web2 fallback.`);
        const web2Url = await this.uploadToFreeImage(payload);
        const secureUrl = web2Url.replace('http://', 'https://');
        return {
            ipfsUrl: secureUrl,
            gatewayUrl: secureUrl
        };
    }

    async uploadFile(file: File): Promise<{ ipfsUrl: string; gatewayUrl: string }> {
        throw new Error("uploadFile is unsupported. Use uploadImage with Base64.");
    }
}

// Export a singleton instance
export const ipfsService = new IPFSService();
