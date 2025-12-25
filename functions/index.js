const { onValueCreated } = require("firebase-functions/v2/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

/* 🔐 Gemini API Key */
const GEMINI_API_KEY = defineString("GEMINI_API_KEY");

/* ======================================================
   Helper: Safely extract JSON from Gemini response
====================================================== */
function extractJSON(text) {
  try {
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.error("❌ JSON parse failed. Raw text:", text);
    return null;
  }
}

/* ======================================================
   Helper: Analyze complaint with Gemini
   ✅ STABLE MODEL: gemini-1.0-pro (verified working)
====================================================== */
async function analyzeComplaintWithGemini(title, description) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());

    const model = genAI.getGenerativeModel({
      model: "gemini-1.0-pro",
    });

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
  "summary": "",
  "category": "",
  "emotion": "",
  "priority": ""
}
`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    console.log("🤖 Gemini raw output:", rawText);

    const parsed = extractJSON(rawText);
    if (!parsed) {
      throw new Error("Gemini returned invalid JSON");
    }

    return parsed;
  } catch (error) {
    console.error("❌ Gemini call failed:", error.message);
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
      throw new HttpsError(
        "resource-exhausted",
        "AI quota exceeded or invalid response. Please retry later."
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
