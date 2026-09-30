import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

const CACHE_DIR = path.resolve(process.env.SUBTITLE_CACHE_DIR || './cache/subtitles');

// Lazy-initialize the Gemini client so the server doesn't crash on startup if GEMINI_API_KEY is not set.
let aiClient = null;

function getAI() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not configured on the server.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // Directory already exists or cannot be created
  }
}

/**
 * Converts Advanced SubStation Alpha (.ass) format to WebVTT cues.
 */
function assToVtt(assText) {
  const lines = assText.split(/\r?\n/);
  const vttCues = ['WEBVTT\n'];
  let inEvents = false;
  let formatFields = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[Events]') {
      inEvents = true;
      continue;
    }
    if (inEvents && trimmed.startsWith('Format:')) {
      formatFields = trimmed.substring(7).split(',').map(s => s.trim().toLowerCase());
      continue;
    }
    if (inEvents && trimmed.startsWith('Dialogue:')) {
      const parts = trimmed.substring(9).split(',');
      const textIndex = formatFields.indexOf('text');
      const startIndex = formatFields.indexOf('start');
      const endIndex = formatFields.indexOf('end');

      const start = parts[startIndex]?.trim();
      const end = parts[endIndex]?.trim();
      const rawText = parts.slice(textIndex !== -1 ? textIndex : 9).join(',');

      // Remove ASS style tags like {\pos(1,2)}, {\i1}, \N
      const cleanText = rawText.replace(/\{[^}]+\}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, '\n').trim();
      if (!cleanText) continue;

      const fmtTime = (t) => {
        if (!t) return '00:00:00.000';
        const [h, m, s] = t.split(':');
        const [sec, ms] = (s || '0.0').split('.');
        const hh = (h || '0').padStart(2, '0');
        const mm = (m || '0').padStart(2, '0');
        const ss = (sec || '0').padStart(2, '0');
        const mss = (ms || '0').padEnd(3, '0').slice(0, 3);
        return `${hh}:${mm}:${ss}.${mss}`;
      };

      vttCues.push(`${fmtTime(start)} --> ${fmtTime(end)}\n${cleanText}\n`);
    }
  }
  return vttCues.join('\n');
}

/**
 * Normalizes subtitle text to ensure valid WebVTT format before translation.
 */
function normalizeToVtt(text) {
  let content = text.trim();
  // If it is ASS / SSA format
  if (content.includes('[Events]') && content.includes('Dialogue:')) {
    return assToVtt(content);
  }
  // If it is SRT format (commas instead of periods in timestamp, no WEBVTT header)
  if (!content.startsWith('WEBVTT')) {
    // Replace comma in timestamps: 00:01:20,123 --> 00:01:23,456
    content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    content = `WEBVTT\n\n${content}`;
  }
  return content;
}

/**
 * Translates WebVTT content from English to natural Indonesian using Gemini.
 */
export async function translateVtt(rawSubText, log = console) {
  const ai = getAI();
  const vttInput = normalizeToVtt(rawSubText);

  const prompt = `You are a professional anime subtitle translator.
Translate the following WebVTT subtitle from English into natural, fluent, and conversational Indonesian (Bahasa Indonesia santai, ekspresif, dan luwes untuk dialog anime).

CRITICAL INSTRUCTIONS:
1. DO NOT alter, reformat, reorder, or delete ANY timestamps, cue numbers, or WEBVTT headers (e.g., "00:01:23.456 --> 00:01:25.789", "WEBVTT"). All timestamps and identifiers MUST remain 100% exact and identical.
2. Only translate the dialogue and caption text into Indonesian.
3. Keep Japanese honorifics, titles, and common anime terms natural (e.g., -kun, -san, -chan, -senpai, -sensei, jutsu, nakama, baka).
4. Return ONLY the raw WebVTT content. Do NOT wrap in markdown codeblocks (no \`\`\`vtt or \`\`\`), and do NOT add any conversational explanation or preamble.

WebVTT Input:
${vttInput}`;

  // Candidate models in priority order with graceful fallback if Google servers experience high demand (503)
  const candidateModels = Array.from(new Set([
    process.env.GEMINI_MODEL,
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
  ])).filter(Boolean);

  let lastError = null;
  let response = null;

  for (const model of candidateModels) {
    try {
      log.info?.({ model }, 'Translating subtitle using Gemini...');
      response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      if (response?.text) break;
    } catch (err) {
      log.warn?.({ model, err: err.message }, 'Gemini model unavailable or high demand, trying next candidate...');
      lastError = err;
    }
  }

  if (!response?.text) {
    throw lastError || new Error('All Gemini candidate models failed to respond.');
  }

  let translated = (response.text || '').trim();

  // Strip accidental markdown codeblocks if model returned them
  if (translated.includes('```')) {
    translated = translated.replace(/```(?:vtt)?/g, '').replace(/```/g, '').trim();
  }

  // Ensure header remains intact and remove any model preamble before WEBVTT
  const vttIndex = translated.indexOf('WEBVTT');
  if (vttIndex !== -1) {
    translated = translated.substring(vttIndex);
  } else {
    const arrowIndex = translated.search(/\d{2}:\d{2}/);
    if (arrowIndex !== -1) {
      translated = `WEBVTT\n\n${translated.substring(arrowIndex)}`;
    } else {
      translated = `WEBVTT\n\n${translated}`;
    }
  }

  return translated;
}

/**
 * Checks if a cached translation exists for the given URL.
 */
export async function getCachedSubtitle(url) {
  await ensureCacheDir();
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  const filePath = path.join(CACHE_DIR, `${hash}.vtt`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { cached: true, content, filePath };
  } catch {
    return { cached: false, filePath };
  }
}

/**
 * Writes the translated subtitle to disk cache.
 */
export async function saveCachedSubtitle(filePath, content) {
  try {
    await fs.writeFile(filePath, content, 'utf8');
  } catch (err) {
    console.error('[Subtitle Cache] Failed to write file:', err.message);
  }
}
