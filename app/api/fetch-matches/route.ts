import { NextResponse } from 'next/server';
import axios from 'axios';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    const { authToken, startDate, endDate, source } = await request.json();

    if (!authToken) {
      return NextResponse.json({ error: 'Authorization Token is required' }, { status: 400 });
    }

    const allMatches: any[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;
    const limit = 1000;

    while (hasNextPage) {
      let url = `https://duels.ink/api/me/match-history?format=json&limit=${limit}`;
      if (startDate) url += `&from=${encodeURIComponent(startDate)}`;
      if (endDate)   url += `&to=${encodeURIComponent(endDate)}`;
      if (source)    url += `&source=${encodeURIComponent(source)}`;
      if (cursor)    url += `&cursor=${encodeURIComponent(cursor)}`;

      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${authToken}` },
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        return NextResponse.json(
          { error: `Failed to fetch history: ${response.statusText}` },
          { status: response.status }
        );
      }

      const json = response.data;
      const games = json.games || [];
      if (games.length === 0) break;

      allMatches.push(...games);
      cursor = json.next_cursor;
      if (!cursor) hasNextPage = false;

      // Small pace between pages
      await sleep(200);
    }

    return NextResponse.json({ matches: allMatches });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
