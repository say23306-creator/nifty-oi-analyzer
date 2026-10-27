// =============================================================================
// lib/ai/gemini.ts — Free Institutional AI Analysis Engine powered by Google Gemini
// =============================================================================
// Integrates Google Gemini API (gemini-3.8-flash / gemini-3.5-flash) on the 100% free tier.
// Strictly applies the Price x Open Interest interpretation matrix from the user's reference chart:
//   - CE: Long Buildup (Bullish/Bullish), Long Covering (Str. Bearish/Str. Bearish),
//         Short Buildup (Bearish/Bearish), Short Covering (Str. Bullish/Str. Bullish)
//   - PE: Long Buildup (Bullish/Bearish), Long Covering (Str. Bearish/Str. Bullish),
//         Short Buildup (Bearish/Bullish), Short Covering (Str. Bullish/Str. Bearish)
// =============================================================================

import { GoogleGenAI } from '@google/genai';
import { interpretAll, aggregateEquityBias } from '../analysis/interpretation';
import { getSetting, setSetting } from '../db/queries';
import { logger } from '../utils/logger';
import type { AnalysisResult } from '../analysis/types';

export interface AiMarketAnalysis {
  timestamp: string;
  expiry: string;
  spot: number;
  bias: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
  confidence: number; // 0 - 100
  headline: string;
  summary: string;
  institutionalFlows: {
    callWriters: string;
    putWriters: string;
    dominantAction: string;
  };
  keyLevels: {
    support1: number;
    support2: number;
    pivot: number;
    resistance1: number;
    resistance2: number;
    maxPain: number;
  };
  strikeObservations: Array<{
    strike: number;
    optionType: 'CE' | 'PE';
    observation: string;
    stockView: string;
    reasoning: string;
  }>;
  strategyRecommendation: {
    name: string;
    outlook: string;
    setup: string;
    riskReward: string;
  };
  invalidationLevel: number;
  riskNotice: string;
  source: 'gemini' | 'rules_engine_fallback';
}

const SETTING_KEY = 'latest_ai_analysis';
let _inMemoryAiAnalysis: AiMarketAnalysis | null = null;

/**
 * Get the latest cached AI analysis from DB, memory, or disk
 */
export async function getLatestAiAnalysis(): Promise<AiMarketAnalysis | null> {
  if (process.env.DATABASE_URL) {
    try {
      const raw = await getSetting(SETTING_KEY);
      if (raw) return JSON.parse(raw) as AiMarketAnalysis;
    } catch (err) {
      logger.warn('[ai/gemini] Failed to read latest AI analysis from DB', { error: String(err) });
    }
  }

  // Memory cache fallback
  if (_inMemoryAiAnalysis) {
    return _inMemoryAiAnalysis;
  }

  // File cache fallback
  try {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'scraper', 'ai_analysis.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      _inMemoryAiAnalysis = JSON.parse(content) as AiMarketAnalysis;
      return _inMemoryAiAnalysis;
    }
  } catch {
    // Ignore file read error
  }

  return null;
}

/**
 * Save an AI analysis to DB, memory, and disk cache
 */
export async function saveAiAnalysis(analysis: AiMarketAnalysis): Promise<void> {
  _inMemoryAiAnalysis = analysis;

  if (process.env.DATABASE_URL) {
    try {
      await setSetting(SETTING_KEY, JSON.stringify(analysis));
    } catch (err) {
      logger.warn('[ai/gemini] Failed to save AI analysis to DB', { error: String(err) });
    }
  }

  try {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'scraper', 'ai_analysis.json');
    fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2), 'utf-8');
  } catch {
    // Ignore file write error
  }
}

/**
 * Generate a comprehensive AI market analysis based on live option chain data
 * and the user's specific interpretation matrix.
 */
export async function generateAiAnalysis(
  analysis: AnalysisResult,
  options?: { forceFresh?: boolean }
): Promise<AiMarketAnalysis> {
  const { spot, expiry, pcr, maxPain, support, resistance, buildups } = analysis;

  // Check if we already have a recent analysis (within 10 minutes) unless forced
  if (!options?.forceFresh) {
    const existing = await getLatestAiAnalysis();
    if (existing && existing.expiry === expiry) {
      const ageMs = Date.now() - new Date(existing.timestamp).getTime();
      if (ageMs < 10 * 60 * 1000) {
        return existing;
      }
    }
  }

  // Interpret buildups using the chart rules
  const interpreted = interpretAll(buildups);
  const aggBias = aggregateEquityBias(interpreted);

  // Take top CE & PE buildups by OI magnitude for AI prompt
  const topCe = interpreted
    .filter((s) => s.optionType === 'CE')
    .sort((a, b) => Math.abs(b.oiChangeAbs) - Math.abs(a.oiChangeAbs))
    .slice(0, 5);

  const topPe = interpreted
    .filter((s) => s.optionType === 'PE')
    .sort((a, b) => Math.abs(b.oiChangeAbs) - Math.abs(a.oiChangeAbs))
    .slice(0, 5);

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.warn('[ai/gemini] GEMINI_API_KEY not configured — using deterministic rule engine');
    const fallback = generateDeterministicAnalysis(analysis, interpreted, aggBias);
    await saveAiAnalysis(fallback);
    return fallback;
  }

  // Prompt crafting
  const prompt = `You are a Chief Derivatives Strategist analyzing institutional Open Interest (OI) on the Indian Nifty 50 Index.
Analyze the following live option chain snapshot and provide an institutional-grade intraday trading analysis.

### CORE REFERENCE RULES (CRITICAL):
You MUST follow this exact matrix for interpreting option price vs OI changes:

1. CALL OPTION (CE) — Option View == Stock/Equity View:
- Price UP, OI UP    -> Long Build Up  -> Option: BULLISH | Stock/Equity: BULLISH (Fresh call buyers entering)
- Price DOWN, OI DOWN -> Long Covering  -> Option: STRONG BEARISH | Stock/Equity: STRONG BEARISH (Longs unwinding/profit booking)
- Price DOWN, OI UP  -> Short Build Up -> Option: BEARISH | Stock/Equity: BEARISH (Call writers building resistance)
- Price UP, OI DOWN  -> Short Covering -> Option: STRONG BULLISH | Stock/Equity: STRONG BULLISH (Call writers covering shorts)

2. PUT OPTION (PE) — Option View is INVERTED for Stock/Equity:
- Price UP, OI UP    -> Long Build Up  -> Option: BULLISH | Stock/Equity: BEARISH (Put buyers expecting downside)
- Price DOWN, OI DOWN -> Long Covering  -> Option: STRONG BEARISH | Stock/Equity: STRONG BULLISH (Put buyers taking profit, downside pressure easing)
- Price DOWN, OI UP  -> Short Build Up -> Option: BEARISH | Stock/Equity: BULLISH (Put writers establishing support floor)
- Price UP, OI DOWN  -> Short Covering -> Option: STRONG BULLISH | Stock/Equity: STRONG BEARISH (Put writers panicking/covering, support broken)

### LIVE MARKET DATA:
- NIFTY 50 Spot Price: ${spot.toFixed(2)}
- Expiry Date: ${expiry}
- Put-Call Ratio (OI PCR): ${pcr.oi.toFixed(2)} (${pcr.oi > 1.2 ? 'Bullish' : pcr.oi < 0.8 ? 'Bearish' : 'Neutral'})
- PCR Trend (Change): ${pcr.oiChange >= 0 ? '+' : ''}${pcr.oiChange.toFixed(2)}
- Volume PCR: ${pcr.volume.toFixed(2)}
- Max Pain Strike: ${maxPain}
- Key Put Support Strikes (Highest PE OI): ${support.map((s) => `${s.strike} (OI: ${s.oi.toLocaleString('en-IN')})`).join(', ') || 'N/A'}
- Key Call Resistance Strikes (Highest CE OI): ${resistance.map((r) => `${r.strike} (OI: ${r.oi.toLocaleString('en-IN')})`).join(', ') || 'N/A'}

### TOP RECENT BUILD-UP SIGNALS:
CALLS (CE):
${topCe.map((c) => `- ${c.strike} CE: Price ${c.ltpChangePct >= 0 ? '+' : ''}${c.ltpChangePct}%, OI ${c.oiChangePct >= 0 ? '+' : ''}${c.oiChangePct}% (${c.oiChangeAbs > 0 ? '+' : ''}${c.oiChangeAbs.toLocaleString('en-IN')}) => ${c.observation} [Equity View: ${c.equityView}]`).join('\n') || 'No major CE buildups'}

PUTS (PE):
${topPe.map((p) => `- ${p.strike} PE: Price ${p.ltpChangePct >= 0 ? '+' : ''}${p.ltpChangePct}%, OI ${p.oiChangePct >= 0 ? '+' : ''}${p.oiChangePct}% (${p.oiChangeAbs > 0 ? '+' : ''}${p.oiChangeAbs.toLocaleString('en-IN')}) => ${p.observation} [Equity View: ${p.equityView}]`).join('\n') || 'No major PE buildups'}

Rules Engine Net Bias: ${aggBias.label} (Net Score: ${aggBias.netBullishScore})

### REQUIRED JSON OUTPUT FORMAT:
Respond with ONLY valid JSON adhering strictly to this schema:
{
  "bias": "STRONG_BULLISH" | "BULLISH" | "NEUTRAL" | "BEARISH" | "STRONG_BEARISH",
  "confidence": <integer 50-95>,
  "headline": "<1 concise, impactful headline sentence summarizing market pulse>",
  "summary": "<2-3 brief paragraphs analyzing institutional positioning, PCR shifts, and battleground strikes>",
  "institutionalFlows": {
    "callWriters": "<what call writers are doing at resistance>",
    "putWriters": "<what put writers are doing at support>",
    "dominantAction": "<who controls current market momentum>"
  },
  "keyLevels": {
    "support1": <number>,
    "support2": <number>,
    "pivot": <number>,
    "resistance1": <number>,
    "resistance2": <number>,
    "maxPain": ${maxPain}
  },
  "strikeObservations": [
    {
      "strike": <number>,
      "optionType": "CE" | "PE",
      "observation": "<e.g. Short Build Up>",
      "stockView": "<e.g. BULLISH / BEARISH>",
      "reasoning": "<1 sentence explanation using price/OI matrix>"
    }
  ],
  "strategyRecommendation": {
    "name": "<e.g. Bull Put Spread / Bear Call Spread / Long Straddle / Iron Condor>",
    "outlook": "<1 sentence outlook>",
    "setup": "<Specific strikes recommendation>",
    "riskReward": "<Favorable / 1:2 / Defined risk>"
  },
  "invalidationLevel": <number: spot price where this bias becomes invalid>,
  "riskNotice": "<1 sentence note on volatility or upcoming events>"
}`;

  try {
    let rawText = '';

    // Direct REST API with timeout for maximum speed & stability
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      } else {
        logger.warn('[ai/gemini] gemini-2.5-flash failed with status ' + res.status);
      }
    } catch (fetchErr) {
      logger.warn('[ai/gemini] Fetch call failed', { error: String(fetchErr) });
    }

    if (!rawText) {
      throw new Error('Empty response received from Gemini API');
    }

    // Clean any accidental markdown codeblock fences if present
    const cleanJson = rawText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleanJson);

    const result: AiMarketAnalysis = {
      timestamp: new Date().toISOString(),
      expiry,
      spot,
      bias: parsed.bias || aggBias.label,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 75,
      headline: parsed.headline || `Nifty 50 ${parsed.bias || aggBias.label} bias with PCR at ${pcr.oi.toFixed(2)}`,
      summary: parsed.summary || 'Institutional flow analysis completed.',
      institutionalFlows: parsed.institutionalFlows || {
        callWriters: 'Active resistance build-up',
        putWriters: 'Defending key support strikes',
        dominantAction: 'Balanced flows',
      },
      keyLevels: {
        support1: parsed.keyLevels?.support1 ?? support[0]?.strike ?? spot - 150,
        support2: parsed.keyLevels?.support2 ?? support[1]?.strike ?? spot - 250,
        pivot: parsed.keyLevels?.pivot ?? Math.round(spot / 50) * 50,
        resistance1: parsed.keyLevels?.resistance1 ?? resistance[0]?.strike ?? spot + 150,
        resistance2: parsed.keyLevels?.resistance2 ?? resistance[1]?.strike ?? spot + 250,
        maxPain,
      },
      strikeObservations: Array.isArray(parsed.strikeObservations) ? parsed.strikeObservations : [],
      strategyRecommendation: parsed.strategyRecommendation || {
        name: 'Defined Risk Spread',
        outlook: 'Trade with the dominant trend',
        setup: `Key pivot around ${spot.toFixed(0)}`,
        riskReward: 'Defined Risk',
      },
      invalidationLevel: parsed.invalidationLevel ?? (aggBias.label.includes('BULL') ? spot - 100 : spot + 100),
      riskNotice: parsed.riskNotice || 'Market conditions change dynamically with incoming institutional orders.',
      source: 'gemini',
    };

    await saveAiAnalysis(result);
    return result;

  } catch (err) {
    logger.error('[ai/gemini] AI generation failed, using rule-based fallback', err);
    const fallback = generateDeterministicAnalysis(analysis, interpreted, aggBias);
    await saveAiAnalysis(fallback);
    return fallback;
  }
}

/**
 * Deterministic institutional analysis fallback when API key is missing or offline
 */
function generateDeterministicAnalysis(
  analysis: AnalysisResult,
  interpreted: ReturnType<typeof interpretAll>,
  aggBias: ReturnType<typeof aggregateEquityBias>
): AiMarketAnalysis {
  const { spot, expiry, pcr, maxPain, support, resistance } = analysis;

  const sup1 = support[0]?.strike ?? Math.floor(spot / 100) * 100;
  const sup2 = support[1]?.strike ?? sup1 - 100;
  const res1 = resistance[0]?.strike ?? Math.ceil(spot / 100) * 100;
  const res2 = resistance[1]?.strike ?? res1 + 100;
  const pivot = Math.round(spot / 50) * 50;

  const bias = aggBias.label;
  const isBull = bias === 'STRONG_BULLISH' || bias === 'BULLISH';
  const isBear = bias === 'STRONG_BEARISH' || bias === 'BEARISH';

  const headline = isBull
    ? `Bullish institutional momentum driven by PE Short Buildup and rising PCR (${pcr.oi.toFixed(2)})`
    : isBear
    ? `Bearish bias as CE writers build heavy resistance above ${res1} with falling PCR (${pcr.oi.toFixed(2)})`
    : `Consolidation range expected between ${sup1} support and ${res1} resistance (PCR ${pcr.oi.toFixed(2)})`;

  const topStrikes = interpreted.slice(0, 4).map((s) => ({
    strike: s.strike,
    optionType: s.optionType,
    observation: s.observation,
    stockView: s.equityView,
    reasoning:
      s.optionType === 'CE'
        ? `${s.observation} on ${s.strike} CE: price ${s.priceUp ? '↑' : '↓'}, OI ${s.oiUp ? '↑' : '↓'} indicates ${s.equityView} equity sentiment.`
        : `${s.observation} on ${s.strike} PE: price ${s.priceUp ? '↑' : '↓'}, OI ${s.oiUp ? '↑' : '↓'} maps to inverted ${s.equityView} equity view.`,
  }));

  return {
    timestamp: new Date().toISOString(),
    expiry,
    spot,
    bias,
    confidence: isBull || isBear ? 75 : 60,
    headline,
    summary: `Nifty 50 is currently trading near ${spot.toFixed(2)}. Open Interest distribution shows primary support anchored at ${sup1} (PE OI concentration) and immediate overhead resistance at ${res1} (CE OI concentration). The current Put-Call Ratio of ${pcr.oi.toFixed(2)} confirms ${bias.toLowerCase()} market participation. Max Pain is pegged at ${maxPain}, suggesting potential expiry gravitation towards this strike.`,
    institutionalFlows: {
      callWriters: isBear ? `Aggressive writing at ${res1}` : `Cautious/unwinding shorts at ATM`,
      putWriters: isBull ? `Dominant put writing at ${sup1} creating firm floor` : `Liquidating longs/stepping back`,
      dominantAction: isBull ? 'Put Writers (Bulls)' : isBear ? 'Call Writers (Bears)' : 'Range Arbitrageurs',
    },
    keyLevels: {
      support1: sup1,
      support2: sup2,
      pivot,
      resistance1: res1,
      resistance2: res2,
      maxPain,
    },
    strikeObservations: topStrikes,
    strategyRecommendation: isBull
      ? {
          name: 'Bull Put Spread',
          outlook: 'Mild to strong bullish continuation',
          setup: `Sell ${sup1} PE / Buy ${sup2} PE for credit`,
          riskReward: 'Defined Risk (1:2.5)',
        }
      : isBear
      ? {
          name: 'Bear Call Spread',
          outlook: 'Downside continuation or rally-selling',
          setup: `Sell ${res1} CE / Buy ${res2} CE for credit`,
          riskReward: 'Defined Risk (1:2.5)',
        }
      : {
          name: 'Iron Condor / Range Bound',
          outlook: 'Market expected to trade within range',
          setup: `Sell ${sup1} PE & Sell ${res1} CE with protective wings`,
          riskReward: 'Defined Risk (1:3)',
        },
    invalidationLevel: isBull ? sup1 - 50 : res1 + 50,
    riskNotice: 'Always maintain strict stop losses. Informational derivatives analysis only.',
    source: 'rules_engine_fallback',
  };
}
