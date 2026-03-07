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

async function tryFetchDirect(url: string): Promise<Response | null> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/octet-stream,application/vnd.openxmlformats-officedocument.presentationml.presentation,*/*",
  };

  try {
    const resp = await fetch(url, { headers, redirect: "follow" });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null;
    return resp;
  } catch {
    return null;
  }
}

async function tryOneDriveApiDownload(shareUrl: string): Promise<Response | null> {
  const candidates: string[] = [shareUrl];

  try {
    const urlObj = new URL(shareUrl);
    const redeemParam = urlObj.searchParams.get("redeem");
    if (redeemParam) {
      try {
        const decoded = atob(redeemParam.replace(/-/g, "+").replace(/_/g, "/"));
        if (decoded.startsWith("http")) candidates.unshift(decoded);
      } catch { /* ignore */ }
    }

    const withDownload = new URL(shareUrl);
    withDownload.searchParams.set("download", "1");
    candidates.push(withDownload.toString());
  } catch { /* ignore */ }

  for (const candidate of candidates) {
    try {
      const encoded = encodeOneDriveShareUrl(candidate);
      const apiUrl = `https://api.onedrive.com/v1.0/shares/${encoded}/root/content`;
      console.log(`[FETCH-EXTERNAL] Trying OneDrive API: ${apiUrl}`);

      const resp = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*",
        },
        redirect: "follow",
      });

      if (resp.ok) {
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("text/html")) {
          console.log(`[FETCH-EXTERNAL] OneDrive API succeeded for candidate`);
          return resp;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function downloadOneDriveFile(url: string): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  let resp: Response | null = null;

  console.log(`[FETCH-EXTERNAL] Trying direct download first`);
  resp = await tryFetchDirect(url);

  if (!resp && (url.includes("onedrive.live.com") || url.includes("1drv.ms"))) {
    console.log(`[FETCH-EXTERNAL] Trying OneDrive share API`);
    resp = await tryOneDriveApiDownload(url);
  }

  if (!resp) {
    console.log(`[FETCH-EXTERNAL] Trying direct fetch with follow redirects`);
    resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
      redirect: "follow",
    });
  }

  if (!resp.ok) {
    throw new Error(`OneDrive החזיר שגיאה ${resp.status}. ודא שהקובץ ציבורי ושהקישור תקין.`);
  }

  const contentType = resp.headers.get("content-type") || "application/octet-stream";

  if (contentType.includes("text/html")) {
    const html = await resp.text();
    if (html.includes("login.microsoftonline") || html.includes("login.live") || html.includes("Sign in") || html.includes("signin")) {
      throw new Error("OneDrive דורש כניסה לחשבון. יש להפוך את הקובץ לציבורי (כל מי שיש לו קישור יכול להציג).");
    }
    const downloadLinkMatch = html.match(/"downloadUrl"\s*:\s*"([^"]+)"/);
    if (downloadLinkMatch) {
      console.log(`[FETCH-EXTERNAL] Found download URL in HTML response`);
      const directResp = await fetch(downloadLinkMatch[1], { redirect: "follow" });
      if (directResp.ok) {
        const directCt = directResp.headers.get("content-type") || "application/octet-stream";
        if (!directCt.includes("text/html")) {
          const buffer = await directResp.arrayBuffer();
          const contentDisposition = directResp.headers.get("content-disposition") || "";
          let filename = "onedrive_file";
          const fnMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (fnMatch) filename = fnMatch[1].replace(/['"]/g, "").trim();
          return { buffer, contentType: directCt, filename };
        }
      }
    }
    throw new Error("OneDrive החזיר עמוד HTML במקום קובץ. ודא שהקובץ ציבורי.");
  }

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
