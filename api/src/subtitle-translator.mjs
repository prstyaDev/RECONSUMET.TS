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
 * Normalizes subtitle text to ensure valid WebVTT format before translation.
 */
function normalizeToVtt(text) {
  let content = text.trim();
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
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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

  log.info?.({ model }, 'Translating subtitle using Gemini...');
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  let translated = (response.text || '').trim();

  // Strip accidental markdown codeblocks if model returned them
  if (translated.startsWith('```')) {
    translated = translated.replace(/^```(?:vtt)?\r?\n/, '').replace(/\r?\n```\s*$/, '').trim();
  }

  // Ensure header remains intact
  if (!translated.startsWith('WEBVTT')) {
    translated = `WEBVTT\n\n${translated}`;
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
