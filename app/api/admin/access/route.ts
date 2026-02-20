import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminSecret,
  getAccessCodes,
  generateAccessCode,
} from '@/lib/access-control';

// GET - List all access codes (admin only)
export async function GET(request: NextRequest) {
  try {
    const adminSecret = request.headers.get('x-admin-secret');
    
    if (!adminSecret || !verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const codes = getAccessCodes();
    
    // Return codes without exposing the actual code values in full
    const safeCodes = codes.map(c => ({
      code: c.code.slice(0, 4) + '****',
      fullCode: c.code, // Only visible to admin
      label: c.label,
      isActive: c.isActive,
      usageCount: c.usageCount,
      maxUsage: c.maxUsage,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    }));
    
    return NextResponse.json({ codes: safeCodes });
  } catch (error) {
    console.error('Admin access list error:', error);
    return NextResponse.json({ error: 'Failed to list access codes' }, { status: 500 });
  }
}

// POST - Generate new access code (admin only)
export async function POST(request: NextRequest) {
  try {
    const adminSecret = request.headers.get('x-admin-secret');
    
    if (!adminSecret || !verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { label, maxUsage, expiryDays, length = 8 } = body;
    
    // Generate a new code
    const newCode = generateAccessCode(length);
    
    // In a real implementation, you would save this to a database
    // For now, we return the code for the admin to add to ACCESS_CODES env var
    const envFormat = `${newCode}:${label || 'New Code'}:${maxUsage || ''}:${expiryDays || ''}`;
    
    return NextResponse.json({
      success: true,
      code: newCode,
      label: label || 'New Code',
      maxUsage: maxUsage || null,
      expiryDays: expiryDays || null,
      envFormat,
      instructions: 'Add this to your ACCESS_CODES environment variable',
    });
  } catch (error) {
    console.error('Admin access create error:', error);
    return NextResponse.json({ error: 'Failed to create access code' }, { status: 500 });
  }
}
