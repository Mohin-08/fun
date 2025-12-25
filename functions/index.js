const { onValueCreated } = require("firebase-functions/v2/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

/* 🔐 Gemini API Key (v7 compatible) */
const GEMINI_API_KEY = defineString("GEMINI_API_KEY");

/* ======================================================
   Helper: Safely extract JSON from Gemini response
====================================================== */
function extractJSON(text) {
  try {
    // Remove markdown ```json ``` if present
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.error("❌ JSON parse failed:", text);
    return null;
  }
}

/* ======================================================
   Helper: Analyze complaint with Gemini
   Model: gemini-pro (stable model)
====================================================== */
async function analyzeComplaintWithGemini(title, description) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());

 const model = genAI.getGenerativeModel({
  model: "gemini-pro",
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

Respond ONLY with JSON in this exact format:
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

  return extractJSON(rawText);
}

/* ======================================================
   Callable: Re-analyze a specific complaint
   Region: europe-west1 (matches database location)
====================================================== */
exports.reanalyzeComplaint = onCall({ region: "europe-west1" }, async (request) => {
  const complaintId = request.data?.complaintId;

  console.log("🔄 Re-analyze request received:", request.data);

  if (!complaintId) {
    console.error("❌ No complaintId provided");
    throw new HttpsError("invalid-argument", "complaintId is required");
  }

  console.log("🔄 Re-analyzing complaint:", complaintId);

  try {
    // Fetch the complaint
    const complaintSnap = await admin
      .database()
      .ref(`complaints/${complaintId}`)
      .get();

    if (!complaintSnap.exists()) {
      console.error("❌ Complaint not found:", complaintId);
      throw new HttpsError("not-found", "Complaint not found");
    }

    const complaint = complaintSnap.val();
    console.log("📋 Complaint data:", complaint);

    // If aiAnalysis already exists, return it (no need to re-analyze)
    if (complaint.aiAnalysis && complaint.aiAnalysis.summary) {
      console.log("✅ AI analysis already exists, returning existing data");
      return { success: true, aiAnalysis: complaint.aiAnalysis, cached: true };
    }

    // Check if we have title and description to analyze
    if (!complaint.title || !complaint.description) {
      console.error("❌ Complaint missing title/description and no existing analysis");
      throw new HttpsError("invalid-argument", "Complaint missing title/description. Please create a new complaint.");
    }

    const aiAnalysis = await analyzeComplaintWithGemini(
      complaint.title,
      complaint.description
    );

    if (!aiAnalysis) {
      console.error("❌ Failed to parse AI response");
      throw new HttpsError("internal", "Failed to parse AI response");
    }

    // Save AI Analysis
    await admin
      .database()
      .ref(`complaints/${complaintId}/aiAnalysis`)
      .set({
        ...aiAnalysis,
        analyzedAt: Date.now(),
      });

    console.log("✅ Re-analysis saved successfully");

    return { success: true, aiAnalysis };
  } catch (error) {
    console.error("❌ Re-analysis failed:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error.message || "Unknown error occurred");
  }
});

/* ======================================================
   Trigger: When a new complaint is created
   Region: europe-west1 (matches database location)
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
      console.warn("⚠️ Complaint missing title/description");
      return;
    }

    try {
      const aiAnalysis = await analyzeComplaintWithGemini(
        complaint.title,
        complaint.description
      );

      if (!aiAnalysis) {
        console.error("❌ Invalid AI response, skipping save");
        return;
      }

      /* ===============================
         Save AI Analysis to RTDB
      =============================== */
      await admin
        .database()
        .ref(`complaints/${complaintId}/aiAnalysis`)
        .set({
          ...aiAnalysis,
          analyzedAt: Date.now(),
        });

      console.log("✅ AI analysis saved successfully");

    } catch (error) {
      console.error("❌ Gemini analysis failed:", error.message);
    }

    return;
  }
);
