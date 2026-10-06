export interface SubtitleCue {
  id?: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

export function parseTimestampToSeconds(timeStr: string): number {
  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return parseFloat(clean) || 0;
}

export function parseVttOrSrt(content: string): SubtitleCue[] {
  if (!content) return [];

  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const cues: SubtitleCue[] = [];

  const timeRegex = /((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{2,3})/;

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;

    let timeLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (timeRegex.test(lines[i])) {
        timeLineIndex = i;
        break;
      }
    }

    if (timeLineIndex !== -1) {
      const match = lines[timeLineIndex].match(timeRegex);
      if (match) {
        const start = parseTimestampToSeconds(match[1]);
        const end = parseTimestampToSeconds(match[2]);
        const textLines = lines.slice(timeLineIndex + 1);
        // Clean inline formatting tags like <c>, <b>, <i>, <v ...>
        const text = textLines
          .join('\n')
          .replace(/<[^>]+>/g, '')
          .trim();

        if (text && end > start) {
          cues.push({ start, end, text });
        }
      }
    }
  }

  return cues;
}

export async function loadSubtitles(src: string): Promise<SubtitleCue[]> {
  if (!src) return [];

  try {
    if (src.startsWith('data:text/vtt') || src.startsWith('data:text/plain')) {
      const commaIdx = src.indexOf(',');
      if (commaIdx !== -1) {
        const raw = src.substring(commaIdx + 1);
        const decoded = decodeURIComponent(raw);
        return parseVttOrSrt(decoded);
      }
    }

    if (src.startsWith('WEBVTT') || src.includes('-->')) {
      return parseVttOrSrt(src);
    }

    // Otherwise fetch via HTTP / local path
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return parseVttOrSrt(text);
  } catch (err) {
    console.warn('Failed to load subtitles from:', src, err);
    return [];
  }
}
