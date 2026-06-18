import { NextResponse } from 'next/server';

const FIREBASE_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
const GC_API = 'https://api.golfchamps.net';

export async function GET() {
  try {
    const configRes = await fetch(`${FIREBASE_URL}/golfchamps.json`, {
      cache: 'no-store',
    });
    const config = await configRes.json();

    if (!config?.leaderboardId || !config?.token) {
      return NextResponse.json({ error: 'not_configured' }, { status: 404 });
    }

    const headers = {
      Authorization: config.token,
      'Content-Type': 'application/json',
    };

    const gcRes = await fetch(
      `${GC_API}/leaderboards/show/${config.leaderboardId}?numUsers=1000000`,
      { headers, cache: 'no-store' }
    );

    if (!gcRes.ok) {
      return NextResponse.json(
        { error: `golfchamps_${gcRes.status}` },
        { status: gcRes.status }
      );
    }

    const participants = await gcRes.json();

    // Fetch picks for all participants in parallel
    const withPicks = await Promise.all(
      participants.map(async (p) => {
        try {
          const entriesRes = await fetch(
            `${GC_API}/entries?userId=${p.id}`,
            { headers, cache: 'no-store' }
          );
          const picks = entriesRes.ok ? await entriesRes.json() : [];
          return { ...p, picks };
        } catch {
          return { ...p, picks: [] };
        }
      })
    );

    return NextResponse.json({
      participants: withPicks,
      tournamentName: config.tournamentName || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
