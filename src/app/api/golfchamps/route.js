import { NextResponse } from 'next/server';

const FIREBASE_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

export async function GET() {
  try {
    const configRes = await fetch(`${FIREBASE_URL}/golfchamps.json`, {
      cache: 'no-store',
    });
    const config = await configRes.json();

    if (!config?.leaderboardId || !config?.token) {
      return NextResponse.json({ error: 'not_configured' }, { status: 404 });
    }

    const gcRes = await fetch(
      `https://api.golfchamps.net/leaderboards/show/${config.leaderboardId}?numUsers=1000000`,
      {
        headers: {
          Authorization: config.token,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!gcRes.ok) {
      return NextResponse.json(
        { error: `golfchamps_${gcRes.status}` },
        { status: gcRes.status }
      );
    }

    const participants = await gcRes.json();
    return NextResponse.json({
      participants,
      tournamentName: config.tournamentName || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
