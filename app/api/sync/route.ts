import { NextResponse } from 'next/server';
import axios from 'axios';
import zlib from 'zlib';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function initializeCardStats(cardsObj: any, cardId: string) {
  cardsObj[cardId] = {
    displayName: '',
    playedWins: 0, playedTotal: 0,
    inkedWins: 0,  inkedTotal: 0,
    openingWins: 0, openingTotal: 0,
    drawnWins: 0,  drawnTotal: 0,
    notDrawnWins: 0, notDrawnTotal: 0,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { authToken, matches: preloadedMatches, filters } = body;

    if (!authToken) {
      return NextResponse.json({ error: 'Authorization Token is required' }, { status: 400 });
    }

    // Use pre-fetched matches passed from the frontend (Stage 1 result)
    const allMatches: any[] = preloadedMatches || [];

    // Filter matches using the selected dropdown values
    const activeFilterEntries = Object.entries(filters || {}).filter(
      ([_, val]) => val && String(val).trim() !== ''
    );

    const filteredMatches = allMatches.filter(match => {
      for (const [key, rawValue] of activeFilterEntries) {
        const cellValue = String(match[key] ?? '').trim().toLowerCase();
        const validValues = String(rawValue).split(',').map(v => v.trim().toLowerCase());
        if (!validValues.includes(cellValue)) return false;
      }
      return true;
    });

    // Reverse so oldest match is first — ensures Version 1 = first deck played
    const chronologicalMatches = [...filteredMatches].reverse();

    // Analytics engine — same as before
    const reportData: Record<string, any> = {};
    let processedCount = 0;
    let failedCount = 0;

    for (const match of chronologicalMatches) {
      const gameId     = match.game_id;
      const deckId     = match.your_deck_id || 'Unknown Deck';
      const rawDecklist = match.your_decklist;
      const wonGame    = String(match.result).toLowerCase().trim() === 'win';

      let playerRaw = String(match.your_player).toLowerCase().trim();
      let myPlayerNumber = 0;
      if (playerRaw.includes('1') || playerRaw === 'one') myPlayerNumber = 1;
      else if (playerRaw.includes('2') || playerRaw === 'two') myPlayerNumber = 2;
      else myPlayerNumber = Number(playerRaw) || 0;

      if (!reportData[deckId]) reportData[deckId] = {};

      let parsedDeck: any[] = [];
      try { parsedDeck = typeof rawDecklist === 'string' ? JSON.parse(rawDecklist) : rawDecklist; } catch (e) {}
      const stringifiedList = JSON.stringify(parsedDeck);

      const explicitVersions = Object.keys(reportData[deckId]);
      let versionName = explicitVersions.find(v => reportData[deckId][v].rawDecklist === stringifiedList);

      if (!versionName) {
        versionName = `Version ${explicitVersions.length + 1}`;
        reportData[deckId][versionName] = {
          rawDecklist: stringifiedList,
          firstMatchIndex: chronologicalMatches.indexOf(match),
          summary: { totalGames: 0, wins: 0, wentFirstCount: 0, parsedGames: 0, failedGames: 0, deckColors: match.your_deck_colors || '' },
          cards: {},
        };
      }

      const versionObj = reportData[deckId][versionName];
      versionObj.summary.totalGames += 1;
      if (wonGame) versionObj.summary.wins += 1;
      if (myPlayerNumber === 1) versionObj.summary.wentFirstCount += 1;

      if (!gameId) {
        versionObj.summary.failedGames += 1;
        failedCount++;
        continue;
      }

      let logResponse;
      let attempts = 0;
      let backoffDelay = 1500;
      let success = false;
      const logUrl = `https://duels.ink/g/${gameId}`;

      while (attempts < 4 && !success) {
        logResponse = await axios.get(logUrl, {
          headers: { 'Authorization': `Bearer ${authToken}` },
          responseType: 'arraybuffer',
          validateStatus: () => true,
        });

        if (logResponse.status === 429) {
          attempts++;
          await sleep(backoffDelay);
          backoffDelay *= 2;
        } else {
          success = true;
        }
      }

      if (!logResponse || logResponse.status !== 200) {
        versionObj.summary.failedGames += 1;
        failedCount++;
        continue;
      }

      try {
        const decompressedBuffer = zlib.gunzipSync(logResponse.data);
        const events = JSON.parse(decompressedBuffer.toString('utf-8'));
        const currentVersionCards = versionObj.cards;

        if (Array.isArray(parsedDeck)) {
          parsedDeck.forEach((dCard: any) => {
            if (dCard.cardId && !currentVersionCards[dCard.cardId]) {
              initializeCardStats(currentVersionCards, dCard.cardId);
            }
          });
        }

        const cardsPlayedThisGame  = new Set<string>();
        const cardsInkedThisGame   = new Set<string>();
        const openingHandThisGame  = new Set<string>();
        const drawnThisGame        = new Set<string>();

        events.forEach((event: any) => {
          if (event.undone === true) return;
          const eventPlayer = event.player !== null && event.player !== undefined ? Number(event.player) : null;

          if (eventPlayer === myPlayerNumber && event.data) {
            const cardId = event.data.cardId;

            if (event.type === 'INITIAL_HAND' && event.data.initialHandCards) {
              event.data.initialHandCards.forEach((c: any) => {
                if (c.id) {
                  const cid = String(c.id).trim();
                  openingHandThisGame.add(cid);
                  if (!currentVersionCards[cid]) initializeCardStats(currentVersionCards, cid);
                  if (c.name) currentVersionCards[cid].displayName = c.name;
                }
              });
            }

            if (event.type === 'MULLIGAN') {
              event.data.mulliganedCards?.forEach((c: any) => {
                if (c.id) openingHandThisGame.delete(String(c.id).trim());
              });
              event.data.drawnCards?.forEach((c: any) => {
                if (c.id) {
                  const cid = String(c.id).trim();
                  openingHandThisGame.add(cid);
                  if (!currentVersionCards[cid]) initializeCardStats(currentVersionCards, cid);
                  if (c.name) currentVersionCards[cid].displayName = c.name;
                }
              });
            }

            if (event.type === 'CARD_DRAWN'  && cardId) drawnThisGame.add(String(cardId).trim());
            if (event.type === 'CARD_PLAYED' && cardId) cardsPlayedThisGame.add(String(cardId).trim());
            if (event.type === 'CARD_INKED'  && cardId) cardsInkedThisGame.add(String(cardId).trim());

            if (event.data.cardName && cardId) {
              if (!currentVersionCards[cardId]) initializeCardStats(currentVersionCards, cardId);
              currentVersionCards[cardId].displayName = event.data.cardName;
            }
          }
        });

        const allDrawnThisGame = new Set([...openingHandThisGame, ...drawnThisGame]);

        openingHandThisGame.forEach(cardId => {
          if (!currentVersionCards[cardId]) initializeCardStats(currentVersionCards, cardId);
          currentVersionCards[cardId].openingTotal += 1;
          if (wonGame) currentVersionCards[cardId].openingWins += 1;
        });

        allDrawnThisGame.forEach(cardId => {
          if (!currentVersionCards[cardId]) initializeCardStats(currentVersionCards, cardId);
          currentVersionCards[cardId].drawnTotal += 1;
          if (wonGame) currentVersionCards[cardId].drawnWins += 1;
        });

        cardsPlayedThisGame.forEach(cardId => {
          if (!currentVersionCards[cardId]) initializeCardStats(currentVersionCards, cardId);
          currentVersionCards[cardId].playedTotal += 1;
          if (wonGame) currentVersionCards[cardId].playedWins += 1;
        });

        cardsInkedThisGame.forEach(cardId => {
          if (!currentVersionCards[cardId]) initializeCardStats(currentVersionCards, cardId);
          currentVersionCards[cardId].inkedTotal += 1;
          if (wonGame) currentVersionCards[cardId].inkedWins += 1;
        });

        for (const cardId in currentVersionCards) {
          if (!allDrawnThisGame.has(cardId)) {
            currentVersionCards[cardId].notDrawnTotal += 1;
            if (wonGame) currentVersionCards[cardId].notDrawnWins += 1;
          }
        }

        versionObj.summary.parsedGames += 1;
        processedCount++;
        await sleep(250);

      } catch (err) {
        versionObj.summary.failedGames += 1;
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalFetched: allMatches.length,
        totalFiltered: filteredMatches.length,
        processedCount,
        failedCount,
      },
      reportData,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
