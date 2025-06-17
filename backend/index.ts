import * as gcp from "@pulumi/gcp";

const bucket = new gcp.storage.Bucket("my-bucket", {
  location: "us-central1",
});
