import { NextResponse } from 'next/server';
import { getRecentDeliveryDiagnostics } from '@/lib/delivery-diagnostics';

export async function GET() {
  try {
    const diagnostics = getRecentDeliveryDiagnostics();
    return NextResponse.json({
      success: true,
      count: diagnostics.length,
      diagnostics
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
