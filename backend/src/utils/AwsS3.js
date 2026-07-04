import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import {
    S3Client,
    DeleteObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    ...(process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY && {
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    }),
});

const s3Params = {
    Bucket: process.env.AWS_BUCKET_NAME || "",
};

const AwsS3 = {
    upload: (fileBody, remotePath, options = {}) => {
        return new Promise((resolve, reject) => {
            const parallelUploads3 = new Upload({
                client,
                params: {
                    Bucket: process.env.AWS_BUCKET_NAME || "",
                    Key: remotePath,
                    Body: fileBody,
                    ...(options.ContentType && { ContentType: options.ContentType }),
                },
            });

            parallelUploads3.done().then(
                (data) => {
                    const url = data?.Key || remotePath;
                    resolve({ url, data });
                },
                (err) => {
                    console.error("S3 Upload Error:", err);
                    reject(err.toString());
                }
            );
        });
    },

    deleteObject: (remotePath) => {
        return new Promise((resolve, reject) => {
            const params = { ...s3Params, Key: remotePath };
            const command = new DeleteObjectCommand(params);

            client
                .send(command)
                .then(() => resolve())
                .catch((err) => {
                    console.error("S3 Delete Error:", err);
                    reject(err);
                });
        });
    },

    deleteObjects: (remotePaths) => {
        return Promise.all(remotePaths.map((p) => AwsS3.deleteObject(p)));
    },

    getObject: async (objectKey) => {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME || "",
            Key: objectKey,
        });

        return client.send(command);
    },
};

export default AwsS3;