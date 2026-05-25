import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: "https://62acddd50a118cadfb8520cfdc657cbc.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "3692aa5cb84987117a942b6b3b89c64f",
    secretAccessKey: "d3501d0368ef6d35f767a51097d84bf8e04e1fabfae16b999fca2bd9b8d78455",
  },
  forcePathStyle: true,
});

try {
  const result = await s3.send(new ListObjectsV2Command({ Bucket: "todo-app-storage", MaxKeys: 5 }));
  console.log("SUCCESS! Connection to R2 works.");
  console.log("Objects:", result.Contents?.length || 0);
  process.exit(0);
} catch (e) {
  console.log("FAILED:", e.message);
  process.exit(1);
}
