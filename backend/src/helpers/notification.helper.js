import NotificationModel from "../db/mongodb/models/notification.model.js";

const createNotification = async ({
    userId,
    workspaceId = null,
    title,
    message,
    key = "general",
    data = {},
}) => {
    if (!userId || !title || !message) return null;

    return NotificationModel.create({
        userId,
        workspaceId,
        title,
        message,
        key,
        data,
    });
};

const notificationHelper = {
    createNotification,
};

export default notificationHelper;
