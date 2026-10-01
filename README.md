<p align="center">
  <h1 align="center">⚡ Wibufy API</h1>
  <p align="center">
    <b>High-Performance Anime & Manga Aggregator API</b><br>
    Built with Fastify, Consumet Extensions, HLS/CORS Stream Proxy, and Real-Time Gemini AI Subtitle Translation.
  </p>
  <p align="center">
    <i>Maintained & Developed by <b>prstyaDev</b></i>
  </p>
  <p align="center">
    <a href="#fitur-utama">Fitur Utama</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#environment-variables">Environment Variables</a> •
    <a href="#dokumentasi-endpoint">Dokumentasi API</a> •
    <a href="#ai-subtitle-translation">AI Subtitles</a> •
    <a href="#arsitektur--proxy">Arsitektur Proxy</a>
  </p>
</p>

---

## 🚀 Sekilas Tentang Wibufy API

**Wibufy API** (`wibufy-api`) adalah layanan backend mandiri (*self-hosted*) yang menggabungkan berbagai sumber data anime dan manga ke dalam satu REST API terpadu berbasis metadata AniList. 

Dilengkapi dengan:
1. **Built-in HLS & Subtitle Reverse Proxy**: Menyuntikkan header `Referer`/`Origin`, bypass CORS, re-write manifest playlist `.m3u8`, serta TLS/JA3 impersonation agar video dapat diputar langsung di browser atau aplikasi pemutar video (ExoPlayer, AVPlayer, Video.js, dll).
2. **AI Subtitle Translation Engine**: Otomatis mendeteksi subtitle bahasa Inggris (`.vtt`, `.srt`, `.ass`), membersihkan tag Aegisub, dan menerjemahkannya ke **Bahasa Indonesia alami** secara instan menggunakan Google Gemini AI dengan sistem cache permanen di disk.

---

## ✨ Fitur Utama

- **Multi-Source Aggregation**: Mendukung banyak provider anime (ReAnime, AnimeNoSub, AniNeko, Gogoanime, AnimePahe, Senshi, dll) dan provider manga (MangaDex).
- **Metadata Terstandarisasi via AniList GraphQL**: Pencarian universal menggunakan ID AniList, mencocokkan judul, sinonim, serta verifikasi jumlah episode/season.
- **Smart Multi-Server Extraction**: Endpoint `/watch` mengembalikan semua server yang tersedia (baik sub maupun dub) dengan server rekomendasi di urutan pertama.
- **AI Subtitle Translation (ID)**: 
  - Model: Google Gemini (`gemini-flash-lite-latest` / `gemini-2.5-flash`).
  - Pembersihan otomatis format `.ass` / `.srt` ke `.vtt` standar.
  - Disk Caching berbasis SHA-256: Terjemahan pertama diproses dalam 3–5 detik, pemutaran berikutnya langsung dimuat dalam **< 15 ms**.
- **Stream Proxy & Anti-Scraping Bypass**:
  - Dukungan `curl-impersonate` untuk menembus proteksi Cloudflare JA3 fingerprinting.
  - Terintegrasi dengan Byparr (FlareSolverr headless browser) untuk provider dengan Managed Challenge (AnimePahe & Mkissa).
- **Proteksi & Keamanan**:
  - SSRF Guard (`assertUrlSafe`) untuk mencegah eksploitasi URL internal/private network.
  - Multi-tier in-memory rate limiting per-IP.

---

## 🛠️ Tech Stack

- **Runtime & Framework**: Node.js (ESM), Fastify
- **Scraper Engine**: `@consumet/extensions` (TypeScript, compiled to CommonJS)
- **AI Engine**: `@google/genai` (Google Gemini AI Studio)
- **Bypass & Proxy**: Native Fetch, `curl-impersonate` (Chrome 124 TLS mimic), Byparr/FlareSolverr
- **Subtitles & Media**: WebVTT, ASS/SSA Parser, HLS manifest rewriter

---

## 📦 Quick Start (Panduan Instalasi)

### 1. Prasyarat
- Node.js v20+ atau v22+
- npm / pnpm
- *Opsional*: `curl-impersonate` untuk provider dengan TLS-fingerprint (seperti FlixCloud/ReAnime).

### 2. Clone & Setup Library Consumet
```bash
git clone https://github.com/prstyo46/wibufy-api.git
cd wibufy-api

# Compile modul library scraper
cd consumet
npm install
npm run build
cd ..
```

### 3. Setup Backend Fastify
```bash
cd api
npm install

# Buat file konfigurasi environment
cp .env.example .env
```

Isi konfigurasi minimal pada `.env`:
```env
PORT=3000
PUBLIC_URL=https://api.wibufy.biz.id
GEMINI_API_KEY=AIzaSy...your-gemini-api-key
```

### 4. Menjalankan Server
```bash
# Mode development
npm run dev

# Atau menggunakan PM2 (Production di VPS)
pm2 start src/server.mjs --name wibufy-api
```

---

## ⚙️ Environment Variables

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port listen server Fastify. |
| `PUBLIC_URL` | *(Wajib di VPS)* | Origin domain publik (misal `https://api.wibufy.biz.id`). Dibutuhkan untuk menyusun link proxy video & subtitle. |
| `GEMINI_API_KEY` | *(Opsional)* | API Key dari Google AI Studio untuk mengaktifkan fitur translate subtitle Bahasa Indonesia. |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | Model Gemini utama. Dilengkapi auto-fallback ke `gemini-3.5-flash-lite` dan `gemini-3.8-flash`. |
| `SUBTITLE_CACHE_DIR` | `./cache/subtitles` | Lokasi folder penyimpanan cache file WebVTT hasil terjemahan AI. |
| `CURL_IMPERSONATE_BIN` | *(unset)* | Path ke binary `curl-impersonate` untuk bypass Cloudflare JA3 handshake. |
| `CURL_IMPERSONATE_ARGS` | *(empty)* | Argumen impersonate tambahan, misal: `--impersonate chrome124`. |
| `BYPARR_URL` | `http://flaresolverr:8191` | Alamat instance Byparr untuk bypass Cloudflare Turnstile (AnimePahe). |
| `API_KEY` | *(unset)* | Jika diisi, endpoint data wajib menyertakan header `x-api-key` atau `Authorization: Bearer <key>`. |
| `RATE_LIMIT_WATCH` | `30` | Batas request per menit untuk endpoint `/watch`. |
| `RATE_LIMIT_PROXY` | `600` | Batas request per menit untuk segmen video `/proxy`. |

---

## 📖 Dokumentasi Endpoint API

Base URL: `https://api.wibufy.biz.id` (atau `http://localhost:3000` saat lokal).

### 1. Health & Server Info
- **Route**: `GET /`
- **Contoh Response**:
```json
{
  "name": "wibufy-api",
  "by": "prstyaDev",
  "status": "ok",
  "providers": ["ReAnime", "AnimeNoSub", "AniNeko", "Gogoanime", "AnimePahe"],
  "mangaProviders": ["MangaDex"],
  "routes": {
    "search": "/search?q=<title>",
    "info": "/info/:anilistId",
    "episodes": "/episodes/:anilistId?provider=<name>",
    "watch": "/watch?provider=<name>&episodeId=<id>",
    "subtitles": "/subtitles/translate?url=<vtt-url>",
    "mangaSearch": "/manga/search?q=<title>"
  }
}
```

---

### 2. Cari Anime (AniList)
- **Route**: `GET /search?q=:query&page=1`
- **Deskripsi**: Mencari judul anime langsung dari database AniList GraphQL.
- **Contoh Response**:
```json
{
  "currentPage": 1,
  "hasNextPage": true,
  "results": [
    {
      "id": "21",
      "title": {
        "romaji": "ONE PIECE",
        "english": "ONE PIECE"
      },
      "coverImage": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/...",
      "status": "RELEASING",
      "episodes": 1180
    }
  ]
}
```

---

### 3. Detail & Mapping Provider
- **Route**: `GET /info/:anilistId`
- **Deskripsi**: Mengambil metadata lengkap serta daftar provider yang menyediakan anime tersebut.

---

### 4. Daftar Episode
- **Route**: `GET /episodes/:anilistId?provider=:provider`
- **Contoh Request**: `/episodes/21?provider=ReAnime`
- **Response**:
```json
[
  {
    "id": "21/1",
    "number": 1,
    "title": "I'm Luffy! The Man Who Will Become the Pirate King!",
    "isFiller": false
  },
  {
    "id": "21/2",
    "number": 2,
    "title": "Enter the Great Swordsman! Pirate Hunter Roronoa Zoro!",
    "isFiller": false
  }
]
```
> **Catatan**: Format `episodeId` berbeda di tiap provider. Gunakan ID yang dikembalikan dari endpoint ini saat memanggil endpoint `/watch`.

---

### 5. Streaming Video & Subtitle (`/watch`)
- **Route**: `GET /watch?provider=:provider&episodeId=:episodeId`
- **Contoh Request**: `/watch?provider=ReAnime&episodeId=21%2F1180`
- **Response**:
```json
{
  "sub": [
    {
      "sources": [
        {
          "quality": "auto",
          "url": "https://api.wibufy.biz.id/proxy?url=https%3A%2F%2Fvault-95.rundowncdn.top%2F...master.m3u8&ref=https%3A%2F%2Fflixcloud.cc%2F"
        }
      ],
      "subtitles": [
        {
          "lang": "English",
          "url": "https://api.wibufy.biz.id/proxy?url=https%3A%2F%2Fvault-95.rundowncdn.top%2F...eng_2.ass&ref=https%3A%2F%2Fflixcloud.cc%2F",
          "rawUrl": "https://vault-95.rundowncdn.top/...eng_2.ass"
        },
        {
          "lang": "Indonesian (AI)",
          "url": "https://api.wibufy.biz.id/subtitles/translate?url=https%3A%2F%2Fvault-95.rundowncdn.top%2F...eng_2.ass&ref=https%3A%2F%2Fflixcloud.cc%2F",
          "rawUrl": "https://vault-95.rundowncdn.top/...eng_2.ass"
        }
      ],
      "headers": {
        "Referer": "https://flixcloud.cc/"
      }
    }
  ],
  "dub": []
}
```

---

### 6. AI Subtitle Translation (`/subtitles/translate`)
- **Route**: `GET /subtitles/translate?url=:subtitleUrl&ref=:referer`
- **Deskripsi**: Mengambil subtitle sumber (`.vtt`, `.srt`, atau `.ass`), melakukan normalisasi format ke WebVTT standar, menerjemahkannya ke Bahasa Indonesia menggunakan Google Gemini, dan menyimpannya ke disk cache.
- **Output**: File teks murni berformat `text/vtt; charset=utf-8` yang langsung siap digunakan oleh HTML5 `<track>` atau mobile player (ExoPlayer).

```vtt
WEBVTT

1
00:00:15.200 --> 00:00:17.500
Aku adalah Luffy! Orang yang akan menjadi Raja Bajak Laut!

2
00:00:18.100 --> 00:00:20.900
Jika menyerah sekarang, impian kita akan berakhir di sini!
```

---

### 7. Manga Endpoints
- `GET /manga/search?q=:title` - Cari manga via MangaDex
- `GET /manga/info/:mangaId` - Detail manga & list chapter
- `GET /manga/read/:chapterId` - List gambar halaman chapter
- `GET /manga/image?url=:imageUrl` - Proxy gambar manga dengan caching & CORS

---

## 🧠 Cara Kerja AI Subtitle Engine

```
[Sumber Video Provider]
        │
  (File Subtitle: .ass / .vtt / .srt)
        ▼
[/subtitles/translate] 
        │
        ├──> Cek Cache Disk (`./cache/subtitles/<SHA256>.vtt`)
        │       ├── [HIT]  --> Langsung kirim respons (< 15ms) ⚡
        │       └── [MISS] ──┐
        │                    ▼
        │             Normalisasi Subtitle:
        │             - Strip style Aegisub `{\pos...}`, font, warna
        │             - Validasi struktur WebVTT & timestamp
        │                    │
        │                    ▼
        │             Google Gemini API:
        │             - Menggunakan Prompt Anime Dialog Localization
        │             - Terjemahan kontekstual, luwes, dan natural
        │                    │
        │                    ▼
        │             Simpan ke Cache Disk & Kirim ke Client
```

---

## 🔒 Keamanan & Lisensi

- **Edukasi & Riset**: Project ini dibuat untuk tujuan edukasi dan pengembangan API aggregator. Server **tidak menyimpan, menghosting, atau mendistribusikan** file media video apa pun di server sendiri.
- **Lisensi**: GNU General Public License v3.0 ([GPL-3.0](./LICENSE)).
