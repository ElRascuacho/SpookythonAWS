# Staged infra — CommitteeResultsBucket

Promote only with authorization. Separate from FrontendBucket/OAC.

## Up

- Bucket private: BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls, RestrictPublicBuckets.
- Versioning enabled.
- Lifecycle: expire noncurrent and current objects after 7 days (prefix `committee/`).
- Encryption SSE-S3 or SSE-KMS account default.
- IAM: worker `s3:PutObject`/`GetObject` on prefix; API `s3:GetObject` only; deny `s3:PutObjectAcl` public.

## Down

- Empty prefix (authorized) then delete bucket resource and IAM.
