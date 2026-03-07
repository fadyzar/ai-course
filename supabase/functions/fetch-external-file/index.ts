import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function extractGoogleDriveId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isOneDriveUrl(url: string): boolean {
  return url.includes("onedrive.live.com") || url.includes("1drv.ms") || url.includes("sharepoint.com");
}

function encodeOneDriveShareUrl(shareUrl: string): string {
  const base64 = btoa(shareUrl);
  return "u!" + base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function extractOneDriveRedeemUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const redeem = parsed.searchParams.get("redeem");
    if (redeem) {
      const decoded = atob(redeem);
      console.log(`[FETCH-EXTERNAL] Decoded redeem URL: ${decoded}`);
      return decoded;
    }
  } catch {
  }
  return null;
}

function buildOneDriveDownloadUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "onedrive.live.com") {
      const pathParts = parsed.pathname.split("/");
      const resid = parsed.searchParams.get("resid") || parsed.searchParams.get("id");
      const authkey = parsed.searchParams.get("authkey") || parsed.searchParams.get("ithint");
      if (resid) {
        return `https://onedrive.live.com/download?resid=${resid}&authkey=${authkey || ""}`;
      }
      const personalIdx = pathParts.indexOf("personal");
      if (personalIdx !== -1 && pathParts.length > personalIdx + 2) {
        const cid = pathParts[personalIdx + 1];
        const itemId = pathParts[pathParts.length - 1];
        return `https://onedrive.live.com/download?cid=${cid}&resid=${itemId}&authkey=`;
      }
    }
  } catch {
  }
  return null;
}

async function resolveShortUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });
    return resp.url || url;
  } catch {
    return url;
  }
}

async function tryGraphApiDownload(shareUrl: string): Promise<Response | null> {
  const encoded = encodeOneDriveShareUrl(shareUrl);

  const metaUrl = `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`;
  console.log(`[FETCH-EXTERNAL] Trying Graph API meta: ${metaUrl}`);

  try {
    const metaResp = await fetch(metaUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (metaResp.ok) {
      const meta = await metaResp.json();
      const downloadUrl = meta["@microsoft.graph.downloadUrl"];
      if (downloadUrl) {
        console.log(`[FETCH-EXTERNAL] Got downloadUrl from Graph API metadata`);
        const fileResp = await fetch(downloadUrl, { redirect: "follow" });
        if (fileResp.ok) {
          const ct = fileResp.headers.get("content-type") || "";
          if (!ct.includes("text/html")) return fileResp;
        }
      }
    } else {
      console.log(`[FETCH-EXTERNAL] Graph API meta returned ${metaResp.status}`);
    }
  } catch (e) {
    console.log(`[FETCH-EXTERNAL] Graph API meta failed: ${e}`);
  }

  const contentUrl = `https://graph.microsoft.com/v1.0/shares/${encoded}/root/content`;
  console.log(`[FETCH-EXTERNAL] Trying Graph API content: ${contentUrl}`);

  try {
    const contentResp = await fetch(contentUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
      redirect: "follow",
    });

    if (contentResp.ok) {
      const ct = contentResp.headers.get("content-type") || "";
      if (!ct.includes("text/html")) {
        console.log(`[FETCH-EXTERNAL] Graph API content succeeded`);
        return contentResp;
      }
    }
  } catch (e) {
    console.log(`[FETCH-EXTERNAL] Graph API content failed: ${e}`);
  }

  return null;
}

async function tryOneDriveLegacyApi(shareUrl: string): Promise<Response | null> {
  const encoded = encodeOneDriveShareUrl(shareUrl);
  const apiUrl = `https://api.onedrive.com/v1.0/shares/${encoded}/root/content`;
  console.log(`[FETCH-EXTERNAL] Trying legacy OneDrive API: ${apiUrl}`);

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
      redirect: "follow",
    });

    if (resp.ok) {
      const ct = resp.headers.get("content-type") || "";
      if (!ct.includes("text/html")) return resp;
    }
  } catch {
    return null;
  }
  return null;
}

async function tryDirectDownload(url: string): Promise<Response | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/octet-stream,*/*",
      },
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null;
    return resp;
  } catch {
    return null;
  }
}

async function extractFileFromResponse(resp: Response): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  const contentType = resp.headers.get("content-type") || "application/octet-stream";
  const contentDisposition = resp.headers.get("content-disposition") || "";
  let filename = "onedrive_file";
  const fnMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (fnMatch) filename = fnMatch[1].replace(/['"]/g, "").trim();
  const buffer = await resp.arrayBuffer();
  return { buffer, contentType, filename };
}

async function tryOneDriveResidDownload(resolvedUrl: string): Promise<Response | null> {
  try {
    const parsed = new URL(resolvedUrl);
    const resid = parsed.searchParams.get("resid");
    const authkey = parsed.searchParams.get("authkey");
    const cid = parsed.searchParams.get("cid");
    if (resid) {
      const downloadUrl = `https://onedrive.live.com/download?resid=${encodeURIComponent(resid)}&authkey=${encodeURIComponent(authkey || "")}&cid=${encodeURIComponent(cid || "")}`;
      console.log(`[FETCH-EXTERNAL] Trying resid download URL: ${downloadUrl}`);
      return await tryDirectDownload(downloadUrl);
    }
  } catch {
  }
  return null;
}

async function downloadOneDriveFile(url: string): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  let resolvedUrl = url;

  const redeemShortUrl = extractOneDriveRedeemUrl(url);
  if (redeemShortUrl) {
    console.log(`[FETCH-EXTERNAL] Found redeem short URL: ${redeemShortUrl}, resolving...`);
    const resolvedRedeemUrl = await resolveShortUrl(redeemShortUrl);
    console.log(`[FETCH-EXTERNAL] Resolved redeem URL to: ${resolvedRedeemUrl}`);

    let resp = await tryGraphApiDownload(resolvedRedeemUrl);
    if (resp) return await extractFileFromResponse(resp);

    resp = await tryGraphApiDownload(redeemShortUrl);
    if (resp) return await extractFileFromResponse(resp);

    resp = await tryOneDriveResidDownload(resolvedRedeemUrl);
    if (resp) return await extractFileFromResponse(resp);

    resp = await tryOneDriveLegacyApi(resolvedRedeemUrl);
    if (resp) return await extractFileFromResponse(resp);

    resp = await tryOneDriveLegacyApi(redeemShortUrl);
    if (resp) return await extractFileFromResponse(resp);
  }

  if (url.includes("1drv.ms")) {
    console.log(`[FETCH-EXTERNAL] Resolving short URL: ${url}`);
    resolvedUrl = await resolveShortUrl(url);
    console.log(`[FETCH-EXTERNAL] Resolved to: ${resolvedUrl}`);
  }

  console.log(`[FETCH-EXTERNAL] Trying Graph API first`);
  let resp = await tryGraphApiDownload(resolvedUrl);

  if (!resp && resolvedUrl !== url) {
    console.log(`[FETCH-EXTERNAL] Trying Graph API with original short URL`);
    resp = await tryGraphApiDownload(url);
  }

  if (!resp) {
    console.log(`[FETCH-EXTERNAL] Trying legacy OneDrive API`);
    resp = await tryOneDriveLegacyApi(resolvedUrl);
  }

  if (!resp) {
    const directDownloadUrl = buildOneDriveDownloadUrl(resolvedUrl);
    if (directDownloadUrl) {
      console.log(`[FETCH-EXTERNAL] Trying built direct download URL: ${directDownloadUrl}`);
      resp = await tryDirectDownload(directDownloadUrl);
    }
  }

  if (!resp) {
    console.log(`[FETCH-EXTERNAL] Trying direct download`);
    resp = await tryDirectDownload(resolvedUrl);
  }

  if (!resp) {
    throw new Error("לא ניתן להוריד את הקובץ מ-OneDrive. ודא שהקובץ משותף כ'כל מי שיש לו קישור יכול להציג' ושהקישור תקין.");
  }

  const contentType = resp.headers.get("content-type") || "application/octet-stream";
  const contentDisposition = resp.headers.get("content-disposition") || "";
  let filename = "onedrive_file";
  const fnMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (fnMatch) {
    filename = fnMatch[1].replace(/['"]/g, "").trim();
  }

  const buffer = await resp.arrayBuffer();
  return { buffer, contentType, filename };
}

function isGoogleSheetsUrl(url: string): boolean {
  return url.includes("/spreadsheets/d/");
}

function isGoogleDocsUrl(url: string): boolean {
  return url.includes("/document/d/");
}

function isGoogleSlidesUrl(url: string): boolean {
  return url.includes("/presentation/d/");
}

async function downloadGoogleSheetsFile(fileId: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
  console.log(`[FETCH-EXTERNAL] Downloading Google Sheets as XLSX: ${fileId}`);

  const resp = await fetch(exportUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (text.includes("accounts.google.com") || text.includes("Sign in") || resp.status === 302 || resp.status === 401) {
      throw new Error("Google Sheets דורש כניסה לחשבון. יש להפוך את הגיליון לציבורי (כל מי שיש לו קישור יכול להציג).");
    }
    throw new Error(`Google Sheets החזיר שגיאה ${resp.status}. ודא שהגיליון ציבורי.`);
  }

  const contentType = resp.headers.get("content-type") || "application/octet-stream";
  if (contentType.includes("text/html")) {
    const html = await resp.text();
    if (html.includes("accounts.google.com") || html.includes("Sign in")) {
      throw new Error("Google Sheets דורש כניסה לחשבון. יש להפוך את הגיליון לציבורי (כל מי שיש לו קישור יכול להציג).");
    }
    throw new Error("Google Sheets החזיר עמוד HTML במקום קובץ. ודא שהגדרת שיתוף ל'כל מי שיש לו קישור'.");
  }

  const buffer = await resp.arrayBuffer();
  return { buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

async function downloadGoogleSlidesFile(fileId: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const exportUrl = `https://docs.google.com/presentation/d/${fileId}/export/pptx`;
  console.log(`[FETCH-EXTERNAL] Downloading Google Slides as PPTX: ${fileId}`);

  const resp = await fetch(exportUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (text.includes("accounts.google.com") || text.includes("Sign in") || resp.status === 401) {
      throw new Error("Google Slides דורש כניסה לחשבון. יש להפוך את המצגת לציבורית (כל מי שיש לו קישור יכול להציג).");
    }
    throw new Error(`Google Slides החזיר שגיאה ${resp.status}. ודא שהמצגת ציבורית.`);
  }

  const contentType = resp.headers.get("content-type") || "application/octet-stream";
  if (contentType.includes("text/html")) {
    throw new Error("Google Slides החזיר עמוד HTML במקום קובץ. ודא שהגדרת שיתוף ל'כל מי שיש לו קישור'.");
  }

  const buffer = await resp.arrayBuffer();
  return { buffer, contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
}

async function downloadGoogleDriveFile(fileId: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;

  console.log(`[FETCH-EXTERNAL] Trying drive.usercontent.google.com for id=${fileId}`);

  const resp = await fetch(downloadUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/octet-stream,*/*",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`Google Drive החזיר שגיאה ${resp.status}. ודא שהקובץ ציבורי.`);
  }

  const contentType = resp.headers.get("content-type") || "application/octet-stream";

  if (contentType.includes("text/html")) {
    const html = await resp.text();

    const confirmMatch = html.match(/confirm=([0-9A-Za-z_\-]+)/);
    const uuidMatch = html.match(/uuid=([0-9A-Za-z_\-]+)/);

    if (confirmMatch || uuidMatch) {
      const confirm = confirmMatch ? confirmMatch[1] : "t";
      const uuid = uuidMatch ? uuidMatch[1] : "";

      let retryUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirm}`;
      if (uuid) retryUrl += `&uuid=${uuid}`;

      console.log(`[FETCH-EXTERNAL] Got confirmation page, retrying with confirm token`);

      const retryResp = await fetch(retryUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/octet-stream,*/*",
        },
        redirect: "follow",
      });

      if (!retryResp.ok) {
        throw new Error(`שגיאה בהורדה לאחר אישור: ${retryResp.status}`);
      }

      const retryType = retryResp.headers.get("content-type") || "application/octet-stream";
      if (retryType.includes("text/html")) {
        throw new Error("Google Drive דורש כניסה לחשבון. יש להפוך את הקובץ לציבורי (כל מי שיש לו קישור).");
      }

      const buffer = await retryResp.arrayBuffer();
      return { buffer, contentType: retryType };
    }

    if (html.includes("accounts.google.com") || html.includes("Sign in")) {
      throw new Error("Google Drive דורש כניסה לחשבון. יש להפוך את הקובץ לציבורי (כל מי שיש לו קישור יכול להציג).");
    }

    throw new Error("Google Drive החזיר עמוד HTML במקום קובץ. ודא שהגדרת שיתוף ל'כל מי שיש לו קישור'.");
  }

  const buffer = await resp.arrayBuffer();
  return { buffer, contentType };
}

function getExtFromContentType(contentType: string, filename: string): string {
  if (contentType.includes("presentationml") || contentType.includes("powerpoint")) return "pptx";
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("wordprocessingml") || contentType.includes("msword")) return "docx";
  if (contentType.includes("spreadsheetml") || contentType.includes("excel")) return "xlsx";
  if (filename.includes(".")) return filename.split(".").pop()!.toLowerCase();
  return "pdf";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization");

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { courseId, url } = await req.json();
    if (!courseId || !url) throw new Error("Missing courseId or url");

    console.log(`[FETCH-EXTERNAL] Raw URL received: ${url}`);
    console.log(`[FETCH-EXTERNAL] isOneDrive check: ${isOneDriveUrl(url)}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: course } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .maybeSingle();

    if (!course) throw new Error("Course not found");
    if (course.owner_id !== user.id) throw new Error("Unauthorized");

    let buffer: ArrayBuffer;
    let contentType: string;
    let baseFilename: string;

    const normalizedUrl = url.trim();

    if (isOneDriveUrl(normalizedUrl)) {
      console.log(`[FETCH-EXTERNAL] Detected OneDrive URL`);
      const result = await downloadOneDriveFile(normalizedUrl);
      buffer = result.buffer;
      contentType = result.contentType;
      baseFilename = result.filename || "onedrive_file";
    } else {
      const fileId = extractGoogleDriveId(normalizedUrl);
      if (!fileId) {
        throw new Error("לא ניתן לזהות את סוג הקישור. נתמכים: Google Drive, Google Slides, Google Sheets, OneDrive. ודא שהקישור תקין ושהקובץ ציבורי.");
      }

      console.log(`[FETCH-EXTERNAL] Google Drive file ID: ${fileId}`);

      if (isGoogleSheetsUrl(normalizedUrl)) {
        ({ buffer, contentType } = await downloadGoogleSheetsFile(fileId));
      } else if (isGoogleSlidesUrl(normalizedUrl)) {
        ({ buffer, contentType } = await downloadGoogleSlidesFile(fileId));
      } else {
        ({ buffer, contentType } = await downloadGoogleDriveFile(fileId));
      }
      baseFilename = `google_drive_${fileId}`;
    }

    if (buffer.byteLength === 0) {
      throw new Error("הקובץ שהורד ריק.");
    }

    console.log(`[FETCH-EXTERNAL] Downloaded ${buffer.byteLength} bytes, content-type: ${contentType}`);

    const ext = getExtFromContentType(contentType, baseFilename);
    const finalFilename = baseFilename.includes(".") ? baseFilename : `${baseFilename}.${ext}`;

    const mimeMap: Record<string, string> = {
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const uploadContentType = mimeMap[ext] || contentType;

    const storagePath = `${courseId}/${Date.now()}_${finalFilename}`;

    const { error: uploadError } = await supabase.storage
      .from("course-assets")
      .upload(storagePath, buffer, { contentType: uploadContentType });

    if (uploadError) throw new Error("שגיאה בשמירת הקובץ: " + uploadError.message);

    const { error: assetError } = await supabase
      .from("course_assets")
      .insert({
        course_id: courseId,
        file_type: ext,
        storage_path: storagePath,
        original_name: finalFilename,
        size_bytes: buffer.byteLength,
        status: "uploaded",
      });

    if (assetError) throw new Error("שגיאה בשמירת נתוני הקובץ: " + assetError.message);

    return new Response(
      JSON.stringify({ success: true, storagePath, filename: finalFilename, size: buffer.byteLength }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[FETCH-EXTERNAL] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
