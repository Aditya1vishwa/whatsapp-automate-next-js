import AiUsageModel from "../../db/mongodb/models/aiUsage.model.js";
import { PROVIDER_COSTS } from "../../constant/pricing.js";

/**
 * Log AI usage without awaiting (fire and forget).
 * @param {Object} params
 * @param {string} params.provider - "gemini", "google_stt", "google_tts"
 * @param {string} params.operation - Function or operation name
 * @param {number} [params.inputTokens=0]
 * @param {number} [params.outputTokens=0]
 * @param {number} [params.cachedTokens=0]
 * @param {number} [params.totalTokens=0] - For Google STT (seconds) or TTS (characters)
 * @param {string} [params.interviewId]
 * @param {Object} [params.metadata]
 */
export const logAiUsage = (params) => {
    // Fire and forget, don't return a promise and wrap in try-catch
    setImmediate(async () => {
        try {
            let estimatedAmount = 0;

            if (params.provider === "gemini") {
                // Gemini 2.5 Flash: $0.30/1M input, $2.50/1M output, $0.075/1M cached
                const c = PROVIDER_COSTS.gemini_flash;
                estimatedAmount = (
                    ((params.inputTokens || 0) * c.inputPerToken) +
                    ((params.outputTokens || 0) * c.outputPerToken) +
                    ((params.cachedTokens || 0) * c.cachedPerToken)
                );
            } else if (params.provider === "google_stt") {
                // Enhanced STT: $0.036/min. params.totalTokens represents seconds of audio.
                estimatedAmount = (params.totalTokens || 0) * PROVIDER_COSTS.google_stt.perSecond;
            } else if (params.provider === "google_tts") {
                // Standard TTS: $4.00/1M characters. params.totalTokens represents characters.
                estimatedAmount = (params.totalTokens || 0) * PROVIDER_COSTS.google_tts.perCharacter;
            }

            const usage = new AiUsageModel({
                provider: params.provider,
                operation: params.operation,
                tokensConsumed: params.totalTokens || (params.inputTokens || 0) + (params.outputTokens || 0),
                inputTokens: params.inputTokens || 0,
                outputTokens: params.outputTokens || 0,
                cachedTokens: params.cachedTokens || 0,
                estimatedAmount: Number(estimatedAmount.toFixed(6)),
                interviewId: params.interviewId || undefined,
                metadata: params.metadata || {}
            });

            await usage.save();
        } catch (error) {
            console.error("❌ Failed to log AI usage:", error.message);
        }
    });
};
