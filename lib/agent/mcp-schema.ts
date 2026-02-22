/**
 * MCP Tool Definitions for Clanker Agent
 */
export const MCP_TOOLS = [
    {
        name: 'deploy_token',
        description: 'Deploy a new token on the Base network using Clanker.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The name of the token' },
                symbol: { type: 'string', description: 'The token symbol (e.g., CLANK)' },
                image: { type: 'string', description: 'URL of the token image' },
                feeType: {
                    type: 'string',
                    enum: ['dynamic', 'static', 'degen', 'low'],
                    description: 'Fee strategy for the token pool'
                },
                devBuyEth: {
                    type: 'number',
                    description: 'Amount of ETH to buy on launch (optional)'
                }
            },
            required: ['name', 'symbol', 'image']
        }
    },
    {
        name: 'get_wallet',
        description: 'Get the current connected wallet address and balance.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'launch_bankr',
        description: 'Launch a token using the Bankr x402 protocol (Agent-managed autonomous trading pool).',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The name of the token' },
                symbol: { type: 'string', description: 'The token symbol (e.g., CLANK)' },
                image: { type: 'string', description: 'URL of the token image' },
                description: { type: 'string', description: 'Description shown on the platform' },
                launcher: { type: 'string', description: 'X or Farcaster handle of the launcher (e.g., @vitalik)' },
                dashboardFee: { type: 'string', description: 'Display handle for the fee recipient' },
                taxType: { type: 'string', enum: ['dynamic', 'static'], description: 'Trading tax type' },
                taxPercentage: { type: 'number', description: 'Tax percentage if static (0-90)' },
                rewardRecipient: { type: 'string', description: 'EVM Address to receive actual fees' }
            },
            required: ['name', 'symbol', 'launcher', 'dashboardFee']
        }
    },
    {
        name: 'get_deployments',
        description: 'Get the user\'s past token deployments (from both Clanker and local history).',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max number of records to return' }
            }
        }
    },
    {
        name: 'upload_image',
        description: 'Upload an image via base64 or URL to IPFS. Returns the ipfs:// CID required for token deployment.',
        inputSchema: {
            type: 'object',
            properties: {
                imageData: { type: 'string', description: 'Base64 encoded image string OR a direct public URL to an image.' },
                filename: { type: 'string', description: 'Optional filename for the uploaded image (e.g. logo.png)' }
            },
            required: ['imageData']
        }
    }
];
