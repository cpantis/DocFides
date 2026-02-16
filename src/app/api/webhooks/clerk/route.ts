import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, User } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    await connectToDatabase();

    switch (type) {
      case 'user.created': {
        await User.create({
          clerkId: data.id,
          email: data.email_addresses?.[0]?.email_address ?? '',
          name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || 'User',
          role: 'user',
          plan: 'free',
        });
        break;
      }
      case 'user.updated': {
        await User.findOneAndUpdate(
          { clerkId: data.id },
          {
            email: data.email_addresses?.[0]?.email_address,
            name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
          }
        );
        break;
      }
      case 'user.deleted': {
        await User.findOneAndUpdate(
          { clerkId: data.id },
          { isActive: false }
        );
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[WEBHOOK_CLERK]', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
