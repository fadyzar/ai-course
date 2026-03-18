/**
 * URL Fetch Service
 * Downloads a file from an external URL (OneDrive, Google Drive, etc.)
 * and uploads it to Supabase Storage.
 *
 * Runs server-side (Node.js) — no CORS, no Deno memory limits.
 */

import { createWriteStream, unlink as unlinkCb } from 'fs';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtFromContentType(ct: string, fallback = 'pptx'): string {
  if (ct.includes('presentationml') || ct.includes('powerpoint')) return 'pptx';
  if (ct.includes('pdf')) return 'pdf';
  if (ct.includes('wordprocessingml') || ct.includes('msword')) return 'docx';
  return fallback;
}

function encodeShareUrl(shareUrl: string): string {
  const base64 = Buffer.from(shareUrl).toString('base64');
  return 'u!' + base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Decode the ?redeem= param (base64 → short URL) */
function extractRedeemUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const redeem = parsed.searchParams.get('redeem');
    if (redeem) return Buffer.from(redeem, 'base64').toString('utf8');
  } catch { /* ignore */ }
  return null;
}

/** Follow all redirects, return final URL */
async function resolveRedirects(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA },
    });
    return resp.url || url;
  } catch {
    return url;
  }
}

// ─── Download strategies ───────────────────────────────────────────────────────

/** Strategy 1: Microsoft Graph API anonymous share download (works for business/school accounts) */
async function tryGraphApi(shareUrl: string): Promise<Response | null> {
  const encoded = encodeShareUrl(shareUrl);
  try {
    // Get metadata + downloadUrl
    const metaUrl = `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`;
    const metaResp = await fetch(metaUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    });
    logger.info({ metaUrl, status: metaResp.status }, '[URL-FETCH] Graph API driveItem response');
    if (metaResp.ok) {
      const meta = await metaResp.json() as Record<string, unknown>;
      const dlUrl = meta['@microsoft.graph.downloadUrl'] as string | undefined;
      if (dlUrl) {
        const fileResp = await fetch(dlUrl, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
        if (fileResp.ok && !(fileResp.headers.get('content-type') || '').includes('text/html')) {
          return fileResp;
        }
      }
    }
    // Fallback: /root/content
    const contentUrl = `https://graph.microsoft.com/v1.0/shares/${encoded}/root/content`;
    const contentResp = await fetch(contentUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' },
    });
    if (contentResp.ok && !(contentResp.headers.get('content-type') || '').includes('text/html')) {
      return contentResp;
    }
  } catch (e: any) {
    logger.info({ err: e.message }, '[URL-FETCH] Graph API exception');
  }
  return null;
}

/**
 * When OneDrive returns an HTML page instead of the file, extract the real download URL from the HTML.
 * Works for SPO-migrated consumer OneDrive files.
 */
async function tryExtractDownloadUrlFromHtml(htmlUrl: string): Promise<Response | null> {
  try {
    const htmlResp = await fetch(htmlUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*' },
    });
    const ct = htmlResp.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return htmlResp; // Already a file!
    if (!htmlResp.ok) { await htmlResp.body?.cancel(); return null; }

    const html = await htmlResp.text();

    // Patterns Microsoft embeds in the OneDrive download HTML page
    const patterns = [
      /"downloadUrl"\s*:\s*"(https:[^"\\]+(?:\\.[^"\\]*)*)"/,
      /"download_url"\s*:\s*"(https:[^"\\]+(?:\\.[^"\\]*)*)"/,
      /download_href['":\s]+=?\s*['"]?(https:\/\/[^'"&\s<>]+)/i,
      /"FileUrl"\s*:\s*"(https:[^"\\]+(?:\\.[^"\\]*)*)"/,
      /href="(https:\/\/[^"]*\.(?:pptx|pdf|docx|ppt)[^"]*)"/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const dlUrl = match[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\u002F/gi, '/')
          .replace(/\\\//g, '/');
        logger.info({ dlUrl }, '[URL-FETCH] Extracted download URL from OneDrive HTML');
        const fileResp = await fetch(dlUrl, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
        const fileCt = fileResp.headers.get('content-type') || '';
        if (fileResp.ok && !fileCt.includes('text/html')) return fileResp;
        await fileResp.body?.cancel();
      }
    }
  } catch (e: any) {
    logger.debug({ err: e.message }, '[URL-FETCH] HTML extraction failed');
  }
  return null;
}

/** Extract GUID from resid like "811060D19EFD38F0!s18b74523c94d46298362cc3c9bf218e0" */
function extractUniqueIdFromResid(resid: string): string | null {
  const match = resid.match(/!s([0-9a-f]{32})$/i);
  if (!match) return null;
  const h = match[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Strategy 1b: Consumer OneDrive (onedrive.live.com / 1drv.ms)
 * Handles both regular and SPO-migrated (migratedtospo=true) files.
 */
async function tryConsumerOneDriveDirectDownload(url: string): Promise<Response | null> {
  try {
    // Follow redirects — skip if we land on a login page
    const headResp = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
    const finalUrl = headResp.url || url;
    await headResp.body?.cancel();

    const isLoginPage = finalUrl.includes('login.live.com') || finalUrl.includes('login.microsoftonline.com');
    const candidates = isLoginPage ? [url] : [url, finalUrl];

    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate);
        if (parsed.hostname !== 'onedrive.live.com') continue;

        const resid = parsed.searchParams.get('resid');
        const authkey = parsed.searchParams.get('authkey');
        const eParam = parsed.searchParams.get('e');
        const migratedToSpo = parsed.searchParams.get('migratedtospo') === 'true';

        if (!resid) continue;

        // Build authkey variants
        const authkeys: string[] = [];
        if (authkey) authkeys.push(authkey);
        if (eParam) { authkeys.push(`!${eParam}`); authkeys.push(eParam); }

        // === Standard /download endpoint ===
        for (const ak of authkeys) {
          const dlUrl = `https://onedrive.live.com/download?resid=${encodeURIComponent(resid)}&authkey=${encodeURIComponent(ak)}`;
          logger.info({ dlUrl }, '[URL-FETCH] Trying OneDrive /download');
          const dlResp = await fetch(dlUrl, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
          const dlCt = dlResp.headers.get('content-type') || '';
          logger.info({ status: dlResp.status, ct: dlCt }, '[URL-FETCH] /download response');
          if (dlResp.ok && !dlCt.includes('text/html')) return dlResp;
          // If 200 HTML, Microsoft is showing a download page — try to extract the real URL from it
          if (dlResp.ok && dlCt.includes('text/html') && migratedToSpo) {
            const extracted = await tryExtractDownloadUrlFromHtml(dlUrl);
            if (extracted) return extracted;
            await dlResp.body?.cancel();
          } else {
            await dlResp.body?.cancel();
          }
        }

        // === SPO UniqueId-based download (for migratedtospo=true files) ===
        if (migratedToSpo) {
          const uniqueId = extractUniqueIdFromResid(resid);
          if (uniqueId) {
            const cid = resid.split('!')[0].toLowerCase();
            for (const ak of authkeys) {
              // Try UniqueId download endpoint
              const dlUrl = `https://onedrive.live.com/download?UniqueId=${uniqueId}&authkey=${encodeURIComponent(ak)}`;
              logger.info({ dlUrl }, '[URL-FETCH] Trying SPO UniqueId download');
              const dlResp = await fetch(dlUrl, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
              const dlCt = dlResp.headers.get('content-type') || '';
              logger.info({ status: dlResp.status, ct: dlCt }, '[URL-FETCH] UniqueId download response');
              if (dlResp.ok && !dlCt.includes('text/html')) return dlResp;
              await dlResp.body?.cancel();

              // Try SharePoint-style _layouts/15/download.aspx
              const spoUrl = `https://onedrive.live.com/personal/${cid.toUpperCase()}/_layouts/15/download.aspx?UniqueId=${uniqueId}&authkey=${encodeURIComponent(ak)}`;
              logger.info({ spoUrl }, '[URL-FETCH] Trying SPO _layouts download');
              const spoResp = await fetch(spoUrl, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
              const spoCt = spoResp.headers.get('content-type') || '';
              logger.info({ status: spoResp.status, ct: spoCt }, '[URL-FETCH] SPO _layouts response');
              if (spoResp.ok && !spoCt.includes('text/html')) return spoResp;
              await spoResp.body?.cancel();
            }
          }
        }

        // === Try original URL with &download=1 (works for some SPO-style URLs) ===
        const downloadParam = candidate.includes('?') ? `${candidate}&download=1` : `${candidate}?download=1`;
        const dp1Resp = await fetch(downloadParam, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
        const dp1Ct = dp1Resp.headers.get('content-type') || '';
        logger.info({ status: dp1Resp.status, ct: dp1Ct, url: downloadParam }, '[URL-FETCH] &download=1 on original URL');
        if (dp1Resp.ok && !dp1Ct.includes('text/html')) return dp1Resp;
        if (dp1Resp.ok && dp1Ct.includes('text/html')) {
          const extracted = await tryExtractDownloadUrlFromHtml(downloadParam);
          if (extracted) return extracted;
        }
        await dp1Resp.body?.cancel();

      } catch { /* ignore */ }
    }
  } catch (e: any) {
    logger.debug({ err: e.message }, '[URL-FETCH] Consumer OneDrive direct download failed');
  }
  return null;
}

/**
 * Strategy: SPO viewer URL + &download=1 → follow FIRST redirect manually → inject e= token.
 *
 * When &download=1 is added to a OneDrive SPO viewer URL, the server issues a 302
 * to the actual file path (e.g. /personal/CID/Documents/file.pptx?ga=1).
 * That file path + the original e= sharing token often allows direct download.
 * Also tries maintaining cookies across the redirect chain.
 */
async function tryManualRedirectWithToken(viewerUrl: string): Promise<Response | null> {
  // Extract the e= sharing token from the viewer URL
  let token = '';
  try {
    token = new URL(viewerUrl).searchParams.get('e') || '';
  } catch { /* ignore */ }

  const downloadTriggerUrl = viewerUrl.includes('?')
    ? `${viewerUrl}&download=1`
    : `${viewerUrl}?download=1`;

  // ── Walk the redirect chain manually, carrying cookies ──
  const cookies: Record<string, string> = {};
  let currentUrl = downloadTriggerUrl;
  let filePath = '';

  for (let hop = 0; hop < 8; hop++) {
    let resp: Response;
    try {
      resp = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,*/*',
          ...(Object.keys(cookies).length > 0
            ? { Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') }
            : {}),
        },
      });
    } catch { break; }

    // Harvest cookies from this response
    const setCookies = (resp.headers as any).getSetCookie?.() as string[] | undefined ?? [];
    for (const sc of setCookies) {
      const [kv] = sc.split(';');
      const eq = kv.indexOf('=');
      if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
    }

    if (resp.status >= 200 && resp.status < 300) {
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('text/html')) {
        logger.info({ hop, ct }, '[URL-FETCH] Manual redirect chain: got file');
        return resp;
      }
      await resp.body?.cancel();
      break; // HTML dead end
    }

    if (resp.status < 300 || resp.status >= 400) { await resp.body?.cancel(); break; }

    // It's a redirect
    let location = resp.headers.get('location') || '';
    await resp.body?.cancel();
    if (!location) break;
    if (location.startsWith('/')) {
      const base = new URL(currentUrl);
      location = `${base.protocol}//${base.host}${location}`;
    }
    logger.info({ hop, location: location.slice(0, 120) }, '[URL-FETCH] Manual redirect hop');

    // Stop at login pages — but first record the last non-login file path
    if (location.includes('login.live.com') || location.includes('Authenticate.aspx')) {
      // filePath was set in a prior hop — try it with token injected
      break;
    }

    // If this looks like the real file path, record it
    if (location.includes('/personal/') && !location.includes('/_layouts/') && !filePath) {
      filePath = location;
    }

    currentUrl = location;
  }

  // ── Try the discovered file path with the e= token injected ──
  if (filePath && token) {
    // Strip ga=1 noise, inject e= token
    const clean = filePath.replace(/[?&]ga=\d+/, '');
    const withToken = clean.includes('?')
      ? `${clean}&e=${encodeURIComponent(token)}`
      : `${clean}?e=${encodeURIComponent(token)}`;

    logger.info({ withToken }, '[URL-FETCH] Trying file path + e= token');
    try {
      const fileResp = await fetch(withToken, {
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
          ...(Object.keys(cookies).length > 0
            ? { Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') }
            : {}),
        },
      });
      const ct = fileResp.headers.get('content-type') || '';
      logger.info({ status: fileResp.status, ct }, '[URL-FETCH] File path + token response');
      if (fileResp.ok && !ct.includes('text/html')) return fileResp;
      await fileResp.body?.cancel();

      // Also try without the token — maybe cookies alone are enough
      if (Object.keys(cookies).length > 0) {
        const noToken = await fetch(clean, {
          redirect: 'follow',
          headers: { 'User-Agent': BROWSER_UA, Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') },
        });
        const ct2 = noToken.headers.get('content-type') || '';
        logger.info({ status: noToken.status, ct: ct2 }, '[URL-FETCH] File path + cookies-only response');
        if (noToken.ok && !ct2.includes('text/html')) return noToken;
        await noToken.body?.cancel();
      }
    } catch (e: any) {
      logger.debug({ err: e.message }, '[URL-FETCH] File path + token fetch failed');
    }
  }

  return null;
}

/** Strategy 2: Follow all redirects from the share/short URL and download the final destination */
async function tryFollowRedirects(url: string): Promise<Response | null> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/octet-stream,*/*',
      },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('text/html')) return null;
    return resp;
  } catch (e: any) {
    logger.debug({ err: e.message }, '[URL-FETCH] Follow-redirect failed');
    return null;
  }
}

/** Strategy 3: Append ?download=1 or &download=1 to the URL */
async function tryDownload1(url: string): Promise<Response | null> {
  const dlUrl = url.includes('?') ? `${url}&download=1` : `${url}?download=1`;
  return tryFollowRedirects(dlUrl);
}

// ─── Main download function ────────────────────────────────────────────────────

export interface FetchResult {
  tmpPath: string;
  contentType: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Download a file from any URL to a local temp file.
 * Handles OneDrive (consumer + business), Google Drive, and generic URLs.
 */
export async function fetchUrlToTempFile(url: string): Promise<FetchResult> {
  logger.info({ url }, '[URL-FETCH] Starting download');

  let response: Response | null = null;

  const isOneDrive =
    url.includes('onedrive.live.com') ||
    url.includes('1drv.ms') ||
    url.includes('sharepoint.com');

  if (isOneDrive) {
    // Strategy: SPO viewer URL — follow &download=1 redirect chain manually, inject e= token
    // This is the most effective approach for consumer OneDrive SPO-migrated files
    response = await tryManualRedirectWithToken(url);

    // Strategy 0: Consumer OneDrive — follow redirects, extract resid+authkey, build direct download URL
    // This handles 1drv.ms short links and onedrive.live.com share links
    if (!response) response = await tryConsumerOneDriveDirectDownload(url);

    // For consumer OneDrive — the ?redeem= param contains the real short URL
    if (!response) {
      const redeemUrl = extractRedeemUrl(url);
      if (redeemUrl) {
        logger.info({ redeemUrl }, '[URL-FETCH] Decoded redeem URL, resolving...');
        const resolved = await resolveRedirects(redeemUrl);
        logger.info({ resolved }, '[URL-FETCH] Resolved to');

        if (!response) response = await tryConsumerOneDriveDirectDownload(redeemUrl);
        if (!response) response = await tryConsumerOneDriveDirectDownload(resolved);
        if (!response) response = await tryGraphApi(resolved);
        if (!response) response = await tryGraphApi(redeemUrl);
        if (!response) response = await tryFollowRedirects(resolved);
        if (!response) response = await tryFollowRedirects(redeemUrl);
        if (!response) response = await tryDownload1(resolved);
      }
    }

    // Try with the original URL via Graph API and fallbacks
    if (!response) response = await tryGraphApi(url);
    if (!response) response = await tryFollowRedirects(url);
    if (!response) response = await tryDownload1(url);

    // Short URL (1drv.ms) — resolve first then retry
    if (!response && url.includes('1drv.ms')) {
      const resolved = await resolveRedirects(url);
      response = await tryConsumerOneDriveDirectDownload(resolved);
      if (!response) response = await tryFollowRedirects(resolved);
      if (!response) response = await tryDownload1(resolved);
    }
  } else {
    // Generic URL (Google Drive pre-signed, etc.)
    response = await tryFollowRedirects(url);
  }

  if (!response) {
    throw new Error(
      'לא ניתן להוריד את הקובץ. ודא שהקובץ משותף כ"כל מי שיש לו קישור יכול להציג" ושהקישור תקין.'
    );
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  // Extract filename
  const disposition = response.headers.get('content-disposition') || '';
  let filename = 'downloaded_file';
  const fnMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (fnMatch) filename = fnMatch[1].replace(/['"]/g, '').trim();
  if (!filename || filename === 'downloaded_file') {
    const ext = getExtFromContentType(contentType);
    filename = `onedrive_file.${ext}`;
  }
  if (!filename.includes('.')) {
    filename += '.' + getExtFromContentType(contentType);
  }

  // Stream to temp file
  const tmpPath = join(tmpdir(), `url_fetch_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const fileStream = createWriteStream(tmpPath);

  const reader = response.body!.getReader();
  let sizeBytes = 0;

  await new Promise<void>((resolve, reject) => {
    fileStream.on('error', reject);
    fileStream.on('finish', resolve);

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { fileStream.end(); break; }
          sizeBytes += value.length;
          if (!fileStream.write(value)) {
            await new Promise<void>((r) => fileStream.once('drain', r));
          }
        }
      } catch (err) {
        reject(err);
      }
    };
    pump();
  });

  if (sizeBytes === 0) {
    await unlink(tmpPath).catch(() => {});
    throw new Error('הקובץ שהורד ריק — ייתכן שהקישור לא תקין או שפג תוקפו.');
  }

  logger.info({ filename, sizeBytes, contentType }, '[URL-FETCH] Download complete');
  return { tmpPath, contentType, filename, sizeBytes };
}

// ─── Upload to Supabase + insert course_asset ──────────────────────────────────

export interface StoreFetchedFileOptions {
  courseId: string;
  tmpPath: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export async function storeFetchedFile(
  supabase: SupabaseClient,
  opts: StoreFetchedFileOptions
): Promise<{ storagePath: string; assetId: string }> {
  const { courseId, tmpPath, filename, contentType, sizeBytes } = opts;

  const ext = filename.split('.').pop()?.toLowerCase() || 'pptx';
  const sanitized = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const storagePath = `${courseId}/${Date.now()}_${sanitized}`;

  logger.info({ storagePath, sizeBytes }, '[URL-FETCH] Uploading to storage');

  const mimeMap: Record<string, string> = {
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const uploadContentType = mimeMap[ext] || contentType;

  // Stream the file directly to Supabase — avoids loading large files into memory (OOM prevention)
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const { createReadStream } = await import('fs');
  const { Readable } = await import('stream');

  const nodeStream = createReadStream(tmpPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent('course-assets')}/${storagePath}`;
  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': uploadContentType,
      'x-upsert': 'true',
    },
    body: webStream,
    // @ts-ignore — Node.js requires this for streaming request bodies
    duplex: 'half',
  });

  if (!uploadResp.ok) {
    const errBody = await uploadResp.text().catch(() => '');
    throw new Error(`שגיאה בשמירת הקובץ: ${uploadResp.status} ${errBody}`);
  }

  const { data: asset, error: assetError } = await supabase
    .from('course_assets')
    .insert({
      course_id: courseId,
      file_type: ext,
      storage_path: storagePath,
      original_name: filename,
      size_bytes: sizeBytes,
      status: 'uploaded',
    })
    .select('id')
    .single();

  if (assetError) throw new Error('שגיאה בשמירת נתוני הקובץ: ' + assetError.message);

  logger.info({ storagePath, assetId: asset.id }, '[URL-FETCH] File stored');
  return { storagePath, assetId: asset.id };
}
