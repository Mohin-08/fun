const { onValueCreated } = require("firebase-functions/v2/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

admin.initializeApp();

/* 🔐 Gemini API Key */
// Using provided API key directly (no Firebase parameter needed)
const GEMINI_API_KEY = "AIzaSyBNliEaL2sncNexZsCcZ7tvLSKcDHNlNU8";

function getApiKey() {
  console.log("ℹ️ Using provided API key");
  return GEMINI_API_KEY;
}

/* ======================================================
   Helper: Safely extract JSON from Gemini response
====================================================== */
function extractJSON(text) {
  if (!text) return null;
  
  try {
    // Try direct parse first
    const directParse = JSON.parse(text.trim());
    if (directParse && typeof directParse === 'object') {
      return directParse;
    }
  } catch (e) {
    // Continue to cleaning process
  }

  try {
    // Clean markdown code blocks
    let cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    // Try to extract JSON object from text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    console.error("❌ JSON parse failed. Raw text:", text.substring(0, 500));
    console.error("❌ Parse error:", err.message);
  }
  
  return null;
}

/* ======================================================
   Helper: Analyze complaint with Gemini
   ✅ STABLE MODEL: gemini-1.0-pro (verified working)
====================================================== */
async function analyzeComplaintWithGemini(title, description) {
  try {
    const apiKey = getApiKey();
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("Gemini API key is not configured");
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Use gemini-pro (most widely available, works with all API keys)
    const model = genAI.getGenerativeModel({
      model: "gemini-pro",
    });
    console.log("🤖 Using model: gemini-pro");

    const prompt = `
You are an AI assistant helping customer support managers.

Analyze the following complaint and respond ONLY in valid JSON.

Choose category from:
Order Issue, Payment Issue, Service Quality, Technical Problem,
Harassment / Misbehavior, Refund / Cancellation, Other

Choose emotion from:
Calm, Frustrated, Angry, Distressed

Choose priority from:
Low, Medium, High, Critical

Complaint:
Title: ${title}
Description: ${description}

Respond ONLY with JSON in this format:
{
  "summary": "Brief summary of the complaint",
  "category": "One of the categories above",
  "emotion": "One of the emotions above",
  "priority": "One of the priorities above"
}
`;

    console.log("🤖 Calling Gemini API with title:", title);
    console.log("🤖 Using API key:", apiKey.substring(0, 10) + "...");
    console.log("🤖 Prompt length:", prompt.length);
    
    const result = await model.generateContent(prompt);
    console.log("✅ Gemini API call successful, got response");
    
    const rawText = result.response.text();
    console.log("✅ Extracted text from response, length:", rawText?.length || 0);

    console.log("🤖 Gemini raw output:", rawText);

    if (!rawText || rawText.trim() === "") {
      throw new Error("Gemini returned empty response");
    }

    const parsed = extractJSON(rawText);
    if (!parsed) {
      console.error("❌ Failed to parse JSON. Raw response:", rawText);
      throw new Error("Gemini returned invalid JSON format");
    }

    // Validate required fields
    if (!parsed.summary || !parsed.category || !parsed.emotion || !parsed.priority) {
      console.error("❌ Missing required fields in parsed JSON:", parsed);
      throw new Error("Gemini response missing required fields");
    }

    console.log("✅ Successfully parsed Gemini response:", parsed);
    return parsed;
  } catch (error) {
    console.error("❌ Gemini call failed:");
    console.error("   Error message:", error.message);
    console.error("   Error name:", error.name);
    console.error("   Error code:", error.code);
    console.error("   Error status:", error.status);
    console.error("   Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Check for specific error types
    if (error.message && (error.message.includes("API key") || error.message.includes("API_KEY"))) {
      console.error("   ⚠️ API key issue detected - key may be invalid or expired");
    }
    if (error.status === 429 || error.code === 429 || (error.message && error.message.includes("429"))) {
      console.error("   ⚠️ Rate limit exceeded (429) - too many requests");
    }
    if (error.status === 400 || error.code === 400 || (error.message && error.message.includes("400"))) {
      console.error("   ⚠️ Bad request (400) - check API key validity or request format");
    }
    if (error.status === 401 || error.code === 401 || (error.message && error.message.includes("401"))) {
      console.error("   ⚠️ Unauthorized (401) - API key is invalid");
    }
    if (error.status === 403 || error.code === 403 || (error.message && error.message.includes("403"))) {
      console.error("   ⚠️ Forbidden (403) - API key doesn't have permission");
    }
    
    // Check for GoogleGenerativeAI specific errors
    if (error.response) {
      console.error("   Response data:", error.response.data);
      console.error("   Response status:", error.response.status);
    }
    
    // Log more details if available
    if (error.stack) {
      console.error("   Error stack:", error.stack);
    }
    if (error.cause) {
      console.error("   Error cause:", error.cause);
    }
    
    return null; // IMPORTANT: do NOT throw
  }
}

/* ======================================================
   Callable Function: Re-analyze Complaint
   ✅ Correct way (NO fetch, NO CORS issues)
====================================================== */
exports.reanalyzeComplaint = onCall(
  { region: "europe-west1" },
  async (request) => {
    const complaintId = request.data?.complaintId;

    console.log("🔄 Re-analyze request:", request.data);

    if (!complaintId) {
      throw new HttpsError("invalid-argument", "complaintId is required");
    }

    const snap = await admin
      .database()
      .ref(`complaints/${complaintId}`)
      .get();

    if (!snap.exists()) {
      throw new HttpsError("not-found", "Complaint not found");
    }

    const complaint = snap.val();

    // ✅ Guard: prevent repeated Gemini calls
    if (complaint.aiAnalysis && complaint.aiAnalysis.summary) {
      return {
        success: true,
        aiAnalysis: complaint.aiAnalysis,
        cached: true,
      };
    }

    if (!complaint.title || !complaint.description) {
      throw new HttpsError(
        "invalid-argument",
        "Complaint missing title or description"
      );
    }

    const aiAnalysis = await analyzeComplaintWithGemini(
      complaint.title,
      complaint.description
    );

    if (!aiAnalysis) {
      console.error("❌ Analysis returned null for complaint:", complaintId);
      console.error("   This could be due to:");
      console.error("   - Invalid or expired API key");
      console.error("   - Rate limiting (429 error)");
      console.error("   - Network issues");
      console.error("   - Invalid response format from Gemini");
      throw new HttpsError(
        "internal",
        "Failed to analyze complaint. The API key may be invalid, rate limit exceeded, or there was an error processing the response. Please check Firebase logs for details."
      );
    }

    await admin
      .database()
      .ref(`complaints/${complaintId}/aiAnalysis`)
      .set({
        ...aiAnalysis,
        analyzedAt: Date.now(),
      });

    console.log("✅ Re-analysis saved");

    return { success: true, aiAnalysis };
  }
);

/* ======================================================
   Trigger: Auto analyze on new complaint
====================================================== */
exports.onComplaintCreated = onValueCreated(
  {
    ref: "/complaints/{complaintId}",
    region: "europe-west1",
    instance: "ai-complaint-analyzer-d0bc1-default-rtdb",
  },
  async (event) => {
    const complaintId = event.params.complaintId;
    const complaint = event.data.val();

    console.log("🔥 New complaint detected:", complaintId);

    if (!complaint?.title || !complaint?.description) {
      console.warn("⚠️ Missing title/description");
      return;
    }

    // ✅ Guard: prevent duplicate Gemini calls
    if (complaint.aiAnalysis && complaint.aiAnalysis.summary) {
      console.log("⏭️ Already analyzed, skipping");
      return;
    }

    const aiAnalysis = await analyzeComplaintWithGemini(
      complaint.title,
      complaint.description
    );

    if (!aiAnalysis) {
      console.warn("⚠️ AI unavailable (quota or error)");
      return;
    }

    await admin
      .database()
      .ref(`complaints/${complaintId}/aiAnalysis`)
      .set({
        ...aiAnalysis,
        analyzedAt: Date.now(),
      });

    console.log("✅ Auto analysis saved");
  }
);
