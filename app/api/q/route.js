
export const runtime = "nodejs";
export const maxDuration = 30;

function response(data, status = 200) {
  return Response.json(data, { status });
}

// Test endpoint
export async function GET() {
  return response({
    status: "online",
    service: "RunningHub QR Receiver"
  });
}

// Image upload endpoint
export async function POST(request) {
  try {
    const url = new URL(request.url);

    // Authenticate using URL token
    if (
      !process.env.UPLOAD_TOKEN ||
      url.searchParams.get("token") !== process.env.UPLOAD_TOKEN
    ) {
      return response({
        status: "error",
        message: "Unauthorized"
      }, 401);
    }

    // Receive multipart image
    const incoming = await request.formData();
    const image = incoming.get("image");

    if (!image || typeof image === "string") {
      return response({
        status: "error",
        message: "Missing image field"
      }, 400);
    }

    if (image.size > 1048576) {
      return response({
        status: "error",
        message: "Image exceeds 1 MB"
      }, 413);
    }

    if (!["image/png", "image/jpeg", "image/gif"].includes(image.type)) {
      return response({
        status: "error",
        message: "Unsupported image format"
      }, 415);
    }

    // Send image to QR decoder
    const decoderForm = new FormData();

    decoderForm.append("file", image, "runninghub.png");
    decoderForm.append("outputformat", "json");

    const decodeResponse = await fetch(
      "https://api.qrserver.com/v1/read-qr-code/",
      {
        method: "POST",
        body: decoderForm
      }
    );

    if (!decodeResponse.ok) {
      throw new Error(
        "QR decoder HTTP " + decodeResponse.status
      );
    }

    const decoded = await decodeResponse.json();

    const message = decoded?.[0]?.symbol?.[0]?.data;
    const decodeError = decoded?.[0]?.symbol?.[0]?.error;

    if (!message) {
      throw new Error(
        decodeError || "No QR code found"
      );
    }

    // Send decoded text to Google Apps Script
    const sheetResponse = await fetch(
      process.env.SHEETS_WEB_APP_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          secret: process.env.SHEETS_SECRET,
          message: message,
          source: "RunningHub"
        })
      }
    );

    if (!sheetResponse.ok) {
      throw new Error(
        "Google Sheets HTTP " + sheetResponse.status
      );
    }

    const sheetResult = await sheetResponse.json();

    if (sheetResult.status !== "success") {
      throw new Error(
        sheetResult.message || "Google Sheets write failed"
      );
    }

    return response({
      status: "success",
      decoded_message: message,
      sheets: "updated"
    });

  } catch (error) {
    return response({
      status: "error",
      message: error.message || String(error)
    }, 500);
  }
}
