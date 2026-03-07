import { NextResponse } from 'next/server';
import { listSkills } from '@/services/skills/skillService';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const skills = listSkills();
    return NextResponse.json({ success: true, data: skills });
  } catch (error) {
    console.error('[API /skills] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list skills' },
      { status: 500 }
    );
  }
}
