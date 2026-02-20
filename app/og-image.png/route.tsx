import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0052FF',
          backgroundImage: 'linear-gradient(135deg, #0052FF 0%, #1a73e8 100%)',
        }}
      >
        {/* Icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 120,
            height: 120,
            backgroundColor: 'white',
            borderRadius: 24,
            marginBottom: 24,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0052FF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        
        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: 48,
            fontWeight: 'bold',
            color: 'white',
            marginBottom: 8,
          }}
        >
          UMKM Terminal
        </div>
        
        {/* Subtitle */}
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            color: 'rgba(255,255,255,0.8)',
          }}
        >
          Deploy tokens on Base Network
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 800,
    }
  );
}
