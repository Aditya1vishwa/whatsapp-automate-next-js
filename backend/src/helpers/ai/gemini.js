import { GoogleGenAI } from '@google/genai';
import pdfParse from "pdf-parse";
import { logAiUsage } from "./usageLogger.js";

let aiClient = null;

// ── Model constants ───────────────────────────────────────────────────────────
// EVAL_MODEL   : Used for scoring + evaluation (more accurate)
// QUESTION_MODEL: Used for next question generation (faster, cheaper)
const EVAL_MODEL = process.env.GEMINI_MODEL_EVAL || "gemini-2.5-flash";
const QUESTION_MODEL = process.env.GEMINI_MODEL_QUESTION || "gemini-2.5-flash-lite";
// Keep FAST_MODEL for non-interview tasks (topics, resume analysis, etc.)
const FAST_MODEL = process.env.GEMINI_MODEL_FAST || "gemini-2.5-flash";

const stripCodeFence = (text = "") => {
    return text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
};

const extractJsonText = (text = "") => {
    const stripped = stripCodeFence(text);
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return stripped.slice(firstBrace, lastBrace + 1);
    }
    return stripped;
};

const parseJsonResponse = (text, label) => {
    const cleaned = extractJsonText(text);
    try {
        return JSON.parse(cleaned);
    } catch (error) {
        throw new Error(`Invalid JSON from Gemini for ${label}`);
    }
};

// Normalize a question for de-duplication (case/space/punctuation insensitive).
const normalizeQuestion = (text = "") =>
    String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Pull every question the interviewer has already asked, so we can tell the
// model NOT to repeat them (passed into every turn prompt).
const getAskedQuestions = (conversationHistory = []) =>
    (Array.isArray(conversationHistory) ? conversationHistory : [])
        .filter((m) => m.role === "assistant" || m.role === "ai")
        .map((m) => String(m.content || "").trim())
        .filter(Boolean);

const getClient = () => {
    if (!aiClient) {
        aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });
    }
    return aiClient;
};

/**
 * Collect a streaming Gemini response into a single string.
 * Waiting for the final token ensures we always get the complete output.
 */
const streamToText = async (streamResponse, operation = "generateContentText", interviewId = null) => {
    let full = "";
    let usageMetadata = null;
    for await (const chunk of streamResponse) {
        full += chunk.text ?? "";
        if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
    }

    if (usageMetadata) {
        logAiUsage({
            provider: "gemini",
            operation,
            inputTokens: usageMetadata.promptTokenCount,
            outputTokens: usageMetadata.candidatesTokenCount,
            cachedTokens: usageMetadata.cachedContentTokenCount,
            interviewId
        });
    }

    return full.trim();
};

const generateContentText = async (
    prompt,
    {
        model = FAST_MODEL,
        temperature = 0.2,
        responseMimeType,
        maxOutputTokens,
        operation = "generateContentText",
        interviewId = null
    } = {}
) => {
    const ai = getClient();
    const config = {
        temperature,
        ...(responseMimeType ? { responseMimeType } : {}),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
    };

    if (responseMimeType) {
        // JSON mode: use non-streaming for reliable JSON parsing
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config,
        });

        const usage = response?.usageMetadata;
        if (usage) {
            logAiUsage({
                provider: "gemini",
                operation,
                inputTokens: usage.promptTokenCount,
                outputTokens: usage.candidatesTokenCount,
                cachedTokens: usage.cachedContentTokenCount,
                interviewId
            });
        }

        return response?.text?.trim() || "";
    }

    // Text mode: use streaming so the first token arrives faster
    const stream = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config,
    });
    return streamToText(stream, operation, interviewId);
};

export const extractTextFromPdf = async (buffer) => {
    try {
        const data = await pdfParse(buffer);
        return data.text || "";
    } catch (error) {
        throw new Error('Failed to parse PDF: ' + error.message);
    }
};

export const analyzeResumeAndProfile = async (resumeText, currentProfile) => {
    const prompt = `
You are an expert ATS and HR assistant. Your goal is to extract information from a parsed resume and merge it with a user's existing profile data. 
Return ONLY a valid JSON string matching the exact structure expected. No markdown wrappers (\`\`\`json \`\`\`), just the raw JSON object.

The structure should match this JS object format based on the Mongoose schema (do not include userId, _id, or timestamps):
{
  "headline": "",
  "bio": "",
  "phone": "",
  "linkedin": "",
  "github": "",
  "portfolio": "",
  "careerLevel": "one of: student,fresher,junior,mid,senior,lead",
  "totalExperienceYears": number,
  "currentCompany": "",
  "currentRole": "",
  "location": { "city": "", "state": "", "country": "" },
  "skills": [ { "title": "", "rating": number_from_0_to_10, "category": "" } ],
  "experiences": [ { "title": "", "company": "", "employmentType": "full-time", "location": "", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "isCurrent": false, "description": "", "technologies": [""] } ],
  "education": [ { "degree": "", "field": "", "institution": "", "startYear": number, "endYear": number, "grade": "", "location": "" } ],
  "projects": [ { "title": "", "description": "", "technologies": [""], "projectUrl": "", "githubUrl": "" } ],
  "achievements": [ { "title": "", "description": "", "date": "YYYY-MM-DD" } ],
  "certifications": [ { "title": "", "issuer": "", "issueDate": "YYYY-MM-DD", "credentialUrl": "" } ]
}

Here is the current profile (use this to help fill in the JSON, but give preference to the resume if it has new/better information):
${JSON.stringify(currentProfile, null, 2)}

Here is the parsed resume text:
${resumeText}

Make sure to extract dates properly in YYYY-MM-DD format (for dates just year, use YYYY-01-01). Calculate totalExperienceYears. Predict careerLevel accurately.
`;

    try {
        const text = await generateContentText(prompt, { 
            responseMimeType: "application/json",
            operation: "analyzeResumeAndProfile"
        });
        return parseJsonResponse(text, "analyzeResumeAndProfile");
    } catch (error) {
        console.error("Gemini Error:", error);
        throw new Error("Failed to analyze resume with Gemini.");
    }
};

const MAX_TEXT_LENGTH = 8000;

const trimText = (text) => {
    if (!text) return "";
    return text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH)
        : text;
};

const clampMatchScore = (value) => {
    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) return 0;
    return Math.max(0, Math.min(100, Math.round(numberValue)));
};

const normalizeStringArray = (value, limit = 8) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, limit);
};

const getVerdictFromScore = (score) => {
    if (score >= 85) return "strong_match";
    if (score >= 70) return "good_match";
    if (score >= 45) return "partial_match";
    return "low_match";
};

export const analyzeResumesAgainstJob = async (jobDescription, resumes = []) => {
    const safeJD = trimText(jobDescription);
    const safeResumes = resumes.slice(0, 10).map((resume, index) => ({
        index,
        resumeName: String(resume.resumeName || resume.fileName || `Resume ${index + 1}`).slice(0, 160),
        text: trimText(resume.text || ""),
    }));

    const prompt = `
You are an expert ATS evaluator and senior recruiter.

Task:
Compare each resume against the job description and return ranked, production-ready hiring insight.

Scoring:
- matchScore is an integer from 0 to 100.
- Score must reward direct required-skill evidence, relevant project/work impact, seniority match, domain match, and keyword coverage.
- Penalize missing must-have requirements, vague claims, career-level mismatch, and unrelated experience.

Return STRICT JSON ONLY with this exact structure:
{
  "results": [
    {
      "resumeName": "string",
      "matchScore": number,
      "verdict": "strong_match | good_match | partial_match | low_match",
      "summary": "2 concise sentences",
      "matchedSkills": ["specific matched skills"],
      "missingSkills": ["important missing requirements"],
      "strengths": ["evidence-backed strengths"],
      "gaps": ["role-specific gaps"],
      "recommendations": ["resume or interview prep recommendations"],
      "roleFitNotes": "one concise recruiter-style note"
    }
  ]
}

Job Description:
${safeJD || "Not provided"}

Resumes:
${JSON.stringify(safeResumes, null, 2)}
`;

    try {
        const text = await generateContentText(prompt, {
            model: FAST_MODEL,
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 4000,
            operation: "analyzeResumesAgainstJob",
        });

        const parsed = parseJsonResponse(text, "analyzeResumesAgainstJob");
        const resultMap = new Map(
            (Array.isArray(parsed.results) ? parsed.results : []).map((item) => [
                String(item.resumeName || "").trim().toLowerCase(),
                item,
            ])
        );

        return safeResumes
            .map((resume) => {
                const raw = resultMap.get(resume.resumeName.toLowerCase()) || parsed.results?.[resume.index] || {};
                const matchScore = clampMatchScore(raw.matchScore);
                return {
                    resumeName: resume.resumeName,
                    matchScore,
                    verdict: ["strong_match", "good_match", "partial_match", "low_match"].includes(raw.verdict)
                        ? raw.verdict
                        : getVerdictFromScore(matchScore),
                    summary: String(raw.summary || "Resume analyzed against the provided role requirements.").trim(),
                    matchedSkills: normalizeStringArray(raw.matchedSkills),
                    missingSkills: normalizeStringArray(raw.missingSkills),
                    strengths: normalizeStringArray(raw.strengths),
                    gaps: normalizeStringArray(raw.gaps),
                    recommendations: normalizeStringArray(raw.recommendations),
                    roleFitNotes: String(raw.roleFitNotes || "").trim(),
                };
            })
            .sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
        // Throw so callers can abort before charging credits / persisting a
        // garbage report — matching generateFirstQuestion / analyzeResumeAndProfile.
        console.error("Gemini resume match error:", error);
        throw new Error("Failed to analyze resumes with Gemini.");
    }
};

export const generateInterviewTopics = async (
    jobDescription,
    resumeDetails,
    title,
    level
) => {
    const safeJD = trimText(jobDescription);
    const safeResume = trimText(resumeDetails);

    const prompt = `
You are a senior hiring manager designing a REAL interview plan used in actual companies.

Your task:
Generate an interview strategy tailored for the role "${title}" at level "${level}".

Important constraints:
- Topics must be highly relevant to the role
- Avoid generic topics like "communication skills"
- Include a mix of:
  - Core skill validation
  - Real-world problem solving
  - Experience validation
  - Decision making
- Topics must reflect the candidate's resume strengths if possible
- Topics should escalate difficulty gradually

Return STRICT JSON ONLY with this exact structure:
{
  "topics": ["4 to 6 realistic interview topics"],
  "description": "5-6 sentences explaining how the interview will flow realistically"
}

Interview Design Rules:
1. First topic should be warm-up / background validation
2. Middle topics should test real job ability
3. One topic should test problem-solving depth
4. Last topic should evaluate decision-making or tradeoffs
5. Avoid repeating similar themes

Job Description:
${safeJD || "Not provided"}

Candidate Resume Summary:
${safeResume || "Not provided"}
`;

    try {
        const text = await generateContentText(prompt, {
            responseMimeType: "application/json",
            temperature: 0.3,
            operation: "generateInterviewTopics"
        });

        const parsed = parseJsonResponse(text, "generateInterviewTopics");

        if (!parsed.topics || !Array.isArray(parsed.topics)) {
            throw new Error("Invalid topics structure");
        }

        if (parsed.topics.length < 3) {
            throw new Error("Insufficient topics generated");
        }

        return {
            topics: parsed.topics.slice(0, 6),
            description: parsed.description || "",
        };
    } catch (error) {
        console.error("Gemini Error:", error);

        return {
            topics: [
                "Candidate background and experience overview",
                "Core technical skills related to the role",
                "Problem solving scenario discussion",
                "Project deep dive from resume",
                "Architecture or decision making discussion"
            ],
            description:
                "This interview will begin with understanding the candidate's background and past work. We will then evaluate their core technical strengths related to the role. Next, we will explore how the candidate approaches real-world problems and analyze one of their previous projects in detail. Finally, the discussion will focus on decision-making, trade-offs, and how they handle complex scenarios in professional environments."
        };
    }
};

export const generateFirstQuestion = async (topics, description, level) => {
    // Pick the most relevant first topic to seed the opener
    const firstTopic = topics?.[0] || "your background";
    //  of their experience relevant to "${firstTopic}
    const prompt = `
You are Sarah, a professional AI voice interviewer. The candidate is at level "${level}".
Interview focus: "${firstTopic}".

Task: Say a short opening line to start the interview.

Requirements:
1. Greet and introduce yourself as Sarah.
2. Ask for a brief introduction.

Example Good Output: Hi, I’m Sarah. Could you briefly introduce yourself?

HARD RULES:
- Return ONLY the spoken text.
- No quotes, markdown, or extra text.
- Keep it short and natural.
`.trim();

    try {
        const text = await generateContentText(prompt, { 
            temperature: 0.7,
            operation: "generateFirstQuestion"
        });
        return text.replace(/^[\"']|[\"']$/g, '').trim();
    } catch (error) {
        console.error("Gemini Error:", error);
        return `Hi, I'm Sarah — let's get started. Could you give me a quick intro about your background and experience?`;
    }
};


// ─── Shared interview brain (used by BOTH cached and uncached paths) ──────────

// Sarah's full persona + interview context. This is baked into the Gemini
// context cache when caching works, AND sent inline as systemInstruction on the
// uncached path when it doesn't — so a cache-creation failure at interview start
// costs extra tokens, never quality. No filler/padding: every line earns its place.
const buildInterviewSystemInstruction = ({
    jobDescription,
    resumeDetails,
    topics = [],
    description = "",
    level = "",
    title = "",
} = {}) => {
    const safeJD = trimText(jobDescription) || "Not provided";
    const safeResume = trimText(resumeDetails) || "Not provided";
    const topicLine = (Array.isArray(topics) ? topics : []).filter(Boolean).join(", ") || "General";
    return `
You are Sarah, a highly realistic, senior AI interviewer conducting a live voice interview.

STRICT RULES:
- Ask ONLY ONE short follow-up question per turn (max 18 words).
- Sound like a real human interviewer having a conversation — warm but professional, never robotic.
- Actually listen: build each question on a specific detail the candidate just said, so it flows like a real dialogue.
- Do NOT give feedback, coaching, scores, or encouragement to the candidate.
- NEVER repeat a question already asked, and never lightly reword an earlier one — always move forward to something new.

INTERVIEW CONTEXT:
Role: ${title || "Not specified"}
Level: ${level || "Not specified"}
Topics: ${topicLine}
Interview Flow: ${description || "Progress naturally from background to deeper, role-specific topics."}

CANDIDATE JOB DESCRIPTION:
${safeJD}

CANDIDATE RESUME / PROFILE:
${safeResume}

EVALUATION CRITERIA (internal scoring, never spoken):
- 9-10 Exceptional: deep mastery, clear trade-offs and business impact.
- 7-8 Strong: solid understanding with specific examples.
- 5-6 Average: generic/textbook, lacks their specific contribution or the "why".
- 3-4 Weak: tangential or fundamental misunderstandings.
- 1-2 Inadequate: cannot communicate or logically incorrect.

PROBING STRATEGY:
- Purely theoretical answer → ask for a concrete example they implemented.
- Answer lacks an outcome → ask about the measurable impact/result.
- Overuse of "we" → isolate their specific individual contribution.

CONVERSATIONAL ANCHORING:
- You may open with a brief, natural transition referencing what they said (a few words), then ask the question — like a real conversation, not an interrogation.
- Don't overpraise or coach; stay neutral and professional, not cold.
- Stay in character as Sarah, a senior technical interviewer, weighing depth, trade-offs, scalability, maintainability, and security where relevant.
`.trim();
};

// The per-turn user message: latest answer, timing, state, recent conversation,
// and the explicit anti-repeat list. Identical for cached and uncached paths so
// behaviour matches regardless of whether the cache exists.
const buildEvaluationTurnPrompt = ({
    newUserAnswer,
    recentConversation = [],
    state,
    timeRemainingMinutes,
    askedQuestions = [],
}) => {
    const askedList = askedQuestions.length
        ? askedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
        : "(none yet)";
    return `
LATEST CANDIDATE ANSWER: "${newUserAnswer}"
TIME REMAINING: ${Number(timeRemainingMinutes).toFixed(1)} minutes
CURRENT STATE: ${JSON.stringify(state)}
RECENT CONVERSATION: ${JSON.stringify(recentConversation.slice(-12))}

QUESTIONS ALREADY ASKED (never repeat or lightly reword any of these — always ask something NEW):
${askedList}

TASK:
1. correctedAnswer: repeat the LATEST CANDIDATE ANSWER but fix obvious speech-to-text
   mishearings of domain terms using THIS interview's context above (e.g. "AI milliliter"
   → "AIML", "no sequel" → "NoSQL", "cuber netis" → "Kubernetes"). Preserve the candidate's
   own words, phrasing, language, and meaning — ONLY repair mis-transcribed terms. If nothing
   needs fixing, return it unchanged. Score/evaluate based on this corrected version.
2. Score the corrected answer 0-10.
3. Set isIrrelevant=true only when the answer is completely off-topic, gibberish, or clearly unrelated (e.g. "No response provided", random words).
4. Update streaks: weakStreak +1 if score < 4 else 0; irrelevantStreak +1 if isIrrelevant else 0.
5. Decide the next action (priority order):
   - candidate explicitly asks to end/stop → concludeInterview: true
   - irrelevantStreak >= 3 → concludeInterview: true
   - isIrrelevant → ask a DIFFERENTLY-WORDED question on the same topic (never identical), do NOT advance topic
   - weakStreak >= 2 → switch topic or simplify
   - score >= 7 → a deeper follow-up that references what they said
   - timeRemaining < 3 → move to closing
   - otherwise → a natural NEW follow-up
6. nextQuestion must be voice-friendly, <= 18 words, and must NOT match anything in "QUESTIONS ALREADY ASKED".

OUTPUT — strict JSON only, no markdown:
{"correctedAnswer":"string","score":number,"isIrrelevant":boolean,"updatedState":{"weakStreak":number,"currentTopic":"string","irrelevantStreak":number},"nextQuestion":"string","concludeInterview":boolean}
`.trim();
};

// Runs a single evaluation turn with up to `maxAttempts` tries. Retries on error,
// unparsable JSON, or a repeated question. Returns the parsed object, or null if
// every attempt failed — we NEVER fabricate a canned/static question here; the
// question always comes from the model with the real interview context.
const runEvaluationTurn = async ({
    model,
    cacheName = null,
    systemInstruction = null,
    turnPrompt,
    askedQuestions = [],
    operation,
    maxAttempts = 2,
}) => {
    const ai = getClient();
    const asked = new Set(askedQuestions.map(normalizeQuestion));
    let lastParsed = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: [{ role: "user", parts: [{ text: turnPrompt }] }],
                config: {
                    ...(cacheName ? { cachedContent: cacheName } : {}),
                    ...(systemInstruction ? { systemInstruction } : {}),
                    temperature: 0.4,
                    maxOutputTokens: 600,
                    responseMimeType: "application/json",
                },
            });

            const usage = response?.usageMetadata;
            if (usage) {
                if (usage.cachedContentTokenCount) {
                    console.log(`[Gemini Cache] Hit ✓ — cached: ${usage.cachedContentTokenCount} tokens, prompt: ${usage.promptTokenCount} tokens`);
                }
                logAiUsage({
                    provider: "gemini",
                    operation,
                    inputTokens: usage.promptTokenCount,
                    outputTokens: usage.candidatesTokenCount,
                    cachedTokens: usage.cachedContentTokenCount,
                });
            }

            const parsed = parseJsonResponse(response?.text?.trim() || "", operation);
            lastParsed = parsed;

            // Retry if the model handed back a question we've already asked.
            const repeats =
                parsed?.nextQuestion &&
                !parsed.concludeInterview &&
                asked.has(normalizeQuestion(parsed.nextQuestion));
            if (repeats && attempt < maxAttempts) {
                console.warn(`[Gemini] ${operation}: repeated question on attempt ${attempt}, retrying for a fresh one`);
                continue;
            }
            return parsed;
        } catch (error) {
            console.error(`[Gemini] ${operation} attempt ${attempt}/${maxAttempts} failed:`, error?.message || error);
        }
    }
    return lastParsed; // null if every attempt errored
};

// ─── Context Caching ─────────────────────────────────────────────────────────

/**
 * Creates a Gemini context cache containing Sarah's full persona, the job
 * description, candidate resume/profile, and interview plan.
 *
 * The cache is reused on EVERY answer evaluation turn, saving ~80% of input
 * tokens per question.
 *
 * @returns {string|null} Cache resource name or null on failure (fallback mode).
 */
export const createInterviewCache = async ({
    jobDescription,
    resumeDetails,
    topics,
    description,
    level,
    title,
}) => {
    try {
        const ai = getClient();

        const systemInstruction = buildInterviewSystemInstruction({
            jobDescription,
            resumeDetails,
            topics,
            description,
            level,
            title,
        });

        const cache = await ai.caches.create({
            model: EVAL_MODEL,
            config: {
                displayName: `interview-session-${Date.now()}`,
                systemInstruction,
                contents: [
                    {
                        role: "user",
                        parts: [{ text: "Interview context loaded. Ready to evaluate candidate answers." }],
                    },
                    {
                        role: "model",
                        parts: [{ text: "Understood. I am Sarah. Send me the latest candidate answer and interview state and I will evaluate it and generate the next follow-up question." }],
                    },
                ],
                ttl: "3600s", // 1 hour — safe for any session up to 30-60 min
            },
        });

        console.log(`[Gemini Cache] Created: ${cache.name}`);
        return cache.name;
    } catch (error) {
        // Context caching may not be supported for all models/regions/accounts
        console.warn("[Gemini Cache] Could not create cache, will use uncached fallback:", JSON.stringify(error?.response || error));
        return null;
    }
};

/**
 * Evaluates the latest candidate answer using a pre-created context cache.
 * The persona/JD/resume live in the cache; only the per-turn prompt is sent.
 * Retries on error/unparsable JSON/repeat, and returns null on total failure so
 * the caller falls back to the uncached path (which carries the same context).
 */
export const evaluateAndGenerateNextQuestionWithCache = async (
    cacheName,
    newUserAnswer,
    recentConversation,
    state,
    timeLimitMinutes,
    elapsedTimeMinutes
) => {
    const askedQuestions = getAskedQuestions(recentConversation);
    const turnPrompt = buildEvaluationTurnPrompt({
        newUserAnswer,
        recentConversation,
        state,
        timeRemainingMinutes: timeLimitMinutes - elapsedTimeMinutes,
        askedQuestions,
    });

    return runEvaluationTurn({
        model: EVAL_MODEL,
        cacheName,
        turnPrompt,
        askedQuestions,
        operation: "evaluateAndGenerateNextQuestionWithCache",
    });
};

/**
 * Deletes the Gemini context cache after the interview session ends.
 * Non-fatal — logs errors but never throws.
 */
export const deleteInterviewCache = async (cacheName) => {
    if (!cacheName) return;
    try {
        const ai = getClient();
        await ai.caches.delete({ name: cacheName });
        console.log(`[Gemini Cache] Deleted: ${cacheName}`);
    } catch (error) {
        // Cache may have expired naturally — not an error worth surfacing
        console.warn(`[Gemini Cache] Delete failed (may be expired): ${error?.message || error}`);
    }
};

// ─── Uncached path (used when the context cache is unavailable / a miss) ──────

/**
 * Evaluates and generates the next question WITHOUT a Gemini context cache.
 * This is not a degraded path: it rebuilds the exact same persona + JD + resume
 * + topics + flow as the cache and sends it inline as systemInstruction, so a
 * failed cache-creation at interview start costs only extra tokens, not quality.
 * Retries internally and NEVER returns a canned/static question.
 *
 * @param {object} interviewContext { jobDescription, resumeDetails, topics, description, level, title }
 */
export const evaluateAndGenerateNextQuestion = async (
    interviewContext,
    conversationHistory,
    state,
    timeLimitMinutes,
    elapsedTimeMinutes
) => {
    const askedQuestions = getAskedQuestions(conversationHistory);
    // The latest candidate answer is the last user turn in the history.
    const newUserAnswer =
        [...conversationHistory].reverse().find((m) => m.role === "user")?.content || "";

    const systemInstruction = buildInterviewSystemInstruction(interviewContext || {});
    const turnPrompt = buildEvaluationTurnPrompt({
        newUserAnswer,
        recentConversation: conversationHistory,
        state,
        timeRemainingMinutes: timeLimitMinutes - elapsedTimeMinutes,
        askedQuestions,
    });

    // EVAL_MODEL (not the lighter QUESTION_MODEL) so quality matches the cached
    // path when the cache is missing — this is the "no cache" fallback the user
    // wants to be first-class, not second-rate.
    return runEvaluationTurn({
        model: EVAL_MODEL,
        systemInstruction,
        turnPrompt,
        askedQuestions,
        operation: "evaluateAndGenerateNextQuestion",
    });
};

export const generateFinalEvaluation = async (answersList, topics, { isAbandoned = false, abandonedAt = null } = {}) => {
    const abandonedContext = isAbandoned
        ? `\n⚠️ NOTE: This interview was abandoned by the candidate${abandonedAt ? ` at ${abandonedAt}` : ""} before completion. Only partial responses are available. Factor this into the evaluation — penalise appropriately for incompleteness but still score the answers that were given fairly. Mention the abandonment in your improvements.`
        : "";

    const prompt = `
You are an expert interviewer evaluating ${isAbandoned ? "a partially completed (abandoned)" : "a completed"} interview. Here is the Q&A list:
${JSON.stringify(answersList, null, 2)}

Topics covered were: ${topics.join(', ')}.
${abandonedContext}

Provide a production-quality final evaluation. Be fair, evidence-based, and specific.
Return ONLY valid JSON (no markdown wrappers) matching:
{
  "communicationScore": number (0-10),
  "technicalScore": number (0-10),
  "confidenceScore": number (0-10),
  "overallScore": number (0-10),
  "strengths": ["Array of strings"],
  "improvements": ["Array of strings"]
}
`;

    try {
        // Use EVAL_MODEL for final evaluation (accuracy over speed here)
        const text = await generateContentText(prompt, {
            model: EVAL_MODEL,
            responseMimeType: "application/json",
            operation: "generateFinalEvaluation"
        });
        return parseJsonResponse(text, "generateFinalEvaluation");
    } catch (error) {
        console.error("Gemini Error:", error);
        return {
            communicationScore: 4,
            technicalScore: 4,
            confidenceScore: 4,
            overallScore: 4,
            strengths: ["Stayed engaged and completed the interview flow."],
            improvements: ["Provide more specific examples and structure each answer with clear outcomes."]
        };
    }
};

const geminiHelper = {
    extractTextFromPdf,
    analyzeResumeAndProfile,
    generateInterviewTopics,
    generateFirstQuestion,
    evaluateAndGenerateNextQuestion,
    evaluateAndGenerateNextQuestionWithCache,
    createInterviewCache,
    deleteInterviewCache,
    generateFinalEvaluation,
    analyzeResumesAgainstJob
};

export default geminiHelper;
