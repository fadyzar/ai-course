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
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function buildDirectDownloadUrl(url: string): { downloadUrl: string; filename: string } {
  const gdriveDriveId = extractGoogleDriveId(url);

  if (gdriveDriveId) {
    return {
      downloadUrl: `https://drive.google.com/uc?export=download&id=${gdriveDriveId}`,
      filename: `google_drive_file_${gdriveDriveId}.pdf`,
    };
  }

  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1] || "file";
  return {
    downloadUrl: url,
    filename: lastPart.includes(".") ? lastPart : `${lastPart}.pdf`,
  };
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: course } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .maybeSingle();

    if (!course) throw new Error("Course not found");
    if (course.owner_id !== user.id) throw new Error("Unauthorized");

    const { downloadUrl, filename } = buildDirectDownloadUrl(url);

    console.log(`[FETCH-EXTERNAL] Downloading from: ${downloadUrl}`);

    const fileResp = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Slide2Course/1.0)",
      },
      redirect: "follow",
    });

    if (!fileResp.ok) {
      throw new Error(`לא ניתן להוריד את הקובץ (${fileResp.status}). ודא שהקובץ ציבורי.`);
    }

    const contentType = fileResp.headers.get("content-type") || "application/octet-stream";
    const buffer = await fileResp.arrayBuffer();

    if (buffer.byteLength === 0) {
      throw new Error("הקובץ שהורד ריק. ודא שהקישור נכון ושהקובץ ציבורי.");
    }

    console.log(`[FETCH-EXTERNAL] Downloaded ${buffer.byteLength} bytes, content-type: ${contentType}`);

    let ext = "pdf";
    if (contentType.includes("presentation") || filename.endsWith(".pptx")) ext = "pptx";
    else if (contentType.includes("pdf") || filename.endsWith(".pdf")) ext = "pdf";
    else if (contentType.includes("wordprocessing") || filename.endsWith(".docx")) ext = "docx";
    else if (filename.includes(".")) ext = filename.split(".").pop()!;

    const sanitizedName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storagePath = `${courseId}/${Date.now()}_${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from("course-assets")
      .upload(storagePath, buffer, { contentType });

    if (uploadError) throw new Error("שגיאה בשמירת הקובץ: " + uploadError.message);

    const { error: assetError } = await supabase
      .from("course_assets")
      .insert({
        course_id: courseId,
        file_type: ext,
        storage_path: storagePath,
        original_name: filename,
        size_bytes: buffer.byteLength,
        status: "uploaded",
      });

    if (assetError) throw new Error("שגיאה בשמירת נתוני הקובץ: " + assetError.message);

    return new Response(
      JSON.stringify({ success: true, storagePath, filename, size: buffer.byteLength }),
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
