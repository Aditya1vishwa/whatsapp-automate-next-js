import CreditModel from "../db/mongodb/models/credit.model.js";
import CreditUsageModel from "../db/mongodb/models/creditusage.model.js";

const ACTIVE_STATUSES = ["active", "consumed"];

const markExpiredCredits = async (userId) => {
    await CreditModel.updateMany(
        {
            userId,
            status: { $in: ACTIVE_STATUSES },
            expiryDate: { $lt: new Date() },
        },
        { $set: { status: "expired" } }
    );
};

const getAvailableCreditBuckets = async (userId, workspaceId = null) => {
    await markExpiredCredits(userId);

    const workspaceQuery = workspaceId
        ? { $or: [{ workspaceId }, { workspaceId: null }] }
        : {};

    const buckets = await CreditModel.find({
        userId,
        status: "active",
        expiryDate: { $gte: new Date() },
        ...workspaceQuery,
    }).sort({ expiryDate: 1, createdAt: 1 });

    return buckets.filter((bucket) => bucket.creditsAssigned - bucket.creditsUsed > 0);
};

const getUserCreditSummary = async (userId, workspaceId = null) => {
    const buckets = await getAvailableCreditBuckets(userId, workspaceId);

    const totalAssigned = buckets.reduce((acc, bucket) => acc + Number(bucket.creditsAssigned || 0), 0);
    const totalUsed = buckets.reduce((acc, bucket) => acc + Number(bucket.creditsUsed || 0), 0);
    const remainingCredits = Math.max(totalAssigned - totalUsed, 0);

    return {
        totalAssigned,
        totalUsed,
        remainingCredits,
        buckets,
    };
};

const ensureSufficientCredits = async ({ userId, workspaceId = null, neededCredits = 0 }) => {
    const summary = await getUserCreditSummary(userId, workspaceId);

    if (summary.remainingCredits < neededCredits) {
        return {
            ok: false,
            remainingCredits: summary.remainingCredits,
            neededCredits,
            message: `Insufficient credits. Needed ${neededCredits}, available ${summary.remainingCredits}.`,
        };
    }

    return {
        ok: true,
        remainingCredits: summary.remainingCredits,
        neededCredits,
        message: "Sufficient credits available.",
    };
};

const consumeCredits = async ({
    userId,
    workspaceId = null,
    amount,
    useFor = "other",
    refId = null,
    model = "",
    message = "",
    metadata = {},
}) => {
    console.log(`[CREDIT] Attempting to consume ${amount} credits for user ${userId}, workspace ${workspaceId || "N/A"}.`);
    const requiredAmount = Number(amount || 0);
    if (requiredAmount <= 0) {
        return {
            success: true,
            consumed: 0,
            records: [],
            message: "No credits consumed.",
        };
    }

    const availability = await ensureSufficientCredits({
        userId,
        workspaceId,
        neededCredits: requiredAmount,
    });

    if (!availability.ok) {
        return {
            success: false,
            consumed: 0,
            records: [],
            message: availability.message,
        };
    }

    const buckets = await getAvailableCreditBuckets(userId, workspaceId);
    let remaining = requiredAmount;
    const createdUsageRecords = [];

    for (const bucket of buckets) {
        if (remaining <= 0) break;

        const bucketRemaining = Math.max(Number(bucket.creditsAssigned || 0) - Number(bucket.creditsUsed || 0), 0);
        if (bucketRemaining <= 0) continue;

        const toConsume = Math.min(bucketRemaining, remaining);
        bucket.creditsUsed += toConsume;

        const newRemaining = bucket.creditsAssigned - bucket.creditsUsed;
        if (newRemaining <= 0) {
            bucket.status = "consumed";
        }

        await bucket.save();

        const usage = await CreditUsageModel.create({
            userId,
            workspaceId,
            creditId: bucket._id,
            useFor,
            refId,
            model,
            creditsUsed: toConsume,
            message,
            metadata,
        });

        createdUsageRecords.push(usage);
        remaining -= toConsume;
    }

    return {
        success: remaining <= 0,
        consumed: requiredAmount - remaining,
        records: createdUsageRecords,
        message: remaining <= 0 ? "Credits consumed successfully." : "Partial credit deduction done.",
    };
};

const addCredits = async ({
    userId,
    workspaceId = null,
    assignedType = "admin",
    assignedBy = null,
    creditsAssigned,
    expiryDate,
    sourceLabel = "",
    status = "active",
    metadata = {},
}) => {
    const finalAssigned = Number(creditsAssigned || 0);

    if (finalAssigned <= 0) {
        throw new Error("creditsAssigned must be greater than 0");
    }

    return CreditModel.create({
        userId,
        workspaceId,
        assignedType,
        assignedBy,
        creditsAssigned: finalAssigned,
        creditsUsed: 0,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        sourceLabel,
        status,
        metadata,
    });
};

const creditHelper = {
    getUserCreditSummary,
    ensureSufficientCredits,
    consumeCredits,
    addCredits,
};

export default creditHelper;
